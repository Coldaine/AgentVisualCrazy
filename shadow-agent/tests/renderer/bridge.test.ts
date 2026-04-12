import { afterEach, describe, expect, it } from 'vitest';
import type { ShadowAgentBridge } from '../../src/shared/schema';
import { getShadowAgentBridge } from '../../src/renderer/bridge';

describe('renderer bridge', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('returns the preload bridge exposed on window', () => {
    const bridge: ShadowAgentBridge = {
      bootstrap: async () => {
        throw new Error('not used in test');
      },
      openReplayFile: async () => null,
      exportReplayJsonl: async () => ({ canceled: true })
    };

    (globalThis as { window: { shadowAgent: ShadowAgentBridge } }).window = { shadowAgent: bridge };

    expect(getShadowAgentBridge()).toBe(bridge);
  });

  it('throws a descriptive error when preload bridge is missing', () => {
    (globalThis as { window: Record<string, unknown> }).window = {};

    expect(() => getShadowAgentBridge()).toThrow(
      'Shadow Agent preload bridge is unavailable. Start the app via Electron main process.'
    );
  });
});
