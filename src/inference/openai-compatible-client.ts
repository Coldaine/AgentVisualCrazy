/**
 * OpenAI-compatible inference client.
 *
 * Talks to any endpoint exposing `POST {baseURL}/chat/completions` in the
 * OpenAI shape — OpenAI, OpenRouter, llama.cpp, vLLM, LM Studio, Ollama's
 * OpenAI shim, etc. Selected via `SHADOW_INFERENCE_PROVIDER=openai`.
 *
 * Config (env, all overridable via deps for tests):
 *   OPENAI_BASE_URL / SHADOW_INFERENCE_BASE_URL — endpoint base (no trailing /chat/completions)
 *   OPENAI_API_KEY              — bearer token (optional for some local servers)
 *   SHADOW_INFERENCE_MODEL      — model id (default 'gpt-4o-mini')
 *   SHADOW_INFERENCE_TIMEOUT_MS — per-request timeout (default 60000)
 *
 * Robustness (local endpoints are messy): an AbortController enforces the
 * timeout, non-2xx responses raise a typed error (surfaced as engine.run_error),
 * and a missing base URL / fetch returns null so the engine degrades gracefully.
 */
import type { InferenceClient, InferenceRequest, InferenceResult } from './inference-client';
import { createLogger } from '../shared/logger';
import { sanitizeTranscriptText } from '../shared/privacy';

const logger = createLogger({ minLevel: 'info' });

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_TIMEOUT_MS = 60_000;

interface ChatCompletionResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
}

export interface OpenAiCompatibleClientDependencies {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export function createOpenAiCompatibleClient(
  deps: OpenAiCompatibleClientDependencies = {}
): InferenceClient | null {
  const baseUrl = deps.baseUrl ?? process.env.OPENAI_BASE_URL ?? process.env.SHADOW_INFERENCE_BASE_URL;
  if (!baseUrl) {
    logger.warn('inference', 'openai_compatible.no_base_url');
    return null;
  }

  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    logger.warn('inference', 'openai_compatible.no_fetch');
    return null;
  }

  const apiKey = deps.apiKey ?? process.env.OPENAI_API_KEY ?? '';
  const model = deps.model ?? (process.env.SHADOW_INFERENCE_MODEL?.trim() || DEFAULT_MODEL);
  const timeoutMs = deps.timeoutMs ?? (Number(process.env.SHADOW_INFERENCE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  const now = deps.now ?? Date.now;
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  return {
    id: 'openai-compatible',
    provider: 'openai' as const,

    async infer(request: InferenceRequest): Promise<InferenceResult> {
      const start = now();
      logger.info('inference', 'openai_compatible.request_start', { endpoint, model });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: request.systemPrompt },
              { role: 'user', content: request.userMessage }
            ]
          }),
          signal: controller.signal
        });
      } catch (error) {
        const aborted = error instanceof Error && error.name === 'AbortError';
        logger.warn('inference', 'openai_compatible.request_failed', { aborted });
        throw new Error(
          aborted
            ? `OpenAI-compatible request timed out after ${timeoutMs}ms`
            : `OpenAI-compatible request failed: ${error instanceof Error ? error.message : String(error)}`
        );
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        const bodyText = await safeReadText(response);
        logger.warn('inference', 'openai_compatible.non_2xx', { status: response.status });
        throw new Error(`OpenAI-compatible endpoint returned ${response.status}: ${sanitizeResponsePreview(bodyText)}`);
      }

      const bodyText = await safeReadText(response);
      let json: ChatCompletionResponse;
      try {
        json = JSON.parse(bodyText) as ChatCompletionResponse;
      } catch {
        logger.warn('inference', 'openai_compatible.invalid_json', { status: response.status });
        throw new Error(`OpenAI-compatible endpoint returned invalid JSON: ${sanitizeResponsePreview(bodyText)}`);
      }
      const text = json.choices?.[0]?.message?.content ?? '';
      const latencyMs = now() - start;

      logger.info('inference', 'openai_compatible.request_done', { latencyMs, status: response.status });

      return { text, model: json.model ?? model, latencyMs };
    }
  };
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function sanitizeResponsePreview(bodyText: string): string {
  return sanitizeTranscriptText(bodyText).slice(0, 200);
}
