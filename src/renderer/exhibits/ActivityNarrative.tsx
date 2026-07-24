/**
 * Exhibit 02 — Activity Narrative (the Folding Timeline). Ported from prototype
 * view 02: interesting moments ONLY, folding out of a central spine, alternating
 * top/bottom. Connectors between consecutive beats are colored by whether the
 * storyline thread continues; the trace advances beat by beat while idle.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Chip, Frame, cx } from './primitives';
import type { ActivityNarrativePayload, ExhibitArtifactOf } from './types';

export interface ActivityNarrativeProps {
  payload: ActivityNarrativePayload;
  artifact: ExhibitArtifactOf<'activity_narrative'>;
}

export default function ActivityNarrative({ payload }: ActivityNarrativeProps) {
  const reduce = useReducedMotion();
  const { beats, threads } = payload;
  const [active, setActive] = useState(beats.length - 1);
  const threadColor = useMemo(
    () => Object.fromEntries(threads.map((t) => [t.id, t.color ?? 'rgba(56,189,248,0.65)'])),
    [threads]
  );

  const step = beats.length > 1 ? Math.min(14.5, 80 / (beats.length - 1)) : 14.5;

  useEffect(() => {
    if (reduce || beats.length <= 1) return;
    const id = window.setInterval(() => {
      setActive((prev) => (prev + 1) % beats.length);
    }, 2600);
    return () => window.clearInterval(id);
  }, [beats.length, reduce]);

  return (
    <Frame>
      <div className="exhibit-frame__chips">
        <Chip>interesting moments only</Chip>
        <Chip>alternating tile foldout</Chip>
      </div>

      <div className="activity-spine" />

      <svg viewBox="0 0 100 100" className="exhibit-svg" preserveAspectRatio="none">
        {beats.map((beat, idx) => {
          if (idx === 0) return null;
          const ax = 10 + (idx - 1) * step;
          const bx = 10 + idx * step;
          const sameThread = beats[idx - 1].thread === beat.thread;
          const y = sameThread ? 47 : 53;
          const shown = idx <= active;
          return (
            <motion.path
              key={`${beats[idx - 1].at}-${beat.at}-${idx}`}
              d={`M ${ax} 50 Q ${(ax + bx) / 2} ${y} ${bx} 50`}
              fill="none"
              stroke={sameThread ? threadColor[beat.thread] ?? 'rgba(56,189,248,0.65)' : 'rgba(255,255,255,0.18)'}
              strokeWidth="0.5"
              initial={reduce ? false : { pathLength: 0, opacity: 0.2 }}
              animate={{ pathLength: shown ? 1 : 0, opacity: shown ? 1 : 0.15 }}
              transition={{ duration: reduce ? 0 : 0.6 }}
            />
          );
        })}
      </svg>

      {beats.map((beat, idx) => {
        const x = 10 + idx * step;
        const activeNow = idx <= active;
        const selected = idx === active;
        return (
          <Fragment key={`${beat.at}-${idx}`}>
            <motion.div
              className={cx(
                'activity-dot',
                selected ? 'activity-dot--selected' : activeNow ? 'activity-dot--active' : 'activity-dot--idle'
              )}
              style={{ left: `${x}%`, top: '50%' }}
              animate={selected && !reduce ? { scale: [1, 1.25, 1] } : { scale: 1 }}
              transition={selected && !reduce ? { repeat: Infinity, duration: 1.8 } : { duration: 0.2 }}
            />
            <motion.div
              initial={reduce ? false : { opacity: 0, y: beat.side === 'top' ? 12 : -12 }}
              animate={{ opacity: activeNow ? 1 : 0.18, y: 0, scale: selected ? 1.02 : 1 }}
              transition={{ duration: reduce ? 0 : 0.45 }}
              className={cx('activity-card', selected && 'activity-card--selected')}
              style={{ left: `${x}%`, top: beat.side === 'top' ? '15%' : '58%' }}
            >
              <div className="activity-card__day">{beat.at}</div>
              <div className="activity-card__title">{beat.title}</div>
              <p className="activity-card__body">{beat.body}</p>
              <div className="activity-card__thread">thread · {beat.thread}</div>
            </motion.div>
          </Fragment>
        );
      })}

      <div className="activity-scrub">
        <div className="activity-scrub__labels">
          <span>scrub interesting beats</span>
          <span>{beats[active]?.at}</span>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(0, beats.length - 1)}
          value={active}
          aria-label="scrub interesting beats"
          onChange={(e) => setActive(Number(e.target.value))}
        />
      </div>
    </Frame>
  );
}
