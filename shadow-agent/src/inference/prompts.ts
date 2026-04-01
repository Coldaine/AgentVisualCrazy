/**
 * Shadow inference system prompt and user-message builder.
 *
 * Canonical documentation: docs/prompts/shadow-system-prompt.md
 * The runtime code file is: shadow-agent/src/inference/prompts.ts
 *
 * Any change to this file MUST follow the prompt-change workflow in AGENTS.md:
 *   1. Edit docs/prompts/shadow-system-prompt.md first
 *   2. Update the iteration log
 *   3. Update this file to match
 *   4. Verify character-for-character sync
 */

import type {
  CanonicalEvent,
  DerivedState,
  EventSource,
} from '../shared/schema.js';

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

// ---------------------------------------------------------------------------
// System prompt — must be identical to the "Full Prompt (Copy-Paste Ready)"
// section in docs/prompts/shadow-system-prompt.md
// ---------------------------------------------------------------------------

export const SHADOW_SYSTEM_PROMPT = `You are Shadow, a passive observer and analyst watching a coding agent work.

Your job: read the agent's recent activity and produce a structured interpretation.

CONSTRAINTS:
- You are READ-ONLY. You cannot affect the observed agent.
- Be terse. The user sees your output in a live visualization.
- Be specific. Vague observations are useless.
- Confidence scores must be honest — not every situation warrants 0.9+.

OUTPUT FORMAT: You must respond with valid JSON only. No prose. No markdown. Pure JSON.

{
  "phase": "exploration" | "implementation" | "testing" | "debugging" | "refactoring" | "idle",
  "phaseConfidence": 0.0-1.0,
  "phaseReason": "one sentence explaining why this phase was identified",

  "riskLevel": "low" | "medium" | "high" | "critical",
  "riskSignals": [
    { "signal": "description of the risk", "severity": "low|medium|high", "confidence": 0.0-1.0 }
  ],

  "predictedNextAction": "description of what the agent will likely do next",
  "predictedNextConfidence": 0.0-1.0,

  "observations": [
    "specific factual observation about what the agent is doing"
  ],

  "attention": {
    "primaryFile": "path/to/file.ts or null",
    "intent": "what the agent seems to be trying to accomplish right now"
  }
}`;

// ---------------------------------------------------------------------------
// User-message builder — formats a ShadowContextPacket as the plain-text
// message described in docs/prompts/shadow-system-prompt.md § "Context Packet"
// ---------------------------------------------------------------------------

export function buildUserMessage(packet: ShadowContextPacket): string {
  const lines: string[] = [];

  // Header
  lines.push(`Session: ${packet.sessionId}`);
  lines.push(`Agent: ${packet.observedAgent} (${packet.observedAgent})`);
  lines.push(`Duration: ${packet.sessionDuration}s`);
  lines.push(`Phase (heuristic): ${packet.currentPhase}`);
  lines.push('');

  // Recent events
  lines.push(`--- Recent Events (${packet.recentEvents.length}) ---`);
  for (const ev of packet.recentEvents) {
    const payloadSummary =
      typeof ev.payload === 'object' && ev.payload !== null
        ? Object.keys(ev.payload).join(', ')
        : String(ev.payload);
    lines.push(`${ev.timestamp} [${ev.kind}] ${ev.actor}: ${payloadSummary}`);
  }
  lines.push('');

  // Tool history
  lines.push(`--- Tool History (${packet.toolHistory.length}) ---`);
  for (const t of packet.toolHistory) {
    lines.push(`${t.tool} (${t.result}): ${t.argsSummary}`);
  }
  lines.push('');

  // Recent transcript
  lines.push(`--- Recent Transcript (${packet.recentTranscript.length} turns) ---`);
  for (const turn of packet.recentTranscript) {
    lines.push(`[${turn.actor}] ${turn.text}`);
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
