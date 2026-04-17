/**
 * Context packager: builds a ShadowContextPacket from DerivedState + recent events.
 *
 * Uses the ShadowContextPacket type defined in prompts.ts (the canonical shape for inference).
 * Total context budget: ~10,000 tokens. Truncates from the front — recent events are more valuable.
 */
import type { CanonicalEvent, DerivedState } from '../shared/schema';
import type { ShadowContextPacket } from './prompts';

const MAX_RECENT_EVENTS = 30;
const MAX_TOOL_HISTORY = 20;
const MAX_TRANSCRIPT_TURNS = 10;
const MAX_FILE_ATTENTION = 15;

function summarizeArgs(args: unknown): string {
  if (!args || typeof args !== 'object') return String(args ?? '');
  const entries = Object.entries(args as Record<string, unknown>).slice(0, 3);
  return entries.map(([k, v]) => `${k}=${JSON.stringify(v)?.slice(0, 60) ?? ''}`).join(', ');
}

export function buildContextPacket(
  state: DerivedState,
  events: CanonicalEvent[]
): ShadowContextPacket {
  const first = events[0];
  const last = events.at(-1);
  const sessionDuration = first && last
    ? Math.round((new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()) / 1000)
    : 0;

  // Recent events
  const recentEvents = events.slice(-MAX_RECENT_EVENTS);

  // Tool call history (match prompts.ts shape: {tool, result, argsSummary})
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
      // Update the last pending tool call
      for (let i = toolHistory.length - 1; i >= 0; i--) {
        if (toolHistory[i]!.result === 'pending') {
          toolHistory[i]!.result = event.kind === 'tool_completed' ? 'success' : 'error';
          break;
        }
      }
    }
  }

  // Transcript turns
  const recentTranscript = state.transcript
    .slice(-MAX_TRANSCRIPT_TURNS)
    .map((t) => ({ actor: t.actor, text: t.text.slice(0, 500) }));

  // File attention
  const fileAttention = state.fileAttention.slice(0, MAX_FILE_ATTENTION);

  // Risk signals (convert string[] → {signal, severity}[])
  const riskSignals: ShadowContextPacket['riskSignals'] = state.riskSignals.map((s) => ({
    signal: s,
    severity: 'medium',
  }));

  return {
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
}
