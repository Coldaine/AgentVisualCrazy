import { startTransition, useEffect, useMemo, useReducer, useRef } from 'react';
import type { CanonicalEvent, DerivedState, ShadowAgentBridge, SnapshotPayload, TimelineItem } from '../shared/schema';
import { appReducer, initialAppState } from './app-state';
import CanvasRenderer from './canvas/CanvasRenderer';
import TimelineScrubber from './components/TimelineScrubber';
import ShadowPanel from './components/ShadowPanel';
import { getHostCapabilities, type ShadowAgentHost } from './host';
import { formatClock, safeFileName, toLabel } from './view-model';

const LIVE_REFRESH_DEBOUNCE_MS = 300;

function getLiveBridge(): Pick<ShadowAgentBridge, 'onLiveEvents' | 'getLiveSnapshot'> | null {
  if (typeof window === 'undefined' || !window.shadowAgent) {
    return null;
  }

  const { onLiveEvents, getLiveSnapshot } = window.shadowAgent;
  if (typeof onLiveEvents !== 'function' || typeof getLiveSnapshot !== 'function') {
    return null;
  }

  return { onLiveEvents, getLiveSnapshot };
}

function Panel({
  title,
  eyebrow,
  className = '',
  actions,
  children
}: {
  title: string;
  eyebrow?: string;
  className?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={`panel ${className}`.trim()}>
      <header className="panel__header">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
        {actions ? <div className="panel__actions">{actions}</div> : null}
      </header>
      <div className="panel__body">{children}</div>
    </section>
  );
}

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'accent' | 'danger' }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

function TimelineView({ timeline }: { timeline: TimelineItem[] }) {
  if (timeline.length === 0) {
    return <p className="empty-state">No timeline events yet.</p>;
  }

  return (
    <div className="stack stack--tight">
      {timeline.map((timelineEvent) => (
        <article className="timeline-item" key={timelineEvent.id}>
          <div className="timeline-item__time">{formatClock(timelineEvent.timestamp)}</div>
          <div className="timeline-item__content">
            <div className="timeline-item__topline">
              <span className="timeline-item__label">{timelineEvent.label}</span>
              <Badge tone="neutral">{toLabel(timelineEvent.kind)}</Badge>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function TranscriptView({ transcript }: { transcript: DerivedState['transcript'] }) {
  if (transcript.length === 0) {
    return <p className="empty-state">No transcript content is available yet.</p>;
  }

  return (
    <div className="stack stack--tight">
      {transcript.map((entry) => (
        <article className="transcript-item" key={entry.id}>
          <div className="transcript-item__meta">
            <span className="transcript-item__actor">{entry.actor}</span>
            <span className="transcript-item__time">{formatClock(entry.timestamp)}</span>
          </div>
          <p className="transcript-item__text">{entry.text}</p>
        </article>
      ))}
    </div>
  );
}

function FileAttentionView({ files }: { files: DerivedState['fileAttention'] }) {
  if (files.length === 0) {
    return <p className="empty-state">No file attention has been inferred yet.</p>;
  }

  const maxTouches = Math.max(...files.map((file) => file.touches), 1);

  return (
    <div className="stack stack--tight">
      {files.map((file) => {
        const width = Math.max(8, Math.round((file.touches / maxTouches) * 100));
        return (
          <article className="file-row" key={file.filePath}>
            <div className="file-row__topline">
              <span className="file-row__path">{file.filePath}</span>
              <span className="file-row__count">
                {file.touches} touch{file.touches === 1 ? '' : 'es'}
              </span>
            </div>
            <div className="file-row__bar">
              <span style={{ width: `${width}%` }} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

export interface ShadowAgentAppProps {
  host: ShadowAgentHost;
}

export default function App({ host }: ShadowAgentAppProps) {
  const [state, dispatch] = useReducer(appReducer, undefined, initialAppState);
  const { snapshot, busy, error } = state;
  const capabilities = useMemo(() => getHostCapabilities(host), [host]);
  const currentSourceKindRef = useRef<SnapshotPayload['source']['kind'] | null>(null);

  useEffect(() => {
    currentSourceKindRef.current = snapshot?.source.kind ?? null;
  }, [snapshot]);

  const loadPreferredSnapshot = async (): Promise<SnapshotPayload> => {
    const liveBridge = getLiveBridge();

    if (liveBridge) {
      try {
        const liveSnapshot = await liveBridge.getLiveSnapshot();
        if (liveSnapshot) {
          return liveSnapshot;
        }
      } catch {
        // Fall back to the configured host snapshot when live capture is unavailable.
      }
    }

    return host.loadInitialSnapshot();
  };

  useEffect(() => {
    let active = true;

    const loadInitialSnapshot = async () => {
      dispatch({ type: 'BOOT_START' });
      try {
        const snapshotData = await loadPreferredSnapshot();
        if (!active) {
          return;
        }
        if (snapshotData.source.kind === 'fixture' && currentSourceKindRef.current === 'transcript') {
          return;
        }
        startTransition(() => dispatch({ type: 'BOOT_SUCCESS', snapshot: snapshotData }));
      } catch (err) {
        if (!active) {
          return;
        }
        dispatch({
          type: 'BOOT_ERROR',
          message: err instanceof Error ? err.message : 'Unable to load the initial snapshot.'
        });
      }
    };

    void loadInitialSnapshot();

    return () => {
      active = false;
    };
  }, [host]);

  useEffect(() => {
    const liveBridge = getLiveBridge();
    if (!liveBridge) {
      return;
    }

    let active = true;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const refreshLiveSnapshot = async () => {
      try {
        const liveSnapshot = await liveBridge.getLiveSnapshot();
        if (!active || !liveSnapshot || currentSourceKindRef.current === 'replay') {
          return;
        }

        startTransition(() => dispatch({ type: 'LIVE_UPDATE', snapshot: liveSnapshot }));
      } catch {
        // Ignore transient live capture failures and wait for the next batch.
      }
    };

    const unsubscribe = liveBridge.onLiveEvents((events: CanonicalEvent[]) => {
      if (events.length === 0) {
        return;
      }

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(() => {
        void refreshLiveSnapshot();
      }, LIVE_REFRESH_DEBOUNCE_MS);
    });

    return () => {
      active = false;
      unsubscribe();
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, []);

  const exportName = useMemo(() => {
    if (!snapshot) {
      return 'shadow-agent-replay.jsonl';
    }
    return `${safeFileName(snapshot.record.title)}.jsonl`;
  }, [snapshot]);

  const loadReplay = async () => {
    if (!host.openReplayFile) {
      return;
    }

    dispatch({ type: 'LOAD_START' });
    try {
      const snapshotData = await host.openReplayFile();
      if (snapshotData) {
        startTransition(() => dispatch({ type: 'LOAD_SUCCESS', snapshot: snapshotData }));
      } else {
        dispatch({ type: 'LOAD_CANCELLED' });
      }
    } catch (err) {
      dispatch({ type: 'LOAD_ERROR', message: err instanceof Error ? err.message : 'Unable to open the replay file.' });
    }
  };

  const reloadInitialSnapshot = async () => {
    dispatch({ type: 'BOOT_START' });
    try {
      const snapshotData = await loadPreferredSnapshot();
      if (snapshotData.source.kind === 'fixture' && currentSourceKindRef.current === 'transcript') {
        return;
      }
      startTransition(() => dispatch({ type: 'BOOT_SUCCESS', snapshot: snapshotData }));
    } catch (err) {
      dispatch({
        type: 'BOOT_ERROR',
        message: err instanceof Error ? err.message : 'Unable to reload the initial snapshot.'
      });
    }
  };

  const exportReplay = async () => {
    if (!snapshot || !host.exportReplayJsonl) {
      return;
    }

    dispatch({ type: 'EXPORT_START' });
    try {
      const exportOutcome = await host.exportReplayJsonl(snapshot.events, exportName);
      if (exportOutcome.error) {
        dispatch({ type: 'EXPORT_ERROR', message: exportOutcome.error });
      } else {
        dispatch({ type: 'EXPORT_SUCCESS' });
      }
    } catch (err) {
      dispatch({ type: 'EXPORT_ERROR', message: err instanceof Error ? err.message : 'Unable to export replay JSONL.' });
    }
  };

  const graphSummary = snapshot
    ? `${snapshot.state.agentNodes.length} agents • ${snapshot.state.timeline.length} events`
    : 'Waiting for data';
  const sourceIndicator = snapshot
    ? snapshot.source.kind === 'transcript'
      ? { label: 'LIVE', tone: 'accent' as const }
      : snapshot.source.kind === 'fixture'
        ? { label: 'FIXTURE', tone: 'neutral' as const }
        : { label: toLabel(snapshot.source.kind), tone: 'neutral' as const }
    : null;

  return (
    <div className="app-shell">
      <div className="app-shell__glow app-shell__glow--left" />
      <div className="app-shell__glow app-shell__glow--right" />

      <header className="topbar">
        <div>
          <p className="eyebrow">Shadow Agent</p>
          <h1>Passive live observer for agent sessions</h1>
          <p className="lede">
            Platform-agnostic holographic renderer for agent session data. Electron can host file dialogs and live capture,
            but the visualization only depends on the host contract passed into it.
          </p>
        </div>
        <div className="topbar__actions">
          <button type="button" className="button button--ghost" onClick={reloadInitialSnapshot} disabled={busy !== null}>
            Reload initial snapshot
          </button>
          {capabilities.canOpenReplayFile ? (
            <button type="button" className="button button--ghost" onClick={loadReplay} disabled={busy !== null}>
              Open replay / transcript
            </button>
          ) : null}
          {capabilities.canExportReplayJsonl ? (
            <button
              type="button"
              className="button button--primary"
              onClick={exportReplay}
              disabled={!snapshot || busy !== null}
            >
              Export replay JSONL
            </button>
          ) : null}
        </div>
      </header>

      <main className="dashboard">
        <section className="status-strip">
          <div className="status-strip__item">
            <span className="status-strip__label">Session</span>
            <strong>{snapshot?.record.title ?? 'Loading…'}</strong>
          </div>
          <div className="status-strip__item">
            <span className="status-strip__label">Source</span>
            <strong>
              {sourceIndicator ? <Badge tone={sourceIndicator.tone}>{sourceIndicator.label}</Badge> : null}{' '}
              {snapshot ? snapshot.source.label : 'Bootstrapping initial snapshot'}
            </strong>
          </div>
          <div className="status-strip__item">
            <span className="status-strip__label">Active phase</span>
            <strong>{snapshot ? toLabel(snapshot.state.activePhase) : 'Unknown'}</strong>
          </div>
          <div className="status-strip__item">
            <span className="status-strip__label">Coverage</span>
            <strong>{snapshot ? graphSummary : 'No events yet'}</strong>
          </div>
        </section>

        {error ? <div className="error-banner">{error}</div> : null}

        <section className="objective-card">
          <p className="eyebrow">Current objective</p>
          <h2>{snapshot?.state.currentObjective ?? 'Waiting for snapshot data'}</h2>
        </section>

        <div className="panels panels--3col">
          <Panel title="Graph" eyebrow="Agent topology" className="panel--wide panel--graph">
            <div className="graph-shell">
              <CanvasRenderer agentNodes={snapshot?.state.agentNodes ?? []} />
            </div>
          </Panel>

          <div className="panels__left-bottom">
            <TimelineScrubber timeline={snapshot?.state.timeline ?? []} />
            <Panel title="Timeline" eyebrow="Activity stream">
              <TimelineView timeline={snapshot?.state.timeline ?? []} />
            </Panel>
            <Panel title="Transcript" eyebrow="Observed dialogue">
              <TranscriptView transcript={snapshot?.state.transcript ?? []} />
            </Panel>
          </div>

          <ShadowPanel
            phase={snapshot ? toLabel(snapshot.state.activePhase) : 'Unknown'}
            objective={snapshot?.state.currentObjective ?? 'Waiting for data'}
            riskSignals={snapshot?.state.riskSignals ?? []}
            nextMoves={snapshot?.state.nextMoves ?? []}
            insights={snapshot?.state.shadowInsights ?? []}
          />

          <Panel title="File Attention" eyebrow="Hot spots" className="panel--wide">
            <FileAttentionView files={snapshot?.state.fileAttention ?? []} />
          </Panel>
        </div>
      </main>
    </div>
  );
}
