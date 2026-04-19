/**
 * Prompt builder: assembles InferenceRequest from a ShadowContextPacket.
 *
 * Uses SHADOW_SYSTEM_PROMPT from prompts.ts and buildUserMessage for the user turn.
 * Deterministic: same packet → same request.
 */
import { SHADOW_SYSTEM_PROMPT, buildUserMessage, type ShadowContextPacket } from './prompts';
import type { InferenceRequest } from './inference-client';

export function buildInferenceRequest(packet: ShadowContextPacket): InferenceRequest {
  return {
    systemPrompt: SHADOW_SYSTEM_PROMPT,
    userMessage: buildUserMessage(packet),
  };
}
