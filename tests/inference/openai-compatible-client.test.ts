import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenAiCompatibleClient } from '../../src/inference/openai-compatible-client';
import { createTestLogger } from '../../src/shared/logger';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

beforeEach(() => {
  delete process.env.OPENAI_BASE_URL;
  delete process.env.SHADOW_INFERENCE_BASE_URL;
  delete process.env.SHADOW_INFERENCE_MODEL;
  delete process.env.OPENAI_API_KEY;
});

describe('createOpenAiCompatibleClient', () => {
  it('returns null when no base URL is configured', () => {
    const client = createOpenAiCompatibleClient({ fetchImpl: vi.fn() as unknown as typeof fetch });
    expect(client).toBeNull();
  });

  it('writes missing-base-url diagnostics to an injected logger', () => {
    const logger = createTestLogger();
    const deps = { fetchImpl: vi.fn() as unknown as typeof fetch, logger };

    const client = createOpenAiCompatibleClient(deps);

    expect(client).toBeNull();
    expect(logger.getRecent()).toContainEqual(expect.objectContaining({
      domain: 'inference',
      event: 'openai_compatible.no_base_url',
      level: 'warn',
    }));
  });

  it('reports openai provider identity', () => {
    const client = createOpenAiCompatibleClient({
      baseUrl: 'http://localhost:1234/v1',
      fetchImpl: vi.fn() as unknown as typeof fetch
    });
    expect(client?.id).toBe('openai-compatible');
    expect(client?.provider).toBe('openai');
  });

  it('forwards system+user messages to {baseURL}/chat/completions and normalizes the response', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ model: 'local-model', choices: [{ message: { content: '{"phase":"x"}' } }] })
    );
    let clock = 1000;
    const client = createOpenAiCompatibleClient({
      baseUrl: 'http://localhost:1234/v1/',
      apiKey: 'sk-test',
      model: 'my-model',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => {
        clock += 30;
        return clock;
      }
    });

    const result = await client!.infer({ systemPrompt: 'sys', userMessage: 'usr' });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:1234/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('my-model');
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'usr' }
    ]);
    expect(result.text).toBe('{"phase":"x"}');
    expect(result.model).toBe('local-model');
    expect(result.latencyMs).toBe(30);
  });

  it('omits the Authorization header when no API key is set', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    const client = createOpenAiCompatibleClient({
      baseUrl: 'http://localhost:1234/v1',
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    await client!.infer({ systemPrompt: 's', userMessage: 'u' });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('throws a typed error on a non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'bad' }, 500));
    const client = createOpenAiCompatibleClient({
      baseUrl: 'http://x/v1',
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    await expect(client!.infer({ systemPrompt: 's', userMessage: 'u' })).rejects.toThrow(/returned 500/);
  });

  it('throws a typed error when a 2xx body is not valid JSON', async () => {
    const fetchImpl = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          text: async () => 'upstream proxy says hello, not json',
          json: async () => {
            throw new SyntaxError('Unexpected token');
          }
        }) as unknown as Response
    );
    const client = createOpenAiCompatibleClient({
      baseUrl: 'http://x/v1',
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    await expect(client!.infer({ systemPrompt: 's', userMessage: 'u' })).rejects.toThrow(/invalid JSON/);
  });

  it('throws a timeout error when the request aborts', async () => {
    const fetchImpl = vi.fn(async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    });
    const client = createOpenAiCompatibleClient({
      baseUrl: 'http://x/v1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 10
    });
    await expect(client!.infer({ systemPrompt: 's', userMessage: 'u' })).rejects.toThrow(/timed out/);
  });
});
