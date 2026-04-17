import { startTransition, useEffect, useMemo, useState } from 'react';
import type { AgentNode, DerivedState, ShadowInsight, SnapshotPayload, TimelineItem } from '../shared/schema';
import CanvasRenderer from './canvas/CanvasRenderer';
import TimelineScrubber from './components/TimelineScrubber';
import ShadowPanel from './components/ShadowPanel';

function formatClock(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.valueOf())) {
    return timestamp;
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function toLabel(value: string): string {
  return value
    .split(/[_-]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function safeFileName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'shadow-agent';
}

function statusTone(kind: string): string {
  if (kind === 'risk' || kind === 'tool_failed') {
    return 'pill--danger';
  }
  if (kind === 'next_move' || kind === 'objective') {
    return 'pill--accent';
  }
  return 'pill--neutral';
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
      {timeline.map((item) => (
        <article className="timeline-item" key={item.id}>
          <div className="timeline-item__time">{formatClock(item.timestamp)}</div>
          <div className="timeline-item__content">
            <div className="timeline-item__topline">
              <span className="timeline-item__label">{item.label}</span>
              <Badge tone="neutral">{toLabel(item.kind)}</Badge>
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

export default function App() {
  const [state, dispatch] = useReducer(appReducer, undefined, initialAppState);
  const { snapshot, busy, error } = state;

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      try {
        const data = await window.shadowAgent.bootstrap();
        if (!active) {
          return;
        }
        startTransition(() => dispatch({ type: 'BOOT_SUCCESS', snapshot: data }));
      } catch (err) {
        if (!active) {
          return;
        }
        dispatch({ type: 'BOOT_ERROR', message: err instanceof Error ? err.message : 'Unable to load the built-in fixture.' });
      }
    };

    void bootstrap();
    return () => {
      active = false;
    };
  }, []);

  const exportName = useMemo(() => {
    if (!snapshot) {
      return 'shadow-agent-replay.jsonl';
    }
    return `${safeFileName(snapshot.record.title)}.jsonl`;
  }, [snapshot]);

  const loadReplay = async () => {
    dispatch({ type: 'LOAD_START' });
    try {
      const data = await window.shadowAgent.openReplayFile();
      if (data) {
        startTransition(() => dispatch({ type: 'LOAD_SUCCESS', snapshot: data }));
      } else {
        dispatch({ type: 'LOAD_CANCELLED' });
      }
    } catch (err) {
      dispatch({ type: 'LOAD_ERROR', message: err instanceof Error ? err.message : 'Unable to open the replay file.' });
    }
  };

  const reloadFixture = async () => {
    dispatch({ type: 'BOOT_START' });
    try {
      const data = await window.shadowAgent.bootstrap();
      startTransition(() => setSnapshot(data));
    } catch (err) {
      dispatch({ type: 'BOOT_ERROR', message: err instanceof Error ? err.message : 'Unable to reload the fixture.' });
    }
  };

  const exportReplay = async () => {
    if (!snapshot) {
      return;
    }
    dispatch({ type: 'EXPORT_START' });
    try {
      const result = await window.shadowAgent.exportReplayJsonl(snapshot.events, exportName);
      if (result.error) {
        dispatch({ type: 'EXPORT_ERROR', message: result.error });
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

  return (
    <div className="app-shell">
      <div className="app-shell__glow app-shell__glow--left" />
      <div className="app-shell__glow app-shell__glow--right" />

      <header className="topbar">
        <div>
          <p className="eyebrow">Shadow Agent</p>
          <h1>Passive live observer for agent sessions</h1>
          <p className="lede">
            Loads a built-in fixture on launch, opens transcript or replay files through Electron, and exports canonical
            replay JSONL back to disk.
          </p>
        </div>
        <div className="topbar__actions">
          <button type="button" className="button button--ghost" onClick={reloadFixture} disabled={busy !== null}>
            Reload fixture
          </button>
          <button type="button" className="button button--ghost" onClick={loadReplay} disabled={busy !== null}>
            Open replay / transcript
          </button>
          <button type="button" className="button button--primary" onClick={exportReplay} disabled={!snapshot || busy !== null}>
            Export replay JSONL
          </button>
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
            <strong>{snapshot ? snapshot.source.label : 'Bootstrapping built-in fixture'}</strong>
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
          {/* Left column: Graph canvas */}
          <Panel title="Graph" eyebrow="Agent topology" className="panel--wide panel--graph">
            <CanvasRenderer agentNodes={snapshot?.state.agentNodes ?? []} />
          </Panel>

          {/* Left column bottom: Timeline + Transcript */}
          <div className="panels__left-bottom">
            <TimelineScrubber timeline={snapshot?.state.timeline ?? []} />
            <Panel title="Transcript" eyebrow="Observed dialogue">
              <TranscriptView transcript={snapshot?.state.transcript ?? []} />
            </Panel>
          </div>

          {/* Right column: Shadow interpretation */}
          <ShadowPanel
            phase={snapshot ? toLabel(snapshot.state.activePhase) : 'Unknown'}
            objective={snapshot?.state.currentObjective ?? 'Waiting for data'}
            riskSignals={snapshot?.state.riskSignals ?? []}
            nextMoves={snapshot?.state.nextMoves ?? []}
            insights={snapshot?.state.shadowInsights ?? []}
          />

          {/* Bottom: File Attention */}
          <Panel title="File Attention" eyebrow="Hot spots" className="panel--wide">
            <FileAttentionView files={snapshot?.state.fileAttention ?? []} />
          </Panel>
        </div>
      </main>
    </div>
  );
}
