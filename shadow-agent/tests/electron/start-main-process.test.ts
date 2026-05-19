import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SnapshotPayload } from '../../src/shared/schema';

const handleMock = vi.fn();
const removeHandlerMock = vi.fn();

vi.mock('electron', () => ({
  app: {
    whenReady: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    quit: vi.fn(),
    getAppPath: vi.fn(() => 'C:/tmp')
  },
  BrowserWindow: vi.fn(),
  ipcMain: {
    handle: handleMock,
    removeHandler: removeHandlerMock
  }
}));

vi.mock('../../src/electron/session-io', () => ({
  buildFixtureSnapshot: vi.fn(),
  loadSnapshotFromFile: vi.fn(),
  pickOpenFile: vi.fn(),
  saveReplayFile: vi.fn()
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the callback registered for a given IPC channel name. */
function getHandlerFor(channel: string): (...args: unknown[]) => unknown {
  const call = handleMock.mock.calls.find(([ch]) => ch === channel);
  if (!call) {
    throw new Error(`No handler registered for '${channel}'`);
  }
  return call[1] as (...args: unknown[]) => unknown;
}

function makeSnapshot(): SnapshotPayload {
  return {
    source: { kind: 'fixture', label: 'test' },
    record: {
      sessionId: 'x', title: 'Test', startedAt: '', updatedAt: '',
      source: 'replay', eventCount: 0
    },
    state: {
      sessionId: 'x', title: 'Test', currentObjective: '', activePhase: 'idle',
      agentNodes: [], timeline: [], transcript: [], fileAttention: [],
      riskSignals: [], nextMoves: [], shadowInsights: []
    },
    events: [],
    privacy: {
      allowRawTranscriptStorage: false,
      allowOffHostInference: false,
      processingMode: 'local-only',
      transcriptHandling: 'sanitized-by-default'
    }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    handleMock.mockReset();
    removeHandlerMock.mockReset();
    vi.resetModules();
  });

  it('removes old handlers before registering channels', async () => {
    const { registerIpcHandlers } = await import('../../src/electron/start-main-process');

    registerIpcHandlers(() => null);

    expect(removeHandlerMock).toHaveBeenCalledWith('shadow-agent:bootstrap');
    expect(removeHandlerMock).toHaveBeenCalledWith('shadow-agent:open-replay-file');
    expect(removeHandlerMock).toHaveBeenCalledWith('shadow-agent:export-replay-jsonl');
    expect(removeHandlerMock).toHaveBeenCalledWith('shadow-agent:get-privacy-policy');
    expect(removeHandlerMock).toHaveBeenCalledWith('shadow-agent:update-privacy-settings');
    const handledChannels = handleMock.mock.calls.map(([channel]) => channel);
    expect(handledChannels).toEqual(expect.arrayContaining([
      'shadow-agent:bootstrap',
      'shadow-agent:open-replay-file',
      'shadow-agent:export-replay-jsonl',
      'shadow-agent:get-privacy-policy',
      'shadow-agent:update-privacy-settings'
    ]));

    const removeOrder = removeHandlerMock.mock.invocationCallOrder;
    const handleOrder = handleMock.mock.invocationCallOrder;
    expect(removeOrder[0]).toBeLessThan(handleOrder[0]);
    expect(removeOrder[1]).toBeLessThan(handleOrder[1]);
    expect(removeOrder[2]).toBeLessThan(handleOrder[2]);
  });

  it('bootstrap handler calls buildFixtureSnapshot and returns result', async () => {
    const { registerIpcHandlers } = await import('../../src/electron/start-main-process');
    const { buildFixtureSnapshot } = await import('../../src/electron/session-io');
    const snapshot = makeSnapshot();
    vi.mocked(buildFixtureSnapshot).mockReturnValue(snapshot);

    registerIpcHandlers(() => null);
    const handler = getHandlerFor('shadow-agent:bootstrap');
    const result = await handler();

    expect(buildFixtureSnapshot).toHaveBeenCalledOnce();
    expect(result).toBe(snapshot);
  });

  it('open-replay handler returns null when user cancels the dialog', async () => {
    const { registerIpcHandlers } = await import('../../src/electron/start-main-process');
    const { pickOpenFile } = await import('../../src/electron/session-io');
    vi.mocked(pickOpenFile).mockResolvedValue(undefined);

    registerIpcHandlers(() => null);
    const handler = getHandlerFor('shadow-agent:open-replay-file');
    const result = await handler();

    expect(result).toBeNull();
  });

  it('open-replay handler loads and returns snapshot for a valid file', async () => {
    const { registerIpcHandlers } = await import('../../src/electron/start-main-process');
    const { pickOpenFile, loadSnapshotFromFile } = await import('../../src/electron/session-io');
    const fixtureDir = fileURLToPath(new URL('../fixtures/replays', import.meta.url));
    const filePath = path.join(fixtureDir, 'happy-path.replay.jsonl');
    const snapshot = makeSnapshot();
    vi.mocked(pickOpenFile).mockResolvedValue(filePath);
    vi.mocked(loadSnapshotFromFile).mockResolvedValue(snapshot);

    registerIpcHandlers(() => null);
    const handler = getHandlerFor('shadow-agent:open-replay-file');
    const result = await handler();

    expect(loadSnapshotFromFile).toHaveBeenCalledWith(
      filePath,
      expect.objectContaining({
        allowRawTranscriptStorage: false,
        allowOffHostInference: false
      })
    );
    expect(result).toBe(snapshot);
  });

  it('open-replay handler re-throws when loadSnapshotFromFile throws', async () => {
    const { registerIpcHandlers } = await import('../../src/electron/start-main-process');
    const { pickOpenFile, loadSnapshotFromFile } = await import('../../src/electron/session-io');
    vi.mocked(pickOpenFile).mockResolvedValue('/some/file.jsonl');
    vi.mocked(loadSnapshotFromFile).mockRejectedValue(new Error('parse error'));

    registerIpcHandlers(() => null);
    const handler = getHandlerFor('shadow-agent:open-replay-file');
    await expect(handler()).rejects.toThrow('parse error');
  });

  it('export-replay handler returns saveReplayFile result on success', async () => {
    const { registerIpcHandlers } = await import('../../src/electron/start-main-process');
    const { saveReplayFile } = await import('../../src/electron/session-io');
    vi.mocked(saveReplayFile).mockResolvedValue({ canceled: false, filePath: '/out/file.jsonl' });

    registerIpcHandlers(() => null);
    const handler = getHandlerFor('shadow-agent:export-replay-jsonl');
    const result = await handler(undefined, [], 'out.jsonl');

    expect(result).toEqual({ canceled: false, filePath: '/out/file.jsonl' });
  });

  it('export-replay handler returns error object when saveReplayFile throws', async () => {
    const { registerIpcHandlers } = await import('../../src/electron/start-main-process');
    const { saveReplayFile } = await import('../../src/electron/session-io');
    vi.mocked(saveReplayFile).mockRejectedValue(new Error('disk full'));

    registerIpcHandlers(() => null);
    const handler = getHandlerFor('shadow-agent:export-replay-jsonl');
    const result = await handler(undefined, [], 'out.jsonl') as { canceled: boolean; error?: string };

    expect(result.error).toBe('disk full');
    expect(result.canceled).toBe(false);
  });

  it('privacy handlers expose and update the current policy', async () => {
    const { registerIpcHandlers } = await import('../../src/electron/start-main-process');
    const updateSettings = vi.fn(async (updates: { allowOffHostInference?: boolean }) => ({
      allowRawTranscriptStorage: true,
      allowOffHostInference: updates.allowOffHostInference === true
    }));

    registerIpcHandlers(() => null, {
      getSettings: () => ({
        allowRawTranscriptStorage: false,
        allowOffHostInference: false
      }),
      updateSettings
    });

    const getHandler = getHandlerFor('shadow-agent:get-privacy-policy');
    const updateHandler = getHandlerFor('shadow-agent:update-privacy-settings');
    const current = await getHandler() as SnapshotPayload['privacy'];
    const next = await updateHandler(undefined, { allowOffHostInference: true }) as SnapshotPayload['privacy'];

    expect(current).toEqual({
      allowRawTranscriptStorage: false,
      allowOffHostInference: false,
      processingMode: 'local-only',
      transcriptHandling: 'sanitized-by-default'
    });
    expect(updateSettings).toHaveBeenCalledWith({ allowOffHostInference: true });
    expect(next).toEqual({
      allowRawTranscriptStorage: true,
      allowOffHostInference: true,
      processingMode: 'off-host-opted-in',
      transcriptHandling: 'sanitized-by-default'
    });
  });
});

// ---------------------------------------------------------------------------
// Preload bridge surface contract
// ---------------------------------------------------------------------------

describe('ShadowAgentBridge surface', () => {
  it('exposes the live bridge methods alongside the file operations', async () => {
    // Import the type and verify the bridge object shape matches
    const { getShadowAgentBridge } = await import('../../src/electron/renderer-host');
    const bridge = {
      bootstrap: async () => makeSnapshot(),
      onLiveEvents: () => () => undefined,
      getLiveSnapshot: async () => null as SnapshotPayload | null,
      openReplayFile: async () => null as SnapshotPayload | null,
      getPrivacyPolicy: async () => makeSnapshot().privacy,
      updatePrivacySettings: async () => makeSnapshot().privacy,
      exportReplayJsonl: async (_events = [], _suggestedFileName?: string, _options?: { storeRawTranscript?: boolean }) => ({ canceled: true })
    };
    (globalThis as unknown as { window: { shadowAgent: typeof bridge } }).window = { shadowAgent: bridge };

    const result = getShadowAgentBridge();
    expect(typeof result.bootstrap).toBe('function');
    expect(typeof result.onLiveEvents).toBe('function');
    expect(typeof result.getLiveSnapshot).toBe('function');
    expect(typeof result.openReplayFile).toBe('function');
    expect(typeof result.exportReplayJsonl).toBe('function');
    expect(Object.keys(result).sort()).toEqual([
      'bootstrap',
      'exportReplayJsonl',
      'getLiveSnapshot',
      'getPrivacyPolicy',
      'onLiveEvents',
      'openReplayFile',
      'updatePrivacySettings'
    ]);

    Reflect.deleteProperty(globalThis, 'window');
  });
});

