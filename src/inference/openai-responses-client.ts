import OpenAI from 'openai';
import type { InferenceClient, InferenceRequest, InferenceResult, ToolCall } from './inference-client';
import { createLogger } from '../shared/logger';

const logger = createLogger({ minLevel: 'info' });

const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_MAX_TOKENS = 2048;

export interface OpenAiResponsesClientDependencies {
  apiKey?: string;
  model?: string;
  baseURL?: string;
  maxTokens?: number;
  now?: () => number;
  openai?: OpenAI;
}

/**
 * OpenAI Responses API client.
 *
 * Uses the OpenAI SDK's `responses.create()` API with structured output
 * support. Supports tool definitions and typed structured outputs.
 */
export function createOpenAiResponsesClient(
  deps: OpenAiResponsesClientDependencies = {}
): InferenceClient | null {
  const apiKey = deps.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn('inference', 'openai_responses.no_key');
    return null;
  }

  const openai = deps.openai ?? new OpenAI({
    apiKey,
    baseURL: deps.baseURL ?? process.env.OPENAI_BASE_URL ?? undefined,
  });

  const model = deps.model ?? (process.env.SHADOW_INFERENCE_MODEL?.trim() || DEFAULT_MODEL);
  const maxTokens = deps.maxTokens ?? DEFAULT_MAX_TOKENS;
  const now = deps.now ?? Date.now;

  return {
    id: 'openai-responses',
    provider: 'openai' as const,

    async infer(request: InferenceRequest): Promise<InferenceResult> {
      const start = now();
      logger.info('inference', 'openai_responses.request_start', { model });

      const input: OpenAI.Responses.ResponseCreateParams = {
        model,
        instructions: request.systemPrompt,
        input: request.userMessage,
        max_output_tokens: maxTokens,
      };

      if (request.tools && request.tools.length > 0) {
        input.tools = request.tools.map((t) => ({
          type: 'function' as const,
          name: t.name,
          description: t.description,
          parameters: t.parameters as Record<string, unknown>,
          strict: false,
        }));
      }

      const response = await openai.responses.create(input);
      const latencyMs = now() - start;

      const outputTexts: string[] = [];
      const toolCalls: ToolCall[] = [];
      for (const item of (response.output ?? [])) {
        if (item.type === 'message') {
          for (const content of item.content ?? []) {
            if (content.type === 'output_text') {
              outputTexts.push(content.text);
            }
          }
        } else if (item.type === 'function_call') {
          toolCalls.push({
            id: item.id ?? `fc-${Date.now()}`,
            name: item.name ?? 'unknown',
            arguments: JSON.parse(item.arguments),
          });
        }
      }

      logger.info('inference', 'openai_responses.request_done', {
        latencyMs,
        textLength: outputTexts.join('').length,
        toolCalls: toolCalls.length,
      });

      return {
        text: outputTexts.join('\n'),
        model: response.model ?? model,
        latencyMs,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
    },
  };
}
