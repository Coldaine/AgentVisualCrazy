/**
 * Direct Anthropic API client — fallback when OpenCode is unavailable.
 *
 * Uses @anthropic-ai/sdk. Does not require session management or polling.
 * Model: claude-sonnet-4-5, max_tokens: 1024.
 *
 * Implements InferenceClient so it's a drop-in alternative to the OpenCode client.
 */
import type { InferenceClient, InferenceRequest, InferenceResult } from './inference-client';
import { createLogger } from '../shared/logger';

const logger = createLogger({ minLevel: 'info' });

const MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS = 1024;

interface AnthropicMessageResponse {
  content: Array<{ type: string; text?: string }>;
  model: string;
  usage: unknown;
}

interface AnthropicMessagesApi {
  create(request: {
    model: string;
    max_tokens: number;
    system: string;
    messages: Array<{ role: 'user'; content: string }>;
  }): Promise<AnthropicMessageResponse>;
}

interface AnthropicSdkInstance {
  messages: AnthropicMessagesApi;
}

type AnthropicSdkConstructor = new (opts: { apiKey: string }) => AnthropicSdkInstance;

export interface DirectApiClientDependencies {
  apiKey?: string;
  loadSdk?: () => Promise<{ default: AnthropicSdkConstructor }>;
  now?: () => number;
}

async function loadAnthropicSdk(): Promise<{ default: AnthropicSdkConstructor }> {
  return import('@anthropic-ai/sdk') as Promise<{ default: AnthropicSdkConstructor }>;
}

/**
 * Create a direct Anthropic API client.
 * Returns null if the API key is not available or if the SDK is not installed.
 */
export async function createDirectApiClient(
  deps: DirectApiClientDependencies = {}
): Promise<InferenceClient | null> {
  const apiKey = deps.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.warn('inference', 'direct_api.no_key');
    return null;
  }

  let AnthropicClass: AnthropicSdkConstructor;
  try {
    const mod = await (deps.loadSdk ?? loadAnthropicSdk)();
    AnthropicClass = mod.default;
  } catch {
    logger.warn('inference', 'direct_api.sdk_not_installed');
    return null;
  }

  const client = new AnthropicClass({ apiKey });
  const now = deps.now ?? Date.now;

  return {
    id: 'anthropic-direct-api',
    provider: 'anthropic' as const,

    async infer(request: InferenceRequest): Promise<InferenceResult> {
      const start = now();
      logger.info('inference', 'direct_api.request_start');

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: request.systemPrompt,
        messages: [{ role: 'user', content: request.userMessage }]
      });

      const latencyMs = now() - start;
      const content = response.content[0];
      const text = content?.type === 'text' ? (content.text ?? '') : '';

      logger.info('inference', 'direct_api.request_done', { latencyMs, tokens: response.usage });

      return {
        text,
        model: response.model,
        latencyMs,
      };
    }
  };
}
