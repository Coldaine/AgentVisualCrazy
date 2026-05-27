import { describe, expect, it } from 'vitest';
import { createOpencodeClient } from '../../src/inference/opencode-client';

describe('createOpencodeClient', () => {
  it('returns null when the OpenCode SDK cannot be loaded', async () => {
    const client = await createOpencodeClient({
      loadSdk: async () => {
        throw new Error('missing sdk');
      }
    });

    expect(client).toBeNull();
  });

  it('returns null when the OpenCode server fails to start', async () => {
    const client = await createOpencodeClient({
      loadSdk: async () => ({
        createOpencodeServer: async () => {
          throw new Error('port in use');
        },
        createOpencodeClient: () => {
          throw new Error('unreachable');
        }
      })
    });

    expect(client).toBeNull();
  });

  it('forwards prompts and polls for the assistant response', async () => {
    const promptCalls: Array<{ system: string; user: string }> = [];
    let pollCount = 0;

    const client = await createOpencodeClient({
      pollIntervalMs: 0,
      pollTimeoutMs: 50,
      now: () => 1_000,
      loadSdk: async () => ({
        createOpencodeServer: async () => ({ url: 'http://127.0.0.1:4097' }),
        createOpencodeClient: () => ({
          session: {
            create: async () => ({ id: 'session-1' }),
            promptAsync: async ({ body }) => {
              promptCalls.push({
                system: body.system,
                user: body.parts[0]?.text ?? ''
              });
            },
            messages: async () => {
              pollCount += 1;
              if (pollCount < 3) {
                return { messages: [] };
              }
              return {
                messages: [
                  {
                    role: 'assistant',
                    parts: [{ type: 'text', text: '{"phase":"exploration"}' }]
                  }
                ]
              };
            }
          }
        })
      })
    });

    expect(client).not.toBeNull();
    expect(client?.id).toBe('opencode-harness');
    expect(client?.provider).toBe('opencode');
    expect(client?.unitTests).toEqual({
      testFile: 'tests/inference/opencode-client.test.ts',
      covers: ['provider identity', 'request forwarding', 'response normalization']
    });

    const result = await client!.infer({
      systemPrompt: 'shadow system',
      userMessage: 'context packet'
    });

    expect(promptCalls).toEqual([
      { system: 'shadow system', user: 'context packet' }
    ]);
    expect(result.text).toContain('exploration');
    expect(result.model).toBe('anthropic/claude-sonnet-4-5');
    expect(result.latencyMs).toBe(0);
  });
});
