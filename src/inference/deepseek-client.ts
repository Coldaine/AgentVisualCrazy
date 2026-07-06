import type { InferenceClient, InferenceRequest, InferenceResult, ToolCall } from './inference-client';
import { createLogger } from '../shared/logger';

const logger = createLogger({ minLevel: 'info' });

const DEFAULT_MODEL = 'deepseek-v4-pro';
const DEFAULT_TIMEOUT_MS = 120_000;
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  reasoning_content?: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  response_format?: { type: 'json_object' };
  max_tokens?: number;
}

interface ChatCompletionResponse {
  model?: string;
  choices?: Array<{
    message?: ChatMessage;
    finish_reason?: string;
  }>;
  usage?: unknown;
}

export interface DeepSeekClientDependencies {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/**
 * DeepSeek-specific inference client.
 *
 * DeepSeek V4 uses OpenAI Chat Completions compatibility with provider-specific
 * differences:
 * - Thinking mode defaults to enabled (tool turns must round-trip reasoning_content)
 * - JSON mode via response_format: { type: "json_object" } (prompt must include "json")
 * - Tool calls follow OpenAI format but need reasoning_content round-trip
 */
export function createDeepSeekClient(
  deps: DeepSeekClientDependencies = {}
): InferenceClient | null {
  const apiKey = deps.apiKey ?? process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn('inference', 'deepseek.no_key');
    return null;
  }

  const baseUrl = (deps.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? DEEPSEEK_BASE_URL).replace(/\/+$/, '');
  const model = deps.model ?? (process.env.SHADOW_DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL);
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const now = deps.now ?? Date.now;

  const endpoint = `${baseUrl}/chat/completions`;

  async function chatComplete(body: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(`DeepSeek API returned ${response.status}: ${bodyText.slice(0, 200)}`);
      }
      return (await response.json()) as ChatCompletionResponse;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    id: 'deepseek',
    provider: 'deepseek' as const,

    async infer(request: InferenceRequest): Promise<InferenceResult> {
      const start = now();
      logger.info('inference', 'deepseek.request_start', { model });

      const messages: ChatMessage[] = [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userMessage },
      ];

      const body: ChatCompletionRequest = {
        model,
        messages,
        max_tokens: 2048,
      };

      if (request.tools && request.tools.length > 0) {
        body.tools = request.tools.map((t) => ({
          type: 'function' as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters as Record<string, unknown>,
          },
        }));
      }

      const response = await chatComplete(body);
      const latencyMs = now() - start;
      const choice = response.choices?.[0];
      const responseMessage = choice?.message;

      const text = responseMessage?.content ?? '';
      const toolCalls: ToolCall[] = [];

      if (responseMessage?.tool_calls) {
        for (const tc of responseMessage.tool_calls) {
          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments),
          });
        }
        if (responseMessage.reasoning_content) {
          logger.debug('inference', 'deepseek.thinking_content', {
            length: responseMessage.reasoning_content.length,
          });
        }
      }

      logger.info('inference', 'deepseek.request_done', {
        latencyMs,
        textLength: text.length,
        toolCalls: toolCalls.length,
        model: response.model ?? model,
      });

      return {
        text,
        model: response.model ?? model,
        latencyMs,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
    },
  };
}
