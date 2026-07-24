/**
 * Deterministic replay runner (plan-codex-replay.md, decision D3).
 *
 * Replays a captured harness session — raw transcript or normalized
 * `.replay.jsonl` — through the real capture → derive → trigger → (optional)
 * inference pipeline on a *virtual clock*, then answers the two questions the
 * plan poses: is interpretation fast enough, and does it say the right things
 * at the right times?
 *
 * Determinism comes from the virtual clock (src/shared/clock.ts). It drives
 * both event release *and* the inference trigger's time gate + debounce, so the
 * sequence of trigger firings is identical at every `--speed`. Wall-clock time
 * only controls how long the runner sleeps between events (`delta / speed`);
 * at speed 0 it never sleeps, yet virtual time still advances by the event
 * timestamps, so the firing sequence is unchanged.
 *
 * In `--infer live` the provider call runs on wall-clock time while virtual
 * time keeps advancing, so the report can measure how *stale* an insight is
 * (virtual minutes between the trigger firing and the insight landing) — the
 * latency-budget question from the plan.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { CanonicalEvent, DerivedState, ShadowInsight } from '../shared/schema';
import { createVirtualClock } from '../shared/clock';
import { deriveState } from '../shared/derive';
import { detectReplayFormat, parseReplay, serializeEvents } from '../shared/replay-store';
import { createEventBuffer } from '../capture/event-buffer';
import { createIncrementalParser, type ParsedEntry } from '../capture/incremental-parser';
import { driverRegistry } from '../capture/drivers';
import type { HarnessDriver } from '../capture/drivers/harness-driver';
import {
  createInferenceTrigger,
  type TriggerConfig,
  type TriggerReason,
} from '../inference/trigger';
import { buildContextPacket } from '../inference/context-packager';
import { buildInferenceRequest } from '../inference/prompt-builder';
import { parseCuratorResponse } from '../inference/response-parser';
import { createGalleryStore } from '../inference/gallery-store';
import { createInferenceClient } from '../inference/inference-client-factory';
import type { InferenceClient } from '../inference/inference-client';
import type { ExhibitArtifact } from '../renderer/exhibits/types';
import { createLogger, type Logger } from '../shared/logger';

export type InferMode = 'none' | 'live';

export interface ReplayOptions {
  /** Path to a raw transcript or `.replay.jsonl`. Mutually exclusive with `events`. */
  filePath?: string;
  /** Pre-normalized CanonicalEvents (used by tests / programmatic callers). */
  events?: CanonicalEvent[];
  /** Force a driver for raw transcripts; sniffed when omitted. */
  driver?: 'codex' | 'claude-code';
  /** Replay speed multiplier. 60 = 60× (default), 1 = real time, 0 = as-fast-as-possible. */
  speed?: number;
  /** Inference mode. `none` = deriveState heuristics only; `live` = real provider chain. */
  infer?: InferMode;
  title?: string;
  triggerConfig?: Partial<TriggerConfig>;
  /** Write normalized CanonicalEvents (loadable by the Electron replay path) here. */
  exportReplayPath?: string;
  /** Write the JSON report here. */
  reportPath?: string;
  /** Write the final curator gallery (JSON array of ExhibitArtifact) here. */
  galleryOutPath?: string;
  /** Injected client for tests; live mode uses the provider chain when absent. */
  inferenceClient?: InferenceClient;
  logger?: Logger;
}

export interface TriggerRecord {
  seq: number;
  reason: TriggerReason;
  /** Virtual session time (ms since epoch) when the trigger fired. */
  virtualTimeMs: number;
  virtualTimeUtc: string;
  /** Count of events released when the trigger fired. */
  eventIndex: number;
  /** Wall-clock latency of the inference call (0 for heuristic `none` mode). */
  wallLatencyMs: number;
  /** Virtual session time when the insight landed. */
  insightVirtualTimeMs: number;
  /** insightVirtualTimeMs − virtualTimeMs: how stale the insight is, in virtual ms. */
  stalenessVirtualMs: number;
  /** Events released between firing and insight landing (live latency signal). */
  eventsBehind: number;
  phase: string;
  risks: string[];
  insightSummaries: string[];
  /** Per-firing curator gallery ops: counts + affected artifact ids. */
  galleryOps?: {
    create: number;
    refresh: number;
    retire: number;
    ids: string[];
  };
  /** True when a live inference was already in flight and this firing was coalesced. */
  coalesced?: boolean;
  error?: string;
}

export interface CheckpointResult {
  id: string;
  label: string;
  groundTruthUtc: string;
  groundTruthVirtualMs: number;
  surfaced: boolean;
  firstInsightVirtualMs: number | null;
  firstInsightUtc: string | null;
  /** groundTruth − firstInsight, in virtual minutes. Positive = surfaced early (lead). */
  leadMinutes: number | null;
  matchedBy: string | null;
}

export interface ReplayReport {
  meta: {
    input: string;
    sessionId: string;
    driver: string;
    speed: number;
    infer: InferMode;
    events: number;
    startVirtualUtc: string | null;
    endVirtualUtc: string | null;
    durationVirtualMinutes: number;
  };
  determinismHash: string;
  triggers: TriggerRecord[];
  aggregates: {
    events: number;
    triggersFired: number;
    inferCalls: number;
    latencyMs: { p50: number; p95: number; max: number };
    eventsBehind: { p50: number; p95: number; max: number };
    bufferDepthMax: number;
  };
  checkpoints: CheckpointResult[];
  /** The final exhibit-floor gallery the curator authored (empty in `none` mode). */
  gallery: ExhibitArtifact[];
}

/** One (virtual time, insight) observation, fed to the checkpoint scorer. */
export interface InsightObservation {
  virtualMs: number;
  insight: ShadowInsight;
}

export interface Checkpoint {
  id: string;
  label: string;
  /** The human-verified UTC moment this checkpoint occurred (from fixture timestamps). */
  groundTruthUtc: string;
  /** Does this insight surface the checkpoint? Matches over summary text / kind. */
  match: (insight: ShadowInsight) => boolean;
}

const hasWord = (haystack: string, ...words: string[]): boolean =>
  words.some((w) => haystack.includes(w));

/**
 * The four ground-truth checkpoints for the homelab-coordinator fixture, with
 * their UTC moments taken from the fixture's own timestamps (see the
 * ground-truth companion doc):
 *   - the scope-drift turn_aborted at 12:54Z,
 *   - the plan pivot (user reorients to a databases-only plan) at 13:39Z,
 *     reinforced by "Implement the plan." at 14:04Z,
 *   - the GHCR-403 stall — repeated near-identical web searches, 16:12–16:26Z,
 *   - the final task_complete at 16:48Z that reports done while work is NOT done.
 */
export const DEFAULT_CHECKPOINTS: Checkpoint[] = [
  {
    id: 'scope_drift_abort',
    label: 'Scope-drift turn aborted (~12:54Z)',
    groundTruthUtc: '2026-07-23T12:54:24.326Z',
    match: (i) =>
      hasWord(
        i.summary.toLowerCase(),
        'abort',
        'drift',
        'off track',
        'off-track',
        'derail',
        'interrupted the turn',
      ),
  },
  {
    id: 'plan_pivot',
    label: 'Pivot to databases-only plan (13:39Z → 14:04Z)',
    groundTruthUtc: '2026-07-23T13:39:12.004Z',
    match: (i) => {
      const s = i.summary.toLowerCase();
      if (hasWord(s, 're-plan', 'replan', 'new plan', 'pivot', 'databases-only', 'database-only')) {
        return true;
      }
      return s.includes('plan') && hasWord(s, 'database');
    },
  },
  {
    id: 'ghcr_stall',
    label: 'GHCR-403 repeated-search stall (16:12–16:26Z)',
    groundTruthUtc: '2026-07-23T16:12:10.188Z',
    match: (i) =>
      hasWord(
        i.summary.toLowerCase(),
        'repeated near-identical',
        'repeated search',
        'stuck retrying',
        'retrying the same',
        'same lookup',
        'ghcr',
        '403',
      ),
  },
  {
    id: 'final_not_done',
    label: 'Final task_complete but work NOT done (16:48Z)',
    groundTruthUtc: '2026-07-23T16:48:41.750Z',
    match: (i) =>
      hasWord(
        i.summary.toLowerCase(),
        'not done',
        'incomplete',
        'unfinished',
        'not deployed',
        'not started',
        'undeployed',
        'not complete',
        'still not',
        'prematurely',
        'false completion',
      ),
  },
];

/**
 * Pure checkpoint scorer: for each checkpoint, find the earliest observed
 * insight that matches it and report lead/lag (in virtual minutes) versus the
 * human ground-truth moment. Exported for unit testing with synthetic insights.
 *
 * `objective`-kind insights are excluded from matching: in heuristic mode the
 * objective is a verbatim echo of the user's stated goal, so counting it as the
 * interpreter "surfacing" a checkpoint would falsely credit a detection at
 * t=0. Checkpoints must be surfaced by the interpreter's *analytical* insights
 * (phase / risk / next_move / attention / summary), which is exactly what live
 * inference is expected to add over the heuristics.
 */
export function scoreCheckpoints(
  checkpoints: Checkpoint[],
  observations: InsightObservation[],
): CheckpointResult[] {
  const ordered = [...observations]
    .filter((o) => o.insight.kind !== 'objective')
    .sort((a, b) => a.virtualMs - b.virtualMs);
  return checkpoints.map((cp) => {
    const groundTruthVirtualMs = Date.parse(cp.groundTruthUtc);
    const hit = ordered.find((o) => cp.match(o.insight));
    if (!hit) {
      return {
        id: cp.id,
        label: cp.label,
        groundTruthUtc: cp.groundTruthUtc,
        groundTruthVirtualMs,
        surfaced: false,
        firstInsightVirtualMs: null,
        firstInsightUtc: null,
        leadMinutes: null,
        matchedBy: null,
      };
    }
    return {
      id: cp.id,
      label: cp.label,
      groundTruthUtc: cp.groundTruthUtc,
      groundTruthVirtualMs,
      surfaced: true,
      firstInsightVirtualMs: hit.virtualMs,
      firstInsightUtc: new Date(hit.virtualMs).toISOString(),
      leadMinutes: (groundTruthVirtualMs - hit.virtualMs) / 60_000,
      matchedBy: hit.insight.summary,
    };
  });
}

// ---------------------------------------------------------------------------
// Loading + driver routing
// ---------------------------------------------------------------------------

const CODEX_TOP_TYPES = new Set(['session_meta', 'response_item', 'event_msg', 'turn_context', 'compacted']);

function sniffDriverId(raw: string): 'codex' | 'claude-code' {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 25);
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (typeof parsed.type === 'string' && CODEX_TOP_TYPES.has(parsed.type)) {
        return 'codex';
      }
    } catch {
      // ignore non-JSON prelude lines
    }
  }
  return 'claude-code';
}

function extractCodexSessionId(raw: string, fallback: string): string {
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('session_meta')) continue;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (parsed.type !== 'session_meta') continue;
      const payload = (parsed.payload ?? {}) as Record<string, unknown>;
      const id = payload.session_id ?? payload.id;
      if (typeof id === 'string' && id.length > 0) return id;
    } catch {
      // keep scanning
    }
  }
  return fallback;
}

interface LoadedEvents {
  events: CanonicalEvent[];
  sessionId: string;
  driverId: string;
}

function dominantHarnessId(events: CanonicalEvent[]): string {
  const counts = new Map<string, number>();
  for (const e of events) {
    const id = e.harnessId ?? e.source;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let best = 'replay';
  let max = 0;
  for (const [id, n] of counts) {
    if (n > max) {
      best = id;
      max = n;
    }
  }
  return best;
}

/**
 * Load and normalize a transcript/replay file into CanonicalEvents. A
 * `.replay.jsonl` is parsed directly (already normalized); a raw transcript is
 * routed through the incremental parser and the chosen driver's normalizer —
 * the same deterministic-ID path the live capture layer uses.
 */
export function loadEvents(raw: string, source: string, driverOverride?: 'codex' | 'claude-code'): LoadedEvents {
  const fallbackSessionId = path.basename(source).replace(/\.[^.]+$/, '') || 'replay-session';

  if (detectReplayFormat(raw) === 'replay') {
    const events = parseReplay(raw);
    return { events, sessionId: events[0]?.sessionId ?? fallbackSessionId, driverId: dominantHarnessId(events) };
  }

  const driverId = driverOverride ?? sniffDriverId(raw);
  const driver: HarnessDriver = driverRegistry.get(driverId) ?? driverRegistry.getDefault();
  const sessionId =
    driverId === 'codex' ? extractCodexSessionId(raw, fallbackSessionId) : fallbackSessionId;
  const driverSource = driver.sources[0];

  const events: CanonicalEvent[] = [];
  const parser = createIncrementalParser((entry: ParsedEntry) => {
    for (const event of driver.normalizeEntry(entry, sessionId, driverSource)) {
      events.push(event);
    }
  });
  parser.push(raw);
  parser.push('\n'); // flush any trailing line held in the parser buffer
  return { events, sessionId, driverId: driver.id };
}

// ---------------------------------------------------------------------------
// Report helpers
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarizeMetric(values: number[]): { p50: number; p95: number; max: number } {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted.length ? sorted[sorted.length - 1] : 0,
  };
}

/** Max characters kept per insight summary in the report (keeps it readable). */
const SUMMARY_PREVIEW_LIMIT = 200;

function insightSummaries(insights: ShadowInsight[]): string[] {
  return insights.map((i) => {
    const oneLine = i.summary.replace(/\s+/g, ' ').trim();
    const preview =
      oneLine.length > SUMMARY_PREVIEW_LIMIT ? `${oneLine.slice(0, SUMMARY_PREVIEW_LIMIT)}…` : oneLine;
    return `${i.kind}: ${preview}`;
  });
}

function virtualMsOf(event: CanonicalEvent): number {
  const parsed = Date.parse(event.timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function realWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runReplay(options: ReplayOptions): Promise<ReplayReport> {
  const logger = options.logger ?? createLogger({ minLevel: 'warn' });
  const speed = options.speed ?? 60;
  const inferMode: InferMode = options.infer ?? 'none';
  const title = options.title ?? 'Replayed session';

  // --- load ----------------------------------------------------------------
  let loaded: LoadedEvents;
  let inputLabel: string;
  if (options.events) {
    loaded = {
      events: options.events,
      sessionId: options.events[0]?.sessionId ?? 'synthetic',
      driverId: dominantHarnessId(options.events),
    };
    inputLabel = '<in-memory events>';
  } else if (options.filePath) {
    const raw = await readFile(options.filePath, 'utf8');
    loaded = loadEvents(raw, options.filePath, options.driver);
    inputLabel = options.filePath;
  } else {
    throw new Error('runReplay requires either `events` or `filePath`.');
  }

  const { events, sessionId, driverId } = loaded;

  // --- virtual clock + buffer + trigger ------------------------------------
  const clock = createVirtualClock(events.length ? virtualMsOf(events[0]) : 0);
  const buffer = createEventBuffer({
    // Keep everything in memory (no spill) so the runner reads a stable,
    // untouched event window and the run stays byte-deterministic.
    memoryCapacity: Math.max(1, events.length + 16),
    totalCapacity: Math.max(1, events.length + 16),
    sessionId: `replay-${sessionId}-${process.pid}-${Date.now()}`,
    persistenceRoot: path.join(os.tmpdir(), 'shadow-agent-replay-runner'),
  });

  const released: CanonicalEvent[] = [];
  const triggerFirings: Array<{ eventIndex: number; reason: TriggerReason }> = [];
  const triggerRecords: TriggerRecord[] = [];
  const observations: InsightObservation[] = [];
  // The curator's gallery accumulates across firings, fed back into each packet
  // (its memory) and serialized into the report at the end.
  const galleryStore = createGalleryStore();
  let bufferDepthMax = 0;
  let seq = 0;

  // Live-mode single-in-flight inference with one coalesced slot (mirrors the
  // shadow engine's concurrency contract).
  let client: InferenceClient | null = null;
  let inflight = false;
  let queued: TriggerRecord | null = null;
  const inflightPromises: Array<Promise<void>> = [];

  const recordHeuristic = (record: TriggerRecord, state: DerivedState, firedVirtualMs: number) => {
    record.wallLatencyMs = 0;
    record.insightVirtualTimeMs = firedVirtualMs;
    record.stalenessVirtualMs = 0;
    record.eventsBehind = 0;
    record.phase = state.activePhase;
    record.risks = state.riskSignals;
    record.insightSummaries = insightSummaries(state.shadowInsights);
    for (const insight of state.shadowInsights) {
      observations.push({ virtualMs: firedVirtualMs, insight });
    }
  };

  const startLiveInference = (record: TriggerRecord) => {
    if (!client) return;
    inflight = true;
    const snapshot = released.slice();
    const state = deriveState(snapshot, title);
    // Feed the accumulated gallery back in as the curator's memory.
    galleryStore.refreshStaleness(snapshot.length);
    const packet = buildContextPacket(state, snapshot, {
      gallery: galleryStore.getActive(),
      retiredGallery: galleryStore.getRetiredSummaries(),
    });
    const request = buildInferenceRequest(packet, {
      delivery: 'off-host',
      privacy: { allowRawTranscriptStorage: true, allowOffHostInference: true },
    });
    const dispatchEventIndex = released.length;
    const wallStart = Date.now();
    const activeClient = client;
    const promise = activeClient
      .infer(request)
      .then((response) => {
        const { insights, galleryOps } = parseCuratorResponse(response.text);
        const applied = galleryStore.applyOps(galleryOps, released.length);
        const landVirtualMs = clock.now();
        record.wallLatencyMs = Date.now() - wallStart;
        record.insightVirtualTimeMs = landVirtualMs;
        record.stalenessVirtualMs = landVirtualMs - record.virtualTimeMs;
        record.eventsBehind = released.length - dispatchEventIndex;
        record.phase = state.activePhase;
        record.risks = state.riskSignals;
        record.insightSummaries = insightSummaries(insights);
        record.galleryOps = {
          create: applied.created.length,
          refresh: applied.refreshed.length,
          retire: applied.retired.length,
          ids: [...applied.created, ...applied.refreshed, ...applied.retired],
        };
        for (const insight of insights) {
          observations.push({ virtualMs: landVirtualMs, insight });
        }
      })
      .catch((err: unknown) => {
        record.error = err instanceof Error ? err.message : String(err);
        logger.error('inference', 'replay.live_infer_error', { error: err });
      })
      .finally(() => {
        inflight = false;
        if (queued) {
          const next = queued;
          queued = null;
          startLiveInference(next);
        }
      });
    inflightPromises.push(promise);
  };

  const onTrigger = (reason: TriggerReason) => {
    const firedVirtualMs = clock.now();
    const eventIndex = released.length;
    triggerFirings.push({ eventIndex, reason });

    const record: TriggerRecord = {
      seq: seq++,
      reason,
      virtualTimeMs: firedVirtualMs,
      virtualTimeUtc: new Date(firedVirtualMs).toISOString(),
      eventIndex,
      wallLatencyMs: 0,
      insightVirtualTimeMs: firedVirtualMs,
      stalenessVirtualMs: 0,
      eventsBehind: 0,
      phase: '',
      risks: [],
      insightSummaries: [],
    };
    triggerRecords.push(record);

    if (inferMode === 'none' || !client) {
      const state = deriveState(released.slice(), title);
      recordHeuristic(record, state, firedVirtualMs);
      return;
    }

    // live
    if (inflight) {
      if (queued) queued.coalesced = true;
      queued = record;
      return;
    }
    startLiveInference(record);
  };

  const trigger = createInferenceTrigger(onTrigger, options.triggerConfig, clock);

  const unsubscribe = buffer.subscribe((batch) => {
    trigger.onEvents(batch);
  });

  if (inferMode === 'live') {
    client = options.inferenceClient ?? (await createInferenceClient());
    if (!client) {
      logger.warn('inference', 'replay.no_live_client', {
        message: 'No inference client available; falling back to heuristics.',
      });
    }
  }

  // --- pacing loop ---------------------------------------------------------
  let prevMs = events.length ? virtualMsOf(events[0]) : 0;
  for (const event of events) {
    const ms = Math.max(virtualMsOf(event), prevMs); // clamp non-decreasing
    if (speed > 0) {
      const waitMs = (ms - prevMs) / speed;
      if (waitMs > 0) await realWait(waitMs);
    }
    // Advance virtual time to this event *first* so any debounced trigger
    // scheduled by earlier events fires at its correct virtual moment, before
    // this event is counted as released.
    clock.advanceTo(ms);
    released.push(event);
    await buffer.push([event]);
    const depth = buffer.getMetrics().totalDepth;
    if (depth > bufferDepthMax) bufferDepthMax = depth;
    prevMs = ms;
  }

  // Flush any still-pending debounce so a final normal-condition trigger fires.
  clock.drain();

  // Wait for live inference (in-flight + one coalesced slot) to settle.
  while (inflightPromises.length > 0) {
    const pending = inflightPromises.splice(0, inflightPromises.length);
    await Promise.allSettled(pending);
  }

  trigger.stop();
  unsubscribe();
  await buffer.clear();

  // --- report --------------------------------------------------------------
  const inferCalls = triggerRecords.filter((r) => !r.coalesced).length;
  const latencyValues = triggerRecords.filter((r) => !r.coalesced).map((r) => r.wallLatencyMs);
  const eventsBehindValues = triggerRecords.filter((r) => !r.coalesced).map((r) => r.eventsBehind);

  const startVirtualMs = events.length ? virtualMsOf(events[0]) : null;
  const endVirtualMs = events.length ? Math.max(...events.map(virtualMsOf)) : null;

  const hashInput =
    events.map((e) => e.id).join('\n') +
    '\n@@TRIGGERS@@\n' +
    triggerFirings.map((t) => `${t.eventIndex}:${t.reason}`).join(',');
  const determinismHash = `sha256:${createHash('sha256').update(hashInput).digest('hex')}`;

  const report: ReplayReport = {
    meta: {
      input: inputLabel,
      sessionId,
      driver: driverId,
      speed,
      infer: inferMode,
      events: events.length,
      startVirtualUtc: startVirtualMs !== null ? new Date(startVirtualMs).toISOString() : null,
      endVirtualUtc: endVirtualMs !== null ? new Date(endVirtualMs).toISOString() : null,
      durationVirtualMinutes:
        startVirtualMs !== null && endVirtualMs !== null
          ? (endVirtualMs - startVirtualMs) / 60_000
          : 0,
    },
    determinismHash,
    triggers: triggerRecords,
    aggregates: {
      events: events.length,
      triggersFired: triggerFirings.length,
      inferCalls,
      latencyMs: summarizeMetric(latencyValues),
      eventsBehind: summarizeMetric(eventsBehindValues),
      bufferDepthMax,
    },
    checkpoints: scoreCheckpoints(DEFAULT_CHECKPOINTS, observations),
    gallery: galleryStore.getArtifacts(),
  };

  // --- side outputs --------------------------------------------------------
  if (options.exportReplayPath) {
    const serialized = serializeEvents(
      events,
      { storeRawTranscript: true },
      { allowRawTranscriptStorage: true, allowOffHostInference: false },
    );
    await writeFile(options.exportReplayPath, `${serialized}\n`, 'utf8');
  }
  if (options.reportPath) {
    await writeFile(options.reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  if (options.galleryOutPath) {
    await writeFile(options.galleryOutPath, `${JSON.stringify(report.gallery, null, 2)}\n`, 'utf8');
  }

  return report;
}
