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

/**
 * Create a direct Anthropic API client.
 * Returns null if the API key is not available or if the SDK is not installed.
 */
export async function createDirectApiClient(): Promise<InferenceClient | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.warn('inference', 'direct_api.no_key');
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let AnthropicClass: new (opts: { apiKey: string }) => any;
  try {
    // @ts-expect-error — @anthropic-ai/sdk is an optional runtime dependency
    const mod = await import('@anthropic-ai/sdk') as { default: new (opts: { apiKey: string }) => any };
    AnthropicClass = mod.default;
  } catch {
    logger.warn('inference', 'direct_api.sdk_not_installed');
    return null;
  }

  const client = new AnthropicClass({ apiKey });

  return {
    provider: 'anthropic' as const,

    async infer(request: InferenceRequest): Promise<InferenceResult> {
      const start = Date.now();
      logger.info('inference', 'direct_api.request_start');

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: request.systemPrompt,
        messages: [{ role: 'user', content: request.userMessage }],
      }) as { content: Array<{ type: string; text?: string }>; model: string; usage: unknown };

      const latencyMs = Date.now() - start;
      const content = response.content[0];
      const text = content?.type === 'text' ? (content.text ?? '') : '';

      logger.info('inference', 'direct_api.request_done', { latencyMs, tokens: response.usage });

      return {
        text,
        model: response.model,
        latencyMs,
      };
    },
  };
}
