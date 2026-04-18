import type { CanonicalEvent, TranscriptPrivacySettings } from '../shared/schema.js';
import {
  assertOffHostInferenceAllowed,
  DEFAULT_TRANSCRIPT_PRIVACY_SETTINGS,
  sanitizeTranscriptText
} from '../shared/privacy.js';

// ---------------------------------------------------------------------------
// Context packet — the structured input the inference engine assembles before
// calling the model. Not the same as DerivedState (which is post-derivation).
// ---------------------------------------------------------------------------

export interface ShadowContextPacket {
  sessionId: string;
  observedAgent: 'claude-code' | 'codex' | 'opencode';
  sessionDuration: number; // seconds
  currentPhase: string;
  recentEvents: CanonicalEvent[];
  toolHistory: Array<{
    tool: string;
    result: string;
    argsSummary: string;
  }>;
  recentTranscript: Array<{
    actor: string;
    text: string;
  }>;
  fileAttention: Array<{
    filePath: string;
    touches: number;
  }>;
  riskSignals: Array<{
    signal: string;
    severity: string;
  }>;
}

export interface BuildUserMessageOptions {
  delivery?: 'local' | 'off-host';
  includeRawTranscript?: boolean;
  privacy?: TranscriptPrivacySettings;
}

// ---------------------------------------------------------------------------
// User-message builder — formats a ShadowContextPacket as the plain-text
// message described in docs/prompts/shadow-system-prompt.md § "Context Packet"
// ---------------------------------------------------------------------------

export function buildUserMessage(packet: ShadowContextPacket, options: BuildUserMessageOptions = {}): string {
  const delivery = options.delivery ?? 'local';
  const privacy = options.privacy ?? DEFAULT_TRANSCRIPT_PRIVACY_SETTINGS;
  const useRawTranscript = options.includeRawTranscript === true;

  if (delivery === 'off-host') {
    assertOffHostInferenceAllowed(privacy, { includeRawTranscript: useRawTranscript });
  }

  const lines: string[] = [];

  // Header
  lines.push(`Session: ${packet.sessionId}`);
  lines.push(`Agent: ${packet.observedAgent} (${packet.observedAgent})`);
  lines.push(`Duration: ${packet.sessionDuration}s`);
  lines.push(`Phase (heuristic): ${packet.currentPhase}`);
  lines.push(`Privacy mode: ${delivery === 'off-host' ? 'off-host-opted-in' : 'local-only'}`);
  lines.push('');

  // Recent events
  lines.push(`--- Recent Events (${packet.recentEvents.length}) ---`);
  for (const ev of packet.recentEvents) {
    const payloadSummary =
      typeof ev.payload === 'object' && ev.payload !== null
        ? Object.keys(ev.payload).map((key) => sanitizeTranscriptText(key)).join(', ')
        : sanitizeTranscriptText(String(ev.payload));
    lines.push(`${ev.timestamp} [${ev.kind}] ${ev.actor}: ${payloadSummary}`);
  }
  lines.push('');

  // Tool history
  lines.push(`--- Tool History (${packet.toolHistory.length}) ---`);
  for (const t of packet.toolHistory) {
    lines.push(
      `${t.tool} (${sanitizeTranscriptText(t.result)}): ${useRawTranscript ? t.argsSummary : sanitizeTranscriptText(t.argsSummary)}`
    );
  }
  lines.push('');

  // Recent transcript
  lines.push(`--- Recent Transcript (${packet.recentTranscript.length} turns) ---`);
  for (const turn of packet.recentTranscript) {
    lines.push(`[${turn.actor}] ${useRawTranscript ? turn.text : sanitizeTranscriptText(turn.text)}`);
  }
  lines.push('');

  // File attention
  lines.push('--- File Attention ---');
  for (const fa of packet.fileAttention) {
    lines.push(`${fa.filePath}: ${fa.touches} touches`);
  }
  lines.push('');

  // Risk signals
  lines.push('--- Risk Signals (heuristic) ---');
  for (const rs of packet.riskSignals) {
    lines.push(`${rs.signal} (severity: ${rs.severity})`);
  }

  return lines.join('\n');
}
