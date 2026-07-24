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
import {
  assertOffHostInferenceAllowed,
  DEFAULT_TRANSCRIPT_PRIVACY_SETTINGS,
  sanitizeTranscriptText
} from '../shared/privacy';
import type { TranscriptPrivacySettings } from '../shared/schema';

/**
 * One exhibit serialized for THE GALLERY section of the packet. The envelope is
 * always present; `payloadSummary` is a one-line description of the payload
 * (beats + thread names, node + focus, etc.) that the packager drops first when
 * the gallery section would blow its ~15%-of-budget cap.
 */
export interface GalleryPacketEntry {
  id: string;
  exhibitType: string;
  title: string;
  narrative: string;
  relevance: number;
  decayClass: string;
  status: string;
  createdAtEvent: number;
  refreshedAtEvent?: number;
  /** One-line payload summary; omitted in envelope-only (over-budget) mode. */
  payloadSummary?: string;
}

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
  /**
   * THE GALLERY: the curator's own prior work fed back as memory. Active/stale
   * exhibits with envelope + one-line payload summary; capped at ~15% of the
   * packet token budget by the packager.
   */
  gallery?: GalleryPacketEntry[];
  /**
   * Ids + reasons of exhibits retired this session, one line each, so the model
   * does not recreate what it already retired.
   */
  retiredGallery?: Array<{ id: string; reason: string }>;
}

export interface BuildUserMessageOptions {
  delivery?: 'local' | 'off-host';
  includeRawTranscript?: boolean;
  privacy?: TranscriptPrivacySettings;
}

export function buildUserMessage(
  packet: ShadowContextPacket,
  options: BuildUserMessageOptions = {}
): string {
  const delivery = options.delivery ?? 'local';
  const privacy = options.privacy ?? DEFAULT_TRANSCRIPT_PRIVACY_SETTINGS;

  if (delivery === 'off-host') {
    assertOffHostInferenceAllowed(privacy, {
      includeRawTranscript: options.includeRawTranscript
    });
  }

  const allowRawTranscript =
    delivery === 'off-host' &&
    options.includeRawTranscript === true &&
    privacy.allowRawTranscriptStorage;

  const sanitize = (text: string): string => {
    if (allowRawTranscript) {
      return text;
    }
    return sanitizeTranscriptText(text);
  };

  const privacyMode = delivery === 'off-host' && privacy.allowOffHostInference
    ? 'off-host-opted-in'
    : 'local-only';

  const lines: string[] = [
    `Session: ${packet.sessionId}`,
    `Agent: ${packet.observedAgent}`,
    `Duration: ${packet.sessionDuration}s`,
    `Phase (heuristic): ${packet.currentPhase}`,
    `Privacy mode: ${privacyMode}`,
    '',
    `--- Recent Events (${packet.recentEvents.length}) ---`,
    ...packet.recentEvents.map((e) =>
      `${e.timestamp} [${e.kind}] ${e.actor}: ${sanitize(JSON.stringify(e.payload)).slice(0, 120)}`
    ),
    '',
    `--- Tool History (${packet.toolHistory.length}) ---`,
    ...packet.toolHistory.map((t) =>
      `${t.tool} (${t.result}): ${sanitize(t.argsSummary)}`
    ),
    '',
    `--- Recent Transcript (${packet.recentTranscript.length} turns) ---`,
    ...packet.recentTranscript.map((t) =>
      `[${t.actor}] ${sanitize(t.text)}`
    ),
    '',
    `--- File Attention ---`,
    ...packet.fileAttention.map((f) =>
      `${sanitize(f.filePath)}: ${f.touches} touches`
    ),
    '',
    `--- Risk Signals (heuristic) ---`,
    ...packet.riskSignals.map((r) =>
      `${r.signal} (severity: ${r.severity})`
    ),
  ];

  const gallery = packet.gallery ?? [];
  lines.push('', `--- THE GALLERY (${gallery.length}) ---`);
  for (const g of gallery) {
    lines.push(
      `[${g.exhibitType}] ${g.id} "${sanitize(g.title)}" ` +
        `(relevance ${g.relevance.toFixed(2)}, ${g.status}, ${g.decayClass})`
    );
    lines.push(`  narrative: ${sanitize(g.narrative)}`);
    if (g.payloadSummary) {
      lines.push(`  payload: ${sanitize(g.payloadSummary)}`);
    }
  }

  const retired = packet.retiredGallery ?? [];
  if (retired.length > 0) {
    lines.push('', `--- Retired this session (${retired.length}) ---`);
    for (const r of retired) {
      lines.push(`${r.id}: ${sanitize(r.reason)}`);
    }
  }

  return lines.join('\n');
}

export function buildInferenceRequest(
  packet: ShadowContextPacket,
  options: BuildUserMessageOptions = {}
): InferenceRequest {
  return {
    systemPrompt: SHADOW_SYSTEM_PROMPT,
    userMessage: buildUserMessage(packet, options),
  };
}
