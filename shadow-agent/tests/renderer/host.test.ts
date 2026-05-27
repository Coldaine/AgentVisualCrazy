import { describe, expect, it } from 'vitest';
import type { SnapshotPayload } from '../../src/shared/schema';
import { createStaticHost, getHostCapabilities } from '../../src/renderer/host';

function makeSnapshot(): SnapshotPayload {
  return {
    source: { kind: 'fixture', label: 'fixture' },
    record: {
      sessionId: 'session-1',
      title: 'Fixture Session',
      startedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      source: 'replay',
      eventCount: 0
    },
    state: {
      sessionId: 'session-1',
      title: 'Fixture Session',
      currentObjective: 'Observe the session',
      activePhase: 'analysis',
      agentNodes: [],
      timeline: [],
      transcript: [],
      fileAttention: [],
      riskSignals: [],
      nextMoves: [],
      shadowInsights: []
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

describe('renderer host helpers', () => {
  it('creates a static host with no optional file operations', async () => {
    const snapshot = makeSnapshot();
    const host = createStaticHost(snapshot);

    await expect(host.loadInitialSnapshot()).resolves.toBe(snapshot);
    expect(getHostCapabilities(host)).toEqual({
      canStreamLiveEvents: false,
      canLoadLiveSnapshot: false,
      canOpenReplayFile: false,
      canManagePrivacy: false,
      canExportReplayJsonl: false
    });
  });

  it('reports live capture hooks without requiring Electron file operations', async () => {
    const snapshot = makeSnapshot();
    const unsubscribe = () => {};
    const host = {
      loadInitialSnapshot: async () => snapshot,
      loadLiveSnapshot: async () => snapshot,
      subscribeLiveEvents: () => unsubscribe
    };

    await expect(host.loadLiveSnapshot()).resolves.toBe(snapshot);
    expect(getHostCapabilities(host)).toEqual({
      canStreamLiveEvents: true,
      canLoadLiveSnapshot: true,
      canOpenReplayFile: false,
      canManagePrivacy: false,
      canExportReplayJsonl: false
    });
  });
});
