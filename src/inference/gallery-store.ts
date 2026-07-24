/**
 * Gallery store — the live memory of the exhibit floor.
 *
 * The curator prompt (see `prompts.ts`) does not re-send the whole gallery each
 * call; it emits *ops* against a standing gallery: `create` a new exhibit,
 * `refresh` one that aged but is still true, `retire` one that stopped
 * mattering. This store holds the current `ExhibitArtifact` map, applies those
 * ops, and tracks the lifecycle fields the model does not own — event stamps,
 * status transitions, and staleness — so two things can read a coherent
 * gallery: the renderer (what to show on the floor) and the next context packet
 * (THE GALLERY section fed back as the curator's memory).
 *
 * Design (see `docs/plans/plan-exhibit-floor.md`):
 *
 * - **The store owns status, not the model.** A created exhibit is `fresh`;
 *   surviving to the *next* packet promotes it to `active`; ageing past its
 *   decay budget marks it `stale`; a retire op marks it `retired`. Retired
 *   artifacts are kept (not deleted) so the archive shelf can render them with
 *   their retirement reason.
 * - **`create` vs `refresh`.** Both replace by id. `create` (re)starts an
 *   exhibit as `fresh` and stamps `createdAtEvent`; `refresh` keeps the
 *   original `createdAtEvent`, re-stamps `refreshedAtEvent`, and returns the
 *   exhibit to `active`. A refresh of an unknown id is tolerated as a create;
 *   a create colliding with an existing id resets that exhibit.
 * - **Staleness is dual-gated** by `decayClass`: an exhibit goes `stale` once
 *   it has been un-refreshed for either N events *or* M minutes, whichever
 *   comes first (see {@link STALENESS_THRESHOLDS}). Event-age keeps fast-moving
 *   sessions honest; wall-minute-age keeps a stalled session from freezing a
 *   stale exhibit as forever-active. A refresh un-stales.
 */
import type {
  DecayClass,
  ExhibitArtifact,
  ExhibitStatus,
} from '../renderer/exhibits/types';

/** One create/refresh/retire instruction from a parsed curator response. */
export type GalleryOp =
  | { op: 'create'; artifact: ExhibitArtifact }
  | { op: 'refresh'; artifact: ExhibitArtifact }
  | { op: 'retire'; artifactId: string; reason: string };

/** Event-count and wall-minute thresholds after which an exhibit goes stale. */
export interface DecayThreshold {
  /** Events since last refresh before the exhibit is stale. */
  events: number;
  /** Wall-clock minutes since last refresh before the exhibit is stale. */
  minutes: number;
}

/**
 * Staleness budgets per decay class. Deliberately generous on events and
 * tighter on minutes: `fast` incident/stall exhibits should visibly age within
 * a few minutes even if the transcript is quiet, while `slow` structural
 * exhibits (concern_snapshot, thermal_map) can ride a long session. Tuned for
 * the curator cadence (fewer, bigger calls — trigger floor 25 events / 120s),
 * so a `fast` exhibit stales after roughly one skipped curator call.
 */
export const STALENESS_THRESHOLDS: Record<DecayClass, DecayThreshold> = {
  fast: { events: 15, minutes: 3 },
  medium: { events: 40, minutes: 12 },
  slow: { events: 100, minutes: 45 },
};

/** Outcome of applying a batch of ops — counts + ids, for logs/reports. */
export interface GalleryApplyResult {
  created: string[];
  refreshed: string[];
  retired: string[];
  /** Ops that named nothing actionable (e.g. retire of an unknown id). */
  ignored: number;
}

export interface GalleryStore {
  /**
   * Apply a batch of curator ops as of event index `atEvent` (the number of
   * events observed when the response was produced) and wall-clock `nowMs`.
   * Promotes surviving `fresh` exhibits to `active`, applies the ops, then
   * recomputes staleness.
   */
  applyOps(ops: GalleryOp[], atEvent: number, nowMs?: number): GalleryApplyResult;
  /** Every artifact, including retired, most-relevant first (retired last). */
  getArtifacts(): ExhibitArtifact[];
  /** Non-retired artifacts (fresh/active/stale), most-relevant first. */
  getActive(): ExhibitArtifact[];
  /** Retired artifacts, kept for the archive shelf. */
  getRetired(): ExhibitArtifact[];
  /** id + reason for every retire seen this session (for the packet feedback). */
  getRetiredSummaries(): Array<{ id: string; reason: string }>;
  /** Recompute staleness without applying ops (e.g. before building a packet). */
  refreshStaleness(atEvent: number, nowMs?: number): void;
  /** Total artifact count (including retired). */
  size(): number;
}

interface StoredEntry {
  artifact: ExhibitArtifact;
  /** Wall-clock ms when this exhibit was last created/refreshed. */
  refreshedAtMs: number;
}

function isAged(
  decayClass: DecayClass,
  refreshedAtEvent: number,
  refreshedAtMs: number,
  atEvent: number,
  nowMs: number
): boolean {
  const threshold = STALENESS_THRESHOLDS[decayClass];
  const eventAge = atEvent - refreshedAtEvent;
  const minuteAge = (nowMs - refreshedAtMs) / 60_000;
  return eventAge >= threshold.events || minuteAge >= threshold.minutes;
}

export function createGalleryStore(): GalleryStore {
  const entries = new Map<string, StoredEntry>();
  // Insertion order of ids retired this session, so feedback is stable.
  const retiredReasons = new Map<string, string>();

  const setStatus = (id: string, status: ExhibitStatus): void => {
    const entry = entries.get(id);
    if (entry) {
      entry.artifact = { ...entry.artifact, status };
    }
  };

  const refreshStaleness = (atEvent: number, nowMs: number): void => {
    for (const entry of entries.values()) {
      const { artifact, refreshedAtMs } = entry;
      // Retired is terminal; fresh has not survived a packet yet, so it is not
      // subject to staleness until it is promoted.
      if (artifact.status === 'retired' || artifact.status === 'fresh') {
        continue;
      }
      const aged = isAged(
        artifact.decayClass,
        artifact.refreshedAtEvent ?? artifact.createdAtEvent,
        refreshedAtMs,
        atEvent,
        nowMs
      );
      setStatus(artifact.id, aged ? 'stale' : 'active');
    }
  };

  const upsert = (
    incoming: ExhibitArtifact,
    atEvent: number,
    nowMs: number,
    mode: 'create' | 'refresh'
  ): void => {
    const existing = entries.get(incoming.id);
    const createdAtEvent =
      mode === 'refresh' && existing ? existing.artifact.createdAtEvent : atEvent;
    // create → fresh (a new or reset exhibit); refresh of a known id → active;
    // refresh of an unknown id is tolerated as a create (fresh).
    const status: ExhibitStatus = mode === 'refresh' && existing ? 'active' : 'fresh';
    const artifact: ExhibitArtifact = {
      ...incoming,
      createdAtEvent,
      refreshedAtEvent: atEvent,
      status,
      // A refreshed/recreated id sheds any prior retirement.
      retirementReason: undefined,
    } as ExhibitArtifact;
    entries.set(incoming.id, { artifact, refreshedAtMs: nowMs });
    retiredReasons.delete(incoming.id);
  };

  return {
    applyOps(ops, atEvent, nowMs = Date.now()) {
      const result: GalleryApplyResult = { created: [], refreshed: [], retired: [], ignored: 0 };

      // 1. Survivors of the previous packet graduate fresh → active.
      for (const entry of entries.values()) {
        if (entry.artifact.status === 'fresh') {
          setStatus(entry.artifact.id, 'active');
        }
      }

      // 2. Apply ops.
      for (const op of ops) {
        if (op.op === 'create') {
          upsert(op.artifact, atEvent, nowMs, 'create');
          result.created.push(op.artifact.id);
        } else if (op.op === 'refresh') {
          const known = entries.has(op.artifact.id);
          upsert(op.artifact, atEvent, nowMs, 'refresh');
          (known ? result.refreshed : result.created).push(op.artifact.id);
        } else {
          const entry = entries.get(op.artifactId);
          if (!entry) {
            result.ignored += 1;
            // Still record the reason so the packet does not re-suggest it.
            retiredReasons.set(op.artifactId, op.reason);
            continue;
          }
          entry.artifact = {
            ...entry.artifact,
            status: 'retired',
            retirementReason: op.reason,
          };
          retiredReasons.set(op.artifactId, op.reason);
          result.retired.push(op.artifactId);
        }
      }

      // 3. Recompute staleness against the new event/time position.
      refreshStaleness(atEvent, nowMs);
      return result;
    },

    getArtifacts() {
      return [...entries.values()]
        .map((e) => e.artifact)
        .sort((a, b) => {
          const ar = a.status === 'retired' ? 1 : 0;
          const br = b.status === 'retired' ? 1 : 0;
          if (ar !== br) return ar - br;
          return b.relevance - a.relevance;
        });
    },

    getActive() {
      return [...entries.values()]
        .map((e) => e.artifact)
        .filter((a) => a.status !== 'retired')
        .sort((a, b) => b.relevance - a.relevance);
    },

    getRetired() {
      return [...entries.values()].map((e) => e.artifact).filter((a) => a.status === 'retired');
    },

    getRetiredSummaries() {
      return [...retiredReasons.entries()].map(([id, reason]) => ({ id, reason }));
    },

    refreshStaleness(atEvent, nowMs = Date.now()) {
      refreshStaleness(atEvent, nowMs);
    },

    size() {
      return entries.size;
    },
  };
}
