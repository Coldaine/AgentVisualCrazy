/**
 * Selects the best available inference adapter for the current environment.
 *
 * Order: explicit SHADOW_INFERENCE_PROVIDER preference → OpenCode (if SDK starts) →
 * direct Anthropic fallback.
 */
import type { InferenceClient } from './inference-client';
import { createDirectApiClient } from './direct-api';
import { createOpencodeClient } from './opencode-client';
import { createOpenAiCompatibleClient } from './openai-compatible-client';

export async function createInferenceClient(): Promise<InferenceClient | null> {
  const preference = process.env.SHADOW_INFERENCE_PROVIDER?.trim().toLowerCase();

  if (preference === 'anthropic' || preference === 'direct') {
    return createDirectApiClient();
  }

  if (preference === 'openai' || preference === 'openai-compatible') {
    return createOpenAiCompatibleClient();
  }

  if (preference === 'opencode') {
    const opencode = await createOpencodeClient();
    return opencode ?? createDirectApiClient();
  }

  const opencode = await createOpencodeClient();
  if (opencode) {
    return opencode;
  }

  return createDirectApiClient();
}
