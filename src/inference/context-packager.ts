/**
 * Context packager: builds a ShadowContextPacket from DerivedState + recent events.
 *
 * Uses the ShadowContextPacket type defined in prompt-builder.ts (the canonical shape for inference).
 * Total context budget: ~10,000 tokens. Truncates from the front — recent events are more valuable.
 */
import type { CanonicalEvent, DerivedState } from '../shared/schema';
import type { ExhibitArtifact } from '../renderer/exhibits/types';
import type { GalleryPacketEntry, ShadowContextPacket } from './prompt-builder';

const MAX_RECENT_EVENTS = 30;
const MAX_TOOL_HISTORY = 20;
const MAX_TRANSCRIPT_TURNS = 10;
const MAX_FILE_ATTENTION = 15;
const MAX_CONTEXT_TOKENS = 10_000;
/**
 * THE GALLERY competes with transcript detail for packet space. Cap it at 15%
 * of the token budget: over that, drop payload summaries (envelopes only), then
 * drop the least-relevant exhibits until it fits. Retired-line feedback is kept
 * regardless — it is one cheap line each and prevents recreating retired work.
 */
const GALLERY_BUDGET_FRACTION = 0.15;

function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 4);
}

/** One-line payload summary per exhibit type, for THE GALLERY section. */
function payloadSummary(artifact: ExhibitArtifact): string {
  switch (artifact.exhibitType) {
    case 'relationship_dag': {
      const p = artifact.payload;
      return `${p.nodes.length} nodes, ${p.edges.length} edges, focus: ${p.focusNodeId}`;
    }
    case 'activity_narrative': {
      const p = artifact.payload;
      const threads = p.threads.map((t) => t.label).join(', ');
      return `${p.beats.length} beats across threads: ${threads}`;
    }
    case 'walkthrough': {
      const p = artifact.payload;
      return `${p.headline} — ${p.satellites.length} satellites, ${p.files.length} files`;
    }
    case 'concern_snapshot': {
      const p = artifact.payload;
      return `${p.concerns.length} concerns, ${p.flows.length} flows`;
    }
    case 'momentum': {
      const p = artifact.payload;
      return `gauge ${p.value} (${p.label}), ${p.next.length} next moves`;
    }
    case 'seismograph': {
      const p = artifact.payload;
      return `${p.trace.length} tremors over ${p.windowMinutes}min`;
    }
    case 'thermal_map': {
      const p = artifact.payload;
      return `${p.cells.length} cells, hottest ${p.hottest.path}`;
    }
    case 'live_graph':
      return 'live agent topology';
    default:
      return '';
  }
}

function toEnvelopeEntry(artifact: ExhibitArtifact): GalleryPacketEntry {
  return {
    id: artifact.id,
    exhibitType: artifact.exhibitType,
    title: artifact.title,
    narrative: artifact.narrative,
    relevance: artifact.relevance,
    decayClass: artifact.decayClass,
    status: artifact.status,
    createdAtEvent: artifact.createdAtEvent,
    ...(artifact.refreshedAtEvent !== undefined ? { refreshedAtEvent: artifact.refreshedAtEvent } : {}),
  };
}

/**
 * Serialize the active/stale gallery into packet entries, honoring the 15% cap:
 * full entries (with payload summaries) when they fit; envelope-only, then
 * relevance-pruned, when they do not.
 */
function packGallery(
  artifacts: ExhibitArtifact[],
  retired: Array<{ id: string; reason: string }>,
  tokenBudget: number
): { gallery: GalleryPacketEntry[]; retiredGallery: Array<{ id: string; reason: string }> } {
  const cap = Math.floor(tokenBudget * GALLERY_BUDGET_FRACTION);
  const byRelevance = [...artifacts].sort((a, b) => b.relevance - a.relevance);
  const estimate = (entries: GalleryPacketEntry[]): number => estimateTokens({ gallery: entries, retiredGallery: retired });

  // 1. Full entries (envelope + payload summary).
  let entries: GalleryPacketEntry[] = byRelevance.map((a) => ({
    ...toEnvelopeEntry(a),
    payloadSummary: payloadSummary(a),
  }));
  if (estimate(entries) <= cap) {
    return { gallery: entries, retiredGallery: retired };
  }

  // 2. Envelopes only, prioritized by relevance.
  entries = byRelevance.map(toEnvelopeEntry);

  // 3. Still over: drop the least-relevant exhibits until it fits.
  while (entries.length > 0 && estimate(entries) > cap) {
    entries.pop();
  }
  return { gallery: entries, retiredGallery: retired };
}

function summarizeArgs(args: unknown): string {
  if (!args || typeof args !== 'object') return String(args ?? '');
  const entries = Object.entries(args as Record<string, unknown>).slice(0, 3);
  return entries.map(([k, v]) => `${k}=${JSON.stringify(v)?.slice(0, 60) ?? ''}`).join(', ');
}

/**
 * Picks the harnessId that produced the most events in this window as the
 * packet's `observedAgent`, falling back to 'claude-code' when no event
 * carries a harnessId (legacy fixtures, hand-rolled test events) — the same
 * default the driver registry uses. A single-harness session has exactly one
 * candidate; a multi-harness/replay-merged session picks its majority.
 */
function dominantHarnessId(events: CanonicalEvent[]): string {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (!event.harnessId) continue;
    counts.set(event.harnessId, (counts.get(event.harnessId) ?? 0) + 1);
  }
  let dominant: string | undefined;
  let max = 0;
  for (const [id, count] of counts) {
    if (count > max) {
      dominant = id;
      max = count;
    }
  }
  return dominant ?? 'claude-code';
}

export interface GalleryContext {
  /** Active/stale exhibits currently on the floor (the curator's memory). */
  gallery?: ExhibitArtifact[];
  /** Ids + reasons retired this session, so the model does not recreate them. */
  retiredGallery?: Array<{ id: string; reason: string }>;
}

export function buildContextPacket(
  state: DerivedState,
  events: CanonicalEvent[],
  galleryContext: GalleryContext = {}
): ShadowContextPacket {
  return packContext(state, events, galleryContext).packet;
}

export interface PackContextOptions extends GalleryContext {
  tokenBudget?: number;
  recentWindowSize?: number;
}

export interface PackContextResult {
  packet: ShadowContextPacket;
  truncated: boolean;
  approximateTokens: number;
}

export function packContext(
  state: DerivedState,
  events: CanonicalEvent[],
  options: PackContextOptions = {}
): PackContextResult {
  const tokenBudget = options.tokenBudget ?? MAX_CONTEXT_TOKENS;
  const recentWindowSize = options.recentWindowSize ?? MAX_RECENT_EVENTS;

  const first = events[0];
  const last = events.at(-1);
  const sessionDuration = first && last
    ? Math.round((new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()) / 1000)
    : 0;

  const recentEvents = events.slice(-recentWindowSize);

  const toolHistory: ShadowContextPacket['toolHistory'] = [];
  for (const event of events) {
    if (event.kind === 'tool_started') {
      const p = event.payload as Record<string, unknown>;
      toolHistory.push({
        tool: String(p.toolName ?? 'unknown'),
        argsSummary: summarizeArgs(p.args),
        result: 'pending',
      });
    } else if (event.kind === 'tool_completed' || event.kind === 'tool_failed') {
      for (let i = toolHistory.length - 1; i >= 0; i--) {
        if (toolHistory[i]!.result === 'pending') {
          toolHistory[i]!.result = event.kind === 'tool_completed' ? 'success' : 'error';
          break;
        }
      }
    }
  }

  const recentTranscript = state.transcript
    .slice(-MAX_TRANSCRIPT_TURNS)
    .map((t) => ({ actor: t.actor, text: t.text.slice(0, 500) }));

  const fileAttention = state.fileAttention.slice(0, MAX_FILE_ATTENTION);

  const riskSignals: ShadowContextPacket['riskSignals'] = state.riskSignals.map((s) => ({
    signal: s,
    severity: 'medium',
  }));

  const { gallery, retiredGallery } = packGallery(
    options.gallery ?? [],
    options.retiredGallery ?? [],
    tokenBudget
  );

  const packet: ShadowContextPacket = {
    sessionId: state.sessionId,
    observedAgent: dominantHarnessId(events),
    sessionDuration,
    currentPhase: state.activePhase,
    recentEvents,
    toolHistory: toolHistory.slice(-MAX_TOOL_HISTORY),
    recentTranscript,
    fileAttention,
    riskSignals,
    gallery,
    retiredGallery,
  };

  let approximateTokens = estimateTokens(packet);
  if (approximateTokens <= tokenBudget) {
    return { packet, truncated: false, approximateTokens };
  }

  const truncatedPacket: ShadowContextPacket = {
    ...packet,
    recentEvents: [...packet.recentEvents],
    toolHistory: [...packet.toolHistory],
    recentTranscript: [...packet.recentTranscript],
    fileAttention: [...packet.fileAttention],
  };

  const trimOldest = (): boolean => {
    if (truncatedPacket.recentEvents.length > 1) {
      truncatedPacket.recentEvents = truncatedPacket.recentEvents.slice(1);
      return true;
    }
    if (truncatedPacket.recentTranscript.length > 1) {
      truncatedPacket.recentTranscript = truncatedPacket.recentTranscript.slice(1);
      return true;
    }
    if (truncatedPacket.toolHistory.length > 1) {
      truncatedPacket.toolHistory = truncatedPacket.toolHistory.slice(1);
      return true;
    }
    if (truncatedPacket.fileAttention.length > 1) {
      truncatedPacket.fileAttention = truncatedPacket.fileAttention.slice(0, -1);
      return true;
    }
    return false;
  };

  while (approximateTokens > tokenBudget && trimOldest()) {
    approximateTokens = estimateTokens(truncatedPacket);
  }

  return { packet: truncatedPacket, truncated: true, approximateTokens };
}
