/**
 * Prompt builder: assembles InferenceRequest from a ShadowContextPacket.
 *
 * Exports ShadowContextPacket (canonical shape for inference context),
 * buildUserMessage (renders a packet into the user-turn string), and
 * buildInferenceRequest (combines system prompt + user message).
 *
 * Deterministic: same packet → same output.
 */
import { SHADOW_SYSTEM_PROMPT } from './prompts';
export { SHADOW_SYSTEM_PROMPT } from './prompts';
import type { InferenceRequest } from './inference-client';
import type { CanonicalEvent } from '../shared/schema';

export interface ShadowContextPacket {
  sessionId: string;
  observedAgent: string;
  sessionDuration: number;
  currentPhase: string;
  recentEvents: CanonicalEvent[];
  toolHistory: Array<{ tool: string; result: string; argsSummary: string }>;
  recentTranscript: Array<{ actor: string; text: string }>;
  fileAttention: Array<{ filePath: string; touches: number }>;
  riskSignals: Array<{ signal: string; severity: string }>;
}

export function buildUserMessage(packet: ShadowContextPacket): string {
  const lines: string[] = [
    `Session: ${packet.sessionId}`,
    `Agent: ${packet.observedAgent}`,
    `Duration: ${packet.sessionDuration}s`,
    `Phase (heuristic): ${packet.currentPhase}`,
    '',
    `--- Recent Events (${packet.recentEvents.length}) ---`,
    ...packet.recentEvents.map((e) =>
      `${e.timestamp} [${e.kind}] ${e.actor}: ${JSON.stringify(e.payload).slice(0, 120)}`
    ),
    '',
    `--- Tool History (${packet.toolHistory.length}) ---`,
    ...packet.toolHistory.map((t) =>
      `${t.tool} (${t.result}): ${t.argsSummary}`
    ),
    '',
    `--- Recent Transcript (${packet.recentTranscript.length} turns) ---`,
    ...packet.recentTranscript.map((t) =>
      `[${t.actor}] ${t.text}`
    ),
    '',
    `--- File Attention ---`,
    ...packet.fileAttention.map((f) =>
      `${f.filePath}: ${f.touches} touches`
    ),
    '',
    `--- Risk Signals (heuristic) ---`,
    ...packet.riskSignals.map((r) =>
      `${r.signal} (severity: ${r.severity})`
    ),
  ];

  return lines.join('\n');
}

export function buildInferenceRequest(packet: ShadowContextPacket): InferenceRequest {
  return {
    systemPrompt: SHADOW_SYSTEM_PROMPT,
    userMessage: buildUserMessage(packet),
  };
}
