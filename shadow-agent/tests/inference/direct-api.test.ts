import { describe, expect, it } from 'vitest';
import { createDirectApiClient } from '../../src/inference/direct-api';

describe('createDirectApiClient', () => {
  it('returns null when no API key is available', async () => {
    const client = await createDirectApiClient({ apiKey: '' });
    expect(client).toBeNull();
  });

  it('returns null when the Anthropic SDK is unavailable', async () => {
    const client = await createDirectApiClient({
      apiKey: 'test-key',
      loadSdk: async () => {
        throw new Error('missing sdk');
      }
    });

    expect(client).toBeNull();
  });

  it('builds an inference adapter that forwards prompts and normalizes the response', async () => {
    const calls: Array<{
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: 'user'; content: string }>;
    }> = [];

    class FakeAnthropicClient {
      messages = {
        create: async (request: {
          model: string;
          max_tokens: number;
          system: string;
          messages: Array<{ role: 'user'; content: string }>;
        }) => {
          calls.push(request);
          return {
            content: [{ type: 'text', text: 'shadow insight json' }],
            model: 'claude-test',
            usage: { input_tokens: 10, output_tokens: 4 }
          };
        }
      };

      constructor(_opts: { apiKey: string }) {}
    }

    let now = 1000;
    const client = await createDirectApiClient({
      apiKey: 'test-key',
      loadSdk: async () => ({ default: FakeAnthropicClient }),
      now: () => {
        now += 25;
        return now;
      }
    });

    expect(client).not.toBeNull();
    expect(client?.id).toBe('anthropic-direct-api');
    expect(client?.provider).toBe('anthropic');

    const result = await client!.infer({
      systemPrompt: 'system prompt',
      userMessage: 'user message'
    });

    expect(calls).toEqual([
      {
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: 'system prompt',
        messages: [{ role: 'user', content: 'user message' }]
      }
    ]);
    expect(result).toEqual({
      text: 'shadow insight json',
      model: 'claude-test',
      latencyMs: 25
    });
  });
});
