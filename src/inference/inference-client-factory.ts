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
import type { Logger } from '../shared/logger';

export interface InferenceClientFactoryDependencies {
  logger?: Logger;
}

export async function createInferenceClient(
  deps: InferenceClientFactoryDependencies = {}
): Promise<InferenceClient | null> {
  const preference = process.env.SHADOW_INFERENCE_PROVIDER?.trim().toLowerCase();
  const providerDeps = deps.logger ? { logger: deps.logger } : undefined;

  if (preference === 'anthropic' || preference === 'direct') {
    return createDirectApiClient(providerDeps);
  }

  if (preference === 'openai' || preference === 'openai-compatible') {
    return createOpenAiCompatibleClient(providerDeps);
  }

  if (preference === 'opencode') {
    const opencode = await createOpencodeClient(providerDeps);
    return opencode ?? createDirectApiClient(providerDeps);
  }

  const opencode = await createOpencodeClient(providerDeps);
  if (opencode) {
    return opencode;
  }

  return createDirectApiClient(providerDeps);
}
