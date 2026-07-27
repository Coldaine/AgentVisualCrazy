/**
 * ExhibitStage — the museum floor.
 *
 * Left rail lists the gallery (type icon, title, status pill, relevance bar,
 * narrative preview). The main Frame shows the active exhibit with an
 * AnimatePresence swap. A glass commentary card carries the artifact's full
 * narrative + envelope metadata. Idle cycling advances by relevance-weighted
 * order every ~8s and pauses on hover/interaction (a visible pill plus manual
 * prev/next). Retired artifacts collapse into an archive shelf. `live_graph`
 * renders the existing canvas inside the Frame via the `liveGraph` slot.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Frame, cx, stageSwapVariants } from './primitives';
import RelationshipDag from './RelationshipDag';
import ActivityNarrative from './ActivityNarrative';
import Walkthrough from './Walkthrough';
import ConcernSnapshot from './ConcernSnapshot';
import Momentum from './Momentum';
import Seismograph from './Seismograph';
import ThermalMap from './ThermalMap';
import fixtureGallery from './fixture-gallery';
import {
  isActivityNarrative,
  isConcernSnapshot,
  isLiveGraph,
  isMomentum,
  isRelationshipDag,
  isSeismograph,
  isThermalMap,
  isWalkthrough,
  type ExhibitArtifact,
  type ExhibitType,
} from './types';

const CYCLE_MS = 8000;

const TYPE_LABEL: Record<ExhibitType, string> = {
  relationship_dag: 'Relationship DAG',
  activity_narrative: 'Activity Narrative',
  walkthrough: 'Walkthrough',
  concern_snapshot: 'Concern Snapshot',
  momentum: 'Momentum',
  seismograph: 'Seismograph',
  thermal_map: 'Thermal Map',
  live_graph: 'Live Graph',
};

function ExhibitIcon({ type }: { type: ExhibitType }) {
  const common = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (type) {
    case 'relationship_dag':
      return (<svg {...common}><circle cx="3.5" cy="8" r="1.6" /><circle cx="12.5" cy="4" r="1.6" /><circle cx="12.5" cy="12" r="1.6" /><path d="M5 7 11 4.6M5 9 11 11.4" /></svg>);
    case 'activity_narrative':
      return (<svg {...common}><path d="M2 8h12" /><circle cx="5" cy="8" r="1.4" /><circle cx="10" cy="8" r="1.4" /><path d="M5 8V4M10 8v4" /></svg>);
    case 'walkthrough':
      return (<svg {...common}><circle cx="8" cy="8" r="2.2" /><circle cx="3" cy="3.5" r="1.2" /><circle cx="13" cy="12.5" r="1.2" /><path d="M4 4.4 6.4 6.6M9.6 9.4 12 11.6" /></svg>);
    case 'concern_snapshot':
      return (<svg {...common}><rect x="2" y="2.5" width="5" height="5" rx="1" /><rect x="9" y="4.5" width="5" height="4" rx="1" /><rect x="4" y="9.5" width="6" height="4" rx="1" /></svg>);
    case 'momentum':
      return (<svg {...common}><path d="M2.5 11a5.5 5.5 0 0 1 11 0" /><path d="M8 11 11 6.5" /></svg>);
    case 'seismograph':
      return (<svg {...common}><path d="M2 8h2l1.5-4 2 8 2-6 1.5 2H14" /></svg>);
    case 'thermal_map':
      return (<svg {...common}><rect x="2" y="2" width="12" height="12" rx="1.4" /><path d="M6 2v12M2 8h12" /></svg>);
    case 'live_graph':
    default:
      return (<svg {...common}><circle cx="8" cy="8" r="2" /><circle cx="3" cy="4" r="1.2" /><circle cx="13" cy="5" r="1.2" /><circle cx="4" cy="12" r="1.2" /><path d="M5 5 6.6 6.6M12 6 9.4 7.4M5.5 11 6.8 9.4" /></svg>);
  }
}

function ActiveExhibit({ artifact, liveGraph }: { artifact: ExhibitArtifact; liveGraph?: ReactNode }) {
  if (isRelationshipDag(artifact)) return <RelationshipDag payload={artifact.payload} artifact={artifact} />;
  if (isActivityNarrative(artifact)) return <ActivityNarrative payload={artifact.payload} artifact={artifact} />;
  if (isWalkthrough(artifact)) return <Walkthrough payload={artifact.payload} artifact={artifact} />;
  if (isConcernSnapshot(artifact)) return <ConcernSnapshot payload={artifact.payload} artifact={artifact} />;
  if (isMomentum(artifact)) return <Momentum payload={artifact.payload} artifact={artifact} />;
  if (isSeismograph(artifact)) return <Seismograph payload={artifact.payload} artifact={artifact} />;
  if (isThermalMap(artifact)) return <ThermalMap payload={artifact.payload} artifact={artifact} />;
  if (isLiveGraph(artifact)) {
    return (
      <Frame>
        <div className="exhibit-frame__chips">
          <span className="exhibit-chip">live topology</span>
        </div>
        <div className="exhibit-live-graph">
          {liveGraph ?? <div className="exhibit-live-graph__fallback">Live graph is unavailable in this context.</div>}
        </div>
      </Frame>
    );
  }
  return null;
}

export interface ExhibitStageProps {
  artifacts?: ExhibitArtifact[];
  /** Rendered inside the `live_graph` exhibit (the existing CanvasRenderer). */
  liveGraph?: ReactNode;
}

export default function ExhibitStage({ artifacts = fixtureGallery, liveGraph }: ExhibitStageProps) {
  const reduce = useReducedMotion();

  const active = useMemo(
    () => artifacts.filter((a) => a.status !== 'retired').sort((a, b) => b.relevance - a.relevance),
    [artifacts]
  );
  const retired = useMemo(() => artifacts.filter((a) => a.status === 'retired'), [artifacts]);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [cycles, setCycles] = useState<Record<string, number>>({});
  const lastShownRef = useRef<string | null>(null);

  const safeIndex = active.length === 0 ? 0 : index % active.length;
  const current = active[safeIndex];

  useEffect(() => {
    if (index >= active.length && active.length > 0) {
      setIndex(0);
    }
  }, [active.length, index]);

  useEffect(() => {
    if (paused || reduce || active.length <= 1) return undefined;
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % active.length);
    }, CYCLE_MS);
    return () => window.clearInterval(id);
  }, [paused, reduce, active.length]);

  // Track how many times each artifact has been the active exhibit.
  useEffect(() => {
    if (!current || lastShownRef.current === current.id) return;
    lastShownRef.current = current.id;
    setCycles((prev) => ({ ...prev, [current.id]: (prev[current.id] ?? 0) + 1 }));
  }, [current]);

  const goTo = (next: number) => {
    if (active.length === 0) return;
    setIndex(((next % active.length) + active.length) % active.length);
  };

  return (
    <section
      className="exhibit-stage"
      aria-label="Exhibit floor"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <aside className="exhibit-rail" onMouseEnter={() => setPaused(true)}>
        <div className="exhibit-rail__eyebrow">Exhibit set</div>
        <div className="exhibit-rail__list">
          {active.map((artifact, i) => (
            <button
              type="button"
              key={artifact.id}
              className={cx('exhibit-rail__item', i === safeIndex && 'exhibit-rail__item--active')}
              onClick={() => goTo(i)}
            >
              <span className="exhibit-rail__icon">
                <ExhibitIcon type={artifact.exhibitType} />
              </span>
              <span className="exhibit-rail__main">
                <span className="exhibit-rail__topline">
                  <span className="exhibit-rail__title">{artifact.title}</span>
                  <span className={cx('exhibit-status', `exhibit-status--${artifact.status}`)}>{artifact.status}</span>
                </span>
                <span className="exhibit-rail__type">{TYPE_LABEL[artifact.exhibitType]}</span>
                <span className="exhibit-rail__relevance" aria-label={`relevance ${artifact.relevance.toFixed(2)}`}>
                  <span style={{ width: `${Math.round(artifact.relevance * 100)}%` }} />
                </span>
                <span className="exhibit-rail__preview">{artifact.narrative}</span>
              </span>
            </button>
          ))}
        </div>

        {retired.length > 0 ? (
          <div className="exhibit-archive">
            <div className="exhibit-archive__eyebrow">Archive shelf</div>
            <div className="exhibit-archive__strip">
              {retired.map((artifact) => (
                <span
                  key={artifact.id}
                  className="exhibit-archive__item"
                  title={artifact.retirementReason ?? 'retired'}
                >
                  <ExhibitIcon type={artifact.exhibitType} />
                  {artifact.title}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </aside>

      <div className="exhibit-main">
        <div className="exhibit-main__bar">
          <div className="exhibit-main__heading">
            <div className="exhibit-main__eyebrow">{current ? TYPE_LABEL[current.exhibitType] : 'Exhibit floor'}</div>
            <div className="exhibit-main__title">{current?.title ?? 'No exhibits'}</div>
          </div>
          <div className="exhibit-main__controls">
            <span className={cx('exhibit-pill', paused ? 'exhibit-pill--paused' : 'exhibit-pill--active')}>
              {paused ? 'paused' : 'cycling'}
            </span>
            <button type="button" className="exhibit-ctl" onClick={() => goTo(safeIndex - 1)} aria-label="Previous exhibit">
              ‹
            </button>
            <button type="button" className="exhibit-ctl" onClick={() => goTo(safeIndex + 1)} aria-label="Next exhibit">
              ›
            </button>
          </div>
        </div>

        <div className="exhibit-main__frame">
          <AnimatePresence mode="wait">
            {current ? (
              <motion.div
                key={current.id}
                initial={reduce ? false : stageSwapVariants.initial}
                animate={stageSwapVariants.animate}
                exit={reduce ? undefined : stageSwapVariants.exit}
                transition={{ duration: reduce ? 0 : 0.32, ease: 'easeOut' }}
              >
                <ActiveExhibit artifact={current} liveGraph={liveGraph} />
              </motion.div>
            ) : null}
          </AnimatePresence>

          {current ? (
            <div className="exhibit-commentary">
              <div className="exhibit-commentary__eyebrow">Agent commentary</div>
              <p className="exhibit-commentary__narrative">{current.narrative}</p>
              <div className="exhibit-commentary__tiles">
                <div className="exhibit-stat-tile">
                  <div className="exhibit-stat-tile__label">Relevance</div>
                  <div className="exhibit-stat-tile__value">{current.relevance.toFixed(2)}</div>
                </div>
                <div className="exhibit-stat-tile">
                  <div className="exhibit-stat-tile__label">Status</div>
                  <div className="exhibit-stat-tile__value">{current.status}</div>
                </div>
                <div className="exhibit-stat-tile">
                  <div className="exhibit-stat-tile__label">Cycles shown</div>
                  <div className="exhibit-stat-tile__value">{cycles[current.id] ?? 1}</div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
