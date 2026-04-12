import { startTransition, useEffect, useMemo, useState } from 'react';
import type { AgentNode, DerivedState, ShadowInsight, SnapshotPayload, TimelineItem } from '../shared/schema';
import { getShadowAgentBridge } from './bridge';
import { buildGraphLayout, formatClock, safeFileName, toLabel } from './view-model';

function stateTone(state: AgentNode['state']): string {
  if (state === 'active') {
    return 'node--active';
  }
  if (state === 'completed') {
    return 'node--completed';
  }
  return 'node--idle';
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

function GraphView({ nodes }: { nodes: AgentNode[] }) {
  const layout = useMemo(() => buildGraphLayout(nodes), [nodes]);
  const nodeMap = useMemo(() => new Map(layout.nodes.map((node) => [node.id, node])), [layout.nodes]);

  if (layout.nodes.length === 0) {
    return <p className="empty-state">No agent graph is available yet.</p>;
  }

  return (
    <div className="graph-shell">
      <svg className="graph" viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label="Agent graph">
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L8,4 L0,8 z" fill="rgba(187, 202, 227, 0.85)" />
          </marker>
        </defs>
        {layout.edges.map((edge) => {
          const from = nodeMap.get(edge.from);
          const to = nodeMap.get(edge.to);
          if (!from || !to) {
            return null;
          }
          return (
            <line
              key={`${edge.from}-${edge.to}`}
              x1={from.x + 180}
              y1={from.y + 35}
              x2={to.x}
              y2={to.y + 35}
              className="graph__edge"
              markerEnd="url(#arrow)"
            />
          );
        })}
        {layout.nodes.map((node) => (
          <g key={node.id} transform={`translate(${node.x}, ${node.y})`} className={`graph-node ${stateTone(node.state)}`}>
            <rect width="180" height="70" rx="18" ry="18" />
            <text x="16" y="22" className="graph-node__label">
              {node.label}
            </text>
            <text x="16" y="43" className="graph-node__meta">
              {node.toolCount} tools • {node.state}
            </text>
            {node.parentId ? <text x="16" y="60" className="graph-node__meta graph-node__meta--dim">{node.parentId}</text> : null}
          </g>
        ))}
      </svg>
    </div>
  );
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

function InsightsView({
  objective,
  phase,
  riskSignals,
  nextMoves,
  insights
}: {
  objective: string;
  phase: string;
  riskSignals: string[];
  nextMoves: string[];
  insights: ShadowInsight[];
}) {
  return (
    <div className="insights-grid">
      <article className="insight-card insight-card--summary">
        <p className="eyebrow">Objective</p>
        <h3>{objective}</h3>
        <div className="insight-card__tags">
          <Badge tone="accent">{phase}</Badge>
          <Badge tone="neutral">{insights.length} inferred signals</Badge>
        </div>
      </article>

      <article className="insight-card">
        <p className="eyebrow">Risks</p>
        {riskSignals.length > 0 ? (
          <ul className="list">
            {riskSignals.map((risk) => (
              <li key={risk}>
                <Badge tone="danger">{risk}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No strong risk signals detected.</p>
        )}
      </article>

      <article className="insight-card">
        <p className="eyebrow">Next Moves</p>
        {nextMoves.length > 0 ? (
          <ul className="list">
            {nextMoves.map((move) => (
              <li key={move}>
                <Badge tone="accent">{move}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No recommendation yet.</p>
        )}
      </article>

      <article className="insight-card insight-card--wide">
        <p className="eyebrow">Shadow Insights</p>
        <div className="stack stack--tight">
          {insights.map((insight, index) => (
            <div className="insight-row" key={`${insight.kind}-${index}`}>
              <div className="insight-row__topline">
                <span className="insight-row__kind">{toLabel(insight.kind)}</span>
                <span className={`pill ${statusTone(insight.kind)}`}>{Math.round(insight.confidence * 100)}%</span>
              </div>
              <p className="insight-row__summary">{insight.summary}</p>
              <p className="insight-row__scope">{insight.scope} scope</p>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

export default function App() {
  const [snapshot, setSnapshot] = useState<SnapshotPayload | null>(null);
  const [busy, setBusy] = useState<'booting' | 'loading' | 'exporting' | null>('booting');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      try {
        const data = await getShadowAgentBridge().bootstrap();
        if (!active) {
          return;
        }
        startTransition(() => setSnapshot(data));
        setBusy(null);
      } catch (err) {
        if (!active) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Unable to load the built-in fixture.');
        setBusy(null);
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
    setBusy('loading');
    setError(null);
    try {
      const data = await getShadowAgentBridge().openReplayFile();
      if (data) {
        startTransition(() => setSnapshot(data));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open the replay file.');
    } finally {
      setBusy(null);
    }
  };

  const reloadFixture = async () => {
    setBusy('booting');
    setError(null);
    try {
      const data = await getShadowAgentBridge().bootstrap();
      startTransition(() => setSnapshot(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reload the fixture.');
    } finally {
      setBusy(null);
    }
  };

  const exportReplay = async () => {
    if (!snapshot) {
      return;
    }
    setBusy('exporting');
    setError(null);
    try {
      const result = await getShadowAgentBridge().exportReplayJsonl(snapshot.events, exportName);
      if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to export replay JSONL.');
    } finally {
      setBusy(null);
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

        <div className="panels">
          <Panel title="Graph" eyebrow="Agent topology" className="panel--wide">
            <GraphView nodes={snapshot?.state.agentNodes ?? []} />
          </Panel>

          <Panel title="Timeline" eyebrow="Chronological events">
            <TimelineView timeline={snapshot?.state.timeline ?? []} />
          </Panel>

          <Panel title="Transcript" eyebrow="Observed dialogue">
            <TranscriptView transcript={snapshot?.state.transcript ?? []} />
          </Panel>

          <Panel title="File Attention" eyebrow="Hot spots">
            <FileAttentionView files={snapshot?.state.fileAttention ?? []} />
          </Panel>

          <Panel title="Insights" eyebrow="Shadow layer" className="panel--wide">
            <InsightsView
              objective={snapshot?.state.currentObjective ?? 'Waiting for data'}
              phase={snapshot ? toLabel(snapshot.state.activePhase) : 'Unknown'}
              riskSignals={snapshot?.state.riskSignals ?? []}
              nextMoves={snapshot?.state.nextMoves ?? []}
              insights={snapshot?.state.shadowInsights ?? []}
            />
          </Panel>
        </div>
      </main>
    </div>
  );
}
