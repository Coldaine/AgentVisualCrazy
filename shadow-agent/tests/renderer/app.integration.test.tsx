// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStaticHost, type ShadowAgentHost } from '../../src/renderer/host';
import type { ShadowAgentBridge, SnapshotPayload } from '../../src/shared/schema';
import App from '../../src/renderer/App';

// Mock canvas/spring-heavy subcomponents to isolate App wiring tests
vi.mock('../../src/renderer/renderer-surface-adapter', () => ({
  getRendererSurfaceAdapter: () => ({
    id: 'test-adapter',
    GraphCanvas: () => null,
    Timeline: () => null,
    ShadowPanel: () => null
  })
}));

function makeSnapshot(overrides: Partial<SnapshotPayload> = {}): SnapshotPayload {
  return {
    source: { kind: 'fixture', label: 'test.jsonl' },
    record: {
      sessionId: 'test-session',
      title: 'Test Session',
      startedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:01:00.000Z',
      source: 'replay',
      eventCount: 5
    },
    state: {
      sessionId: 'test-session',
      title: 'Test Session',
      currentObjective: 'testing',
      activePhase: 'testing',
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
    },
    ...overrides
  };
}

describe('App integration', () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, 'shadowAgent');
  });

  it('shows loading state on initial render', () => {
    const host: ShadowAgentHost = {
      loadInitialSnapshot: () => new Promise(() => {})
    };
    render(<App host={host} />);
    expect(screen.getByText(/bootstrapping/i)).toBeInTheDocument();
  });

  it('renders snapshot data after successful boot', async () => {
    const snapshot = makeSnapshot({
      record: { ...makeSnapshot().record, title: 'My Test Session' },
      state: {
        ...makeSnapshot().state,
        currentObjective: 'Implement feature X',
        activePhase: 'development',
        timeline: [
          { id: 'evt-1', timestamp: '2026-01-01T00:00:00.000Z', label: 'Started coding', kind: 'tool_started' },
          { id: 'evt-2', timestamp: '2026-01-01T00:01:00.000Z', label: 'Completed task', kind: 'tool_completed' }
        ],
        transcript: [
          {
            id: 'tr-1',
            actor: 'User',
            text: 'Please implement the feature',
            timestamp: '2026-01-01T00:00:00.000Z',
            redacted: false
          }
        ],
        fileAttention: [{ filePath: 'src/app.ts', touches: 5 }]
      }
    });
    const host = createStaticHost(snapshot);
    render(<App host={host} />);

    await waitFor(() => {
      expect(screen.getByText('My Test Session')).toBeInTheDocument();
    });

    expect(screen.getByText('Implement feature X')).toBeInTheDocument();
    expect(screen.getByText('FIXTURE')).toBeInTheDocument();
    expect(screen.getByText('Graph')).toBeInTheDocument();
    expect(screen.getByText('Timeline')).toBeInTheDocument();
    expect(screen.getByText('Please implement the feature')).toBeInTheDocument();
    expect(screen.getByText('src/app.ts')).toBeInTheDocument();
  });

  it('displays error message when boot fails', async () => {
    const rejectingHost: ShadowAgentHost = {
      loadInitialSnapshot: () => Promise.reject(new Error('Failed to load'))
    };
    render(<App host={rejectingHost} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load')).toBeInTheDocument();
    });
  });

  it('shows empty states when timeline/transcript/file lists are empty', async () => {
    const snapshot = makeSnapshot({
      state: {
        ...makeSnapshot().state,
        timeline: [],
        transcript: [],
        fileAttention: []
      }
    });
    const host = createStaticHost(snapshot);
    render(<App host={host} />);

    await waitFor(() => {
      expect(screen.getByText('Test Session')).toBeInTheDocument();
    });

    expect(screen.getByText('No timeline events yet.')).toBeInTheDocument();
    expect(screen.getByText('No transcript content is available yet.')).toBeInTheDocument();
    expect(screen.getByText('No file attention has been inferred yet.')).toBeInTheDocument();
  });

  it('prefers live snapshots supplied by the injected host', async () => {
    const fixtureSnapshot = makeSnapshot({
      record: { ...makeSnapshot().record, title: 'Fixture Snapshot' }
    });
    const liveSnapshot = makeSnapshot({
      source: { kind: 'transcript', label: 'live-host' },
      record: { ...makeSnapshot().record, title: 'Live Host Snapshot' },
      state: {
        ...makeSnapshot().state,
        currentObjective: 'Live host objective'
      }
    });
    const host: ShadowAgentHost = {
      loadInitialSnapshot: vi.fn(async () => fixtureSnapshot),
      loadLiveSnapshot: vi.fn(async () => liveSnapshot)
    };

    render(<App host={host} />);

    await waitFor(() => {
      expect(screen.getByText('Live Host Snapshot')).toBeInTheDocument();
    });

    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText('Live host objective')).toBeInTheDocument();
    expect(host.loadInitialSnapshot).not.toHaveBeenCalled();
  });

  it('does not read an ambient Electron bridge when a web host is supplied', async () => {
    const hostSnapshot = makeSnapshot({
      record: { ...makeSnapshot().record, title: 'Injected Web Host' }
    });
    const ambientSnapshot = makeSnapshot({
      source: { kind: 'transcript', label: 'ambient-electron' },
      record: { ...makeSnapshot().record, title: 'Ambient Electron Bridge' }
    });
    const bridge: ShadowAgentBridge = {
      bootstrap: vi.fn(async () => ambientSnapshot),
      onLiveEvents: vi.fn(() => vi.fn()),
      getLiveSnapshot: vi.fn(async () => ambientSnapshot),
      openReplayFile: vi.fn(async () => null),
      getPrivacyPolicy: vi.fn(async () => ambientSnapshot.privacy),
      updatePrivacySettings: vi.fn(async () => ambientSnapshot.privacy),
      exportReplayJsonl: vi.fn(async () => ({ canceled: true }))
    };

    Object.defineProperty(window, 'shadowAgent', {
      configurable: true,
      value: bridge
    });

    render(<App host={createStaticHost(hostSnapshot)} />);

    await waitFor(() => {
      expect(screen.getByText('Injected Web Host')).toBeInTheDocument();
    });

    expect(screen.queryByText('Ambient Electron Bridge')).not.toBeInTheDocument();
    expect(bridge.getLiveSnapshot).not.toHaveBeenCalled();
    expect(bridge.onLiveEvents).not.toHaveBeenCalled();
  });
});
