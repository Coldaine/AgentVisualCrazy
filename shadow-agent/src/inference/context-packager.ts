/**
 * Context packager: builds a ShadowContextPacket from DerivedState + recent events.
 *
 * Uses the ShadowContextPacket type defined in prompt-builder.ts (the canonical shape for inference).
 * Total context budget: ~10,000 tokens. Truncates from the front — recent events are more valuable.
 */
import type { CanonicalEvent, DerivedState } from '../shared/schema';
import type { ShadowContextPacket } from './prompt-builder';

const MAX_RECENT_EVENTS = 30;
const MAX_TOOL_HISTORY = 20;
const MAX_TRANSCRIPT_TURNS = 10;
const MAX_FILE_ATTENTION = 15;
const MAX_CONTEXT_TOKENS = 10_000;

function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 4);
}

function summarizeArgs(args: unknown): string {
  if (!args || typeof args !== 'object') return String(args ?? '');
  const entries = Object.entries(args as Record<string, unknown>).slice(0, 3);
  return entries.map(([k, v]) => `${k}=${JSON.stringify(v)?.slice(0, 60) ?? ''}`).join(', ');
}

export function buildContextPacket(
  state: DerivedState,
  events: CanonicalEvent[]
): ShadowContextPacket {
  return packContext(state, events).packet;
}

export interface PackContextOptions {
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

  const packet: ShadowContextPacket = {
    sessionId: state.sessionId,
    observedAgent: 'claude-code',
    sessionDuration,
    currentPhase: state.activePhase,
    recentEvents,
    toolHistory: toolHistory.slice(-MAX_TOOL_HISTORY),
    recentTranscript,
    fileAttention,
    riskSignals,
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
