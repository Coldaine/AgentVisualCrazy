// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createStaticHost } from '../../src/renderer/host';
import type { CanvasRendererProps } from '../../src/renderer/canvas/CanvasRenderer';
import type { ShadowInsight, SnapshotPayload } from '../../src/shared/schema';
import App from '../../src/renderer/App';

// Spy adapter: record the props App forwards to the canvas surface. Hoisted so
// the vi.mock factory (which is itself hoisted) can close over it safely.
const hoisted = vi.hoisted(() => ({ graphProps: [] as CanvasRendererProps[] }));

vi.mock('../../src/renderer/renderer-surface-adapter', () => ({
  getRendererSurfaceAdapter: () => ({
    id: 'spy-adapter',
    GraphCanvas: (props: CanvasRendererProps) => {
      hoisted.graphProps.push(props);
      return null;
    },
    Timeline: () => null,
    ShadowPanel: () => null
  })
}));

function baseSnapshot(shadowInsights: ShadowInsight[], riskSignals: string[]): SnapshotPayload {
  return {
    source: { kind: 'fixture', label: 'test.jsonl' },
    record: {
      sessionId: 's',
      title: 'Spy Session',
      startedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:01:00.000Z',
      source: 'replay',
      eventCount: 1
    },
    state: {
      sessionId: 's',
      title: 'Spy Session',
      currentObjective: 'obj',
      activePhase: 'implementation',
      agentNodes: [{ id: 'a', label: 'Agent A', state: 'active', toolCount: 1 }],
      timeline: [],
      transcript: [],
      fileAttention: [],
      riskSignals,
      nextMoves: [],
      shadowInsights
    },
    events: []
  };
}

describe('App forwards the model insight + riskLevel to the canvas (quarantine)', () => {
  it('passes the model insight as latestInsight, never the heuristic shadowInsights[0]', async () => {
    hoisted.graphProps.length = 0;
    const heuristicObjective: ShadowInsight = {
      kind: 'objective',
      source: 'heuristic',
      confidence: 0.72,
      scope: 'session',
      summary: 'heuristic objective',
      evidenceEventIds: []
    };
    const modelRisk: ShadowInsight = {
      kind: 'risk',
      source: 'model',
      confidence: 0.83,
      scope: 'session',
      summary: 'model risk: config churn',
      evidenceEventIds: []
    };
    const snapshot = baseSnapshot([heuristicObjective, modelRisk], ['signal a', 'signal b']);
    render(<App host={createStaticHost(snapshot)} />);

    await waitFor(() => {
      expect((hoisted.graphProps.at(-1)?.agentNodes ?? []).length).toBeGreaterThan(0);
    });

    const last = hoisted.graphProps.at(-1)!;
    expect(last.latestInsight).toBeDefined();
    expect(last.latestInsight?.source).toBe('model');
    expect(last.latestInsight?.summary).toBe('model risk: config churn');
    // never the heuristic insight at index 0
    expect(last.latestInsight?.summary).not.toBe(snapshot.state.shadowInsights[0].summary);
    expect(last.riskLevel).toBeDefined();
  });

  it('passes latestInsight=undefined when there is no model insight (no heuristic-as-model)', async () => {
    hoisted.graphProps.length = 0;
    const heuristicOnly: ShadowInsight[] = [
      { kind: 'objective', source: 'heuristic', confidence: 0.72, scope: 'session', summary: 'h-obj', evidenceEventIds: [] },
      { kind: 'phase', source: 'heuristic', confidence: 0.68, scope: 'session', summary: 'h-phase', evidenceEventIds: [] }
    ];
    const snapshot = baseSnapshot(heuristicOnly, []);
    render(<App host={createStaticHost(snapshot)} />);

    await waitFor(() => {
      expect((hoisted.graphProps.at(-1)?.agentNodes ?? []).length).toBeGreaterThan(0);
    });

    const last = hoisted.graphProps.at(-1)!;
    expect(last.latestInsight).toBeUndefined();
    expect(last.riskLevel).toBe('low');
  });
});
