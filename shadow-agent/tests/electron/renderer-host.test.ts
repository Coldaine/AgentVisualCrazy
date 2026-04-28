import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShadowAgentBridge } from '../../src/shared/schema';
import { createElectronHost, getShadowAgentBridge } from '../../src/electron/renderer-host';

function makePrivacyPolicy() {
  return {
    allowRawTranscriptStorage: false,
    allowOffHostInference: false,
    processingMode: 'local-only' as const,
    transcriptHandling: 'sanitized-by-default' as const
  };
}

describe('electron renderer host', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('returns the preload bridge exposed on window', () => {
    const bridge: ShadowAgentBridge = {
      bootstrap: vi.fn(),
      onLiveEvents: vi.fn(() => vi.fn()),
      getLiveSnapshot: vi.fn(async () => null),
      openReplayFile: vi.fn(),
      getPrivacyPolicy: vi.fn(async () => makePrivacyPolicy()),
      updatePrivacySettings: vi.fn(async () => makePrivacyPolicy()),
      exportReplayJsonl: vi.fn()
    };

    (globalThis as { window: { shadowAgent: ShadowAgentBridge } }).window = { shadowAgent: bridge };

    expect(getShadowAgentBridge()).toBe(bridge);
  });

  it('throws a descriptive error when the preload bridge is missing', () => {
    (globalThis as unknown as { window: Record<string, unknown> }).window = {};

    expect(() => getShadowAgentBridge()).toThrow(
      'Shadow Agent preload bridge is unavailable. Start the app via Electron main process.'
    );
  });

  it('adapts the preload bridge into the platform-agnostic renderer host', async () => {
    const bridge: ShadowAgentBridge = {
      bootstrap: vi.fn(async () => {
        throw new Error('not used');
      }),
      onLiveEvents: vi.fn(() => vi.fn()),
      getLiveSnapshot: vi.fn(async () => null),
      openReplayFile: vi.fn(async () => null),
      getPrivacyPolicy: vi.fn(async () => makePrivacyPolicy()),
      updatePrivacySettings: vi.fn(async () => makePrivacyPolicy()),
      exportReplayJsonl: vi.fn(async () => ({ canceled: true }))
    };

    const host = createElectronHost(bridge);

    expect(host.loadInitialSnapshot).not.toBe(bridge.bootstrap);
    await host.openReplayFile?.();
    await host.exportReplayJsonl?.([], 'session.jsonl');

    expect(bridge.openReplayFile).toHaveBeenCalledTimes(1);
    expect(bridge.exportReplayJsonl).toHaveBeenCalledWith([], 'session.jsonl');
  });
});
