import { afterEach, describe, expect, it, vi } from 'vitest';
import * as directApi from '../../src/inference/direct-api';
import * as opencodeClient from '../../src/inference/opencode-client';
import { createInferenceClient } from '../../src/inference/inference-client-factory';
import type { InferenceClient, Provider } from '../../src/inference/inference-client';

function inferenceAdapter(id: string, provider: Provider): InferenceClient {
  return {
    id,
    provider,
    unitTests: {
      testFile: 'tests/inference/inference-client-factory.test.ts',
      covers: ['provider selection']
    },
    infer: vi.fn()
  };
}

describe('createInferenceClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SHADOW_INFERENCE_PROVIDER;
  });

  it('prefers the direct Anthropic client when SHADOW_INFERENCE_PROVIDER=anthropic', async () => {
    process.env.SHADOW_INFERENCE_PROVIDER = 'anthropic';
    const direct = inferenceAdapter('anthropic-direct-api', 'anthropic');
    vi.spyOn(directApi, 'createDirectApiClient').mockResolvedValue(direct);
    vi.spyOn(opencodeClient, 'createOpencodeClient').mockResolvedValue(inferenceAdapter('opencode-harness', 'opencode'));

    const client = await createInferenceClient();

    expect(client).toBe(direct);
    expect(opencodeClient.createOpencodeClient).not.toHaveBeenCalled();
  });

  it('uses OpenCode when available and no provider override is set', async () => {
    const opencode = inferenceAdapter('opencode-harness', 'opencode');
    vi.spyOn(opencodeClient, 'createOpencodeClient').mockResolvedValue(opencode);
    vi.spyOn(directApi, 'createDirectApiClient').mockResolvedValue(inferenceAdapter('anthropic-direct-api', 'anthropic'));

    const client = await createInferenceClient();

    expect(client).toBe(opencode);
    expect(directApi.createDirectApiClient).not.toHaveBeenCalled();
  });

  it('falls back to Anthropic when OpenCode is unavailable', async () => {
    const direct = inferenceAdapter('anthropic-direct-api', 'anthropic');
    vi.spyOn(opencodeClient, 'createOpencodeClient').mockResolvedValue(null);
    vi.spyOn(directApi, 'createDirectApiClient').mockResolvedValue(direct);

    const client = await createInferenceClient();

    expect(client).toBe(direct);
  });
});
