// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStaticHost } from '../../src/renderer/host';
import type { CanonicalEvent, SnapshotPayload } from '../../src/shared/schema';
import App from '../../src/renderer/App';

vi.mock('../../src/renderer/renderer-surface-adapter', () => ({
  getRendererSurfaceAdapter: () => ({
    id: 'null-adapter',
    GraphCanvas: () => null,
    Timeline: () => null,
    ShadowPanel: () => null
  })
}));

function makeSnapshot(): SnapshotPayload {
  return {
    source: { kind: 'fixture', label: 'test.jsonl' },
    record: {
      sessionId: 's',
      title: 'Live Refresh Session',
      startedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:01:00.000Z',
      source: 'replay',
      eventCount: 0
    },
    state: {
      sessionId: 's',
      title: 'Live Refresh Session',
      currentObjective: 'obj',
      activePhase: 'implementation',
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

afterEach(() => {
  delete (window as unknown as { shadowAgent?: unknown }).shadowAgent;
  vi.restoreAllMocks();
});

describe('App live dirty-refresh (empty batch re-pulls the snapshot)', () => {
  it('calls getLiveSnapshot on an EMPTY live-events batch (the insight dirty refresh)', async () => {
    let liveCb: ((events: CanonicalEvent[]) => void) | null = null;
    const getLiveSnapshot = vi.fn(async () => makeSnapshot());
    (window as unknown as { shadowAgent: unknown }).shadowAgent = {
      onLiveEvents: (cb: (events: CanonicalEvent[]) => void) => {
        liveCb = cb;
        return () => {};
      },
      getLiveSnapshot
    };

    render(<App host={createStaticHost(makeSnapshot())} />);

    // Wait until the live-events subscription is wired.
    await waitFor(() => expect(liveCb).not.toBeNull());

    const callsBefore = getLiveSnapshot.mock.calls.length;
    // Fire an EMPTY batch — pre-fix this returned early and never re-pulled.
    liveCb!([]);

    await waitFor(() => {
      expect(getLiveSnapshot.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});
