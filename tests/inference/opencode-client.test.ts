import { describe, expect, it } from 'vitest';
import { createOpencodeClient } from '../../src/inference/opencode-client';
import { createTestLogger } from '../../src/shared/logger';

describe('createOpencodeClient', () => {
  it('returns null when the OpenCode SDK cannot be loaded', async () => {
    const client = await createOpencodeClient({
      loadSdk: async () => {
        throw new Error('missing sdk');
      }
    });

    expect(client).toBeNull();
  });

  it('writes SDK-load diagnostics to an injected logger', async () => {
    const logger = createTestLogger();
    const deps = {
      logger,
      loadSdk: async () => {
        throw new Error('missing sdk');
      }
    };

    const client = await createOpencodeClient(deps);

    expect(client).toBeNull();
    expect(logger.getRecent()).toContainEqual(expect.objectContaining({
      domain: 'inference',
      event: 'opencode.sdk_not_available',
      level: 'warn',
    }));
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
    expect(client?.provider).toBe('opencode');

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
