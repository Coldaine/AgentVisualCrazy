import { afterEach, describe, expect, it, vi } from 'vitest';
import * as directApi from '../../src/inference/direct-api';
import * as opencodeClient from '../../src/inference/opencode-client';
import * as openaiClient from '../../src/inference/openai-compatible-client';
import { createInferenceClient } from '../../src/inference/inference-client-factory';
import { createTestLogger } from '../../src/shared/logger';

describe('createInferenceClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SHADOW_INFERENCE_PROVIDER;
  });

  it('prefers the direct Anthropic client when SHADOW_INFERENCE_PROVIDER=anthropic', async () => {
    process.env.SHADOW_INFERENCE_PROVIDER = 'anthropic';
    const direct = { id: 'anthropic-direct-api', provider: 'anthropic' as const, infer: vi.fn() };
    vi.spyOn(directApi, 'createDirectApiClient').mockResolvedValue(direct);
    vi.spyOn(opencodeClient, 'createOpencodeClient').mockResolvedValue({
      id: 'opencode-harness',
      provider: 'opencode',
      infer: vi.fn()
    });

    const client = await createInferenceClient();

    expect(client).toBe(direct);
    expect(opencodeClient.createOpencodeClient).not.toHaveBeenCalled();
  });

  it('passes an injected logger to the selected provider factory', async () => {
    process.env.SHADOW_INFERENCE_PROVIDER = 'anthropic';
    const logger = createTestLogger();
    const direct = { id: 'anthropic-direct-api', provider: 'anthropic' as const, infer: vi.fn() };
    vi.spyOn(directApi, 'createDirectApiClient').mockResolvedValue(direct);

    const client = await createInferenceClient({ logger });

    expect(client).toBe(direct);
    expect(directApi.createDirectApiClient).toHaveBeenCalledWith(expect.objectContaining({ logger }));
  });

  it('uses OpenCode when available and no provider override is set', async () => {
    const opencode = { id: 'opencode-harness', provider: 'opencode' as const, infer: vi.fn() };
    vi.spyOn(opencodeClient, 'createOpencodeClient').mockResolvedValue(opencode);
    vi.spyOn(directApi, 'createDirectApiClient').mockResolvedValue({
      id: 'anthropic-direct-api',
      provider: 'anthropic',
      infer: vi.fn()
    });

    const client = await createInferenceClient();

    expect(client).toBe(opencode);
    expect(directApi.createDirectApiClient).not.toHaveBeenCalled();
  });

  it('falls back to Anthropic when OpenCode is unavailable', async () => {
    const direct = { id: 'anthropic-direct-api', provider: 'anthropic' as const, infer: vi.fn() };
    vi.spyOn(opencodeClient, 'createOpencodeClient').mockResolvedValue(null);
    vi.spyOn(directApi, 'createDirectApiClient').mockResolvedValue(direct);

    const client = await createInferenceClient();

    expect(client).toBe(direct);
  });

  it('uses the OpenAI-compatible client when SHADOW_INFERENCE_PROVIDER=openai', async () => {
    process.env.SHADOW_INFERENCE_PROVIDER = 'openai';
    const openai = { id: 'openai-compatible', provider: 'openai' as const, infer: vi.fn() };
    vi.spyOn(openaiClient, 'createOpenAiCompatibleClient').mockReturnValue(openai);
    const opencodeSpy = vi.spyOn(opencodeClient, 'createOpencodeClient');
    const directSpy = vi.spyOn(directApi, 'createDirectApiClient');

    const client = await createInferenceClient();

    expect(client).toBe(openai);
    expect(opencodeSpy).not.toHaveBeenCalled();
    expect(directSpy).not.toHaveBeenCalled();
  });
});
