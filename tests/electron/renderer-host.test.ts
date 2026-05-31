import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShadowAgentBridge, SnapshotPayload } from '../../src/shared/schema';
import { createElectronHost, getShadowAgentBridge } from '../../src/electron/renderer-host';

function makePrivacyPolicy() {
  return {
    allowRawTranscriptStorage: false,
    allowOffHostInference: false,
    processingMode: 'local-only' as const,
    transcriptHandling: 'sanitized-by-default' as const
  };
}

function makeSnapshot(title: string): SnapshotPayload {
  return {
    source: { kind: 'fixture', label: title },
    record: {
      sessionId: 's',
      title,
      startedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      source: 'replay',
      eventCount: 0
    },
    state: {
      sessionId: 's',
      title,
      currentObjective: title,
      activePhase: 'idle',
      agentNodes: [],
      timeline: [],
      transcript: [],
      fileAttention: [],
      riskSignals: [],
      nextMoves: [],
      shadowInsights: []
    },
    events: [],
    privacy: makePrivacyPolicy()
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

  it('delegates every host capability to the preload bridge', async () => {
    const snapshot = makeSnapshot('initial snapshot');
    const privacyPolicy = makePrivacyPolicy();
    const updatedPrivacyPolicy = { ...privacyPolicy, allowOffHostInference: true, processingMode: 'off-host-opted-in' as const };
    const bridge: ShadowAgentBridge = {
      bootstrap: vi.fn(async () => snapshot),
      onLiveEvents: vi.fn(() => vi.fn()),
      getLiveSnapshot: vi.fn(async () => null),
      openReplayFile: vi.fn(async () => null),
      getPrivacyPolicy: vi.fn(async () => privacyPolicy),
      updatePrivacySettings: vi.fn(async () => updatedPrivacyPolicy),
      exportReplayJsonl: vi.fn(async () => ({ canceled: true }))
    };

    const host = createElectronHost(bridge);

    // Delegation must pass the bridge's return value straight through, not just
    // call it — asserting the resolved value catches wiring that drops results.
    await expect(host.loadInitialSnapshot()).resolves.toBe(snapshot);
    await expect(host.openReplayFile?.()).resolves.toBeNull();
    await expect(host.getPrivacyPolicy?.()).resolves.toBe(privacyPolicy);
    await expect(host.updatePrivacySettings?.({ allowOffHostInference: true })).resolves.toBe(updatedPrivacyPolicy);
    await expect(host.exportReplayJsonl?.([], 'session.jsonl')).resolves.toEqual({ canceled: true });

    expect(bridge.bootstrap).toHaveBeenCalledTimes(1);
    expect(bridge.openReplayFile).toHaveBeenCalledTimes(1);
    expect(bridge.getPrivacyPolicy).toHaveBeenCalledTimes(1);
    expect(bridge.updatePrivacySettings).toHaveBeenCalledWith({ allowOffHostInference: true });
    expect(bridge.exportReplayJsonl).toHaveBeenCalledWith([], 'session.jsonl');
  });
});
