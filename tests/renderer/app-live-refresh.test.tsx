// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
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

function makeSnapshot(overrides: {
  title?: string;
  objective?: string;
  phase?: string;
  sourceKind?: SnapshotPayload['source']['kind'];
  sourceLabel?: string;
} = {}): SnapshotPayload {
  const title = overrides.title ?? 'Live Refresh Session';

  return {
    source: { kind: overrides.sourceKind ?? 'fixture', label: overrides.sourceLabel ?? 'test.jsonl' },
    record: {
      sessionId: 's',
      title,
      startedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:01:00.000Z',
      source: 'replay',
      eventCount: 0
    },
    state: {
      sessionId: 's',
      title,
      currentObjective: overrides.objective ?? 'Initial objective',
      activePhase: overrides.phase ?? 'implementation',
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
  it('renders the refreshed snapshot from an EMPTY live-events batch', async () => {
    let liveCb: ((events: CanonicalEvent[]) => void) | null = null;
    const initialSnapshot = makeSnapshot({
      title: 'Initial Live Session',
      objective: 'Initial objective',
      phase: 'implementation',
      sourceKind: 'transcript',
      sourceLabel: 'live transcript'
    });
    const refreshedSnapshot = makeSnapshot({
      title: 'Refreshed Live Session',
      objective: 'Review model insight',
      phase: 'validation',
      sourceKind: 'transcript',
      sourceLabel: 'live transcript'
    });
    const getLiveSnapshot = vi
      .fn<() => Promise<SnapshotPayload | null>>()
      .mockResolvedValueOnce(initialSnapshot)
      .mockResolvedValueOnce(refreshedSnapshot);
    (window as unknown as { shadowAgent: unknown }).shadowAgent = {
      onLiveEvents: (cb: (events: CanonicalEvent[]) => void) => {
        liveCb = cb;
        return () => {};
      },
      getLiveSnapshot
    };

    render(<App host={createStaticHost(initialSnapshot)} />);

    // Wait until the live-events subscription is wired.
    await waitFor(() => expect(liveCb).not.toBeNull());
    await screen.findByText('Initial objective');

    const callsBefore = getLiveSnapshot.mock.calls.length;
    // Empty batches carry insight-dirty signals, so the UI must update, not just call the bridge.
    liveCb!([]);

    await waitFor(() => {
      expect(getLiveSnapshot.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    expect(await screen.findByText('Review model insight')).toBeTruthy();
    expect(screen.getByText('Refreshed Live Session')).toBeTruthy();
  });
});
