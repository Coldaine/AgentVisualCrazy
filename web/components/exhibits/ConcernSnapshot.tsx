/**
 * Exhibit 04 — Concern Snapshot. Ported from prototype view 04 (Architecture
 * Snapshot), re-aimed at agent-session observation: the work abstracted into
 * 5-8 *concerns* (not directories) with human-language roles, heat-classed
 * boxes, and flows between them. Hovering a concern selects it.
 */
import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Chip, Frame, cx, curvedPath } from './primitives';
import type { ConcernSnapshotPayload, ExhibitArtifactOf, HeatLevel } from './types';

export interface ConcernSnapshotProps {
  payload: ConcernSnapshotPayload;
  artifact: ExhibitArtifactOf<'concern_snapshot'>;
}

const HEAT_WIDTH: Record<HeatLevel, string> = {
  low: '24%',
  medium: '48%',
  high: '74%',
  'very-high': '92%',
};

export default function ConcernSnapshot({ payload }: ConcernSnapshotProps) {
  const reduce = useReducedMotion();
  const { concerns, flows } = payload;
  const byId = useMemo(() => Object.fromEntries(concerns.map((c) => [c.id, c])), [concerns]);
  const [selected, setSelected] = useState(concerns[0]?.id ?? '');
  const current = byId[selected] ?? concerns[0];

  return (
    <Frame>
      <div className="exhibit-frame__chips">
        <Chip>5-8 concern boxes</Chip>
        <Chip>labels say what it does</Chip>
      </div>

      <svg viewBox="0 0 100 100" className="exhibit-svg" preserveAspectRatio="none">
        {flows.map(([aId, bId], idx) => {
          const a = byId[aId];
          const b = byId[bId];
          if (!a || !b) return null;
          const from = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
          const to = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
          return (
            <motion.path
              key={`${aId}-${bId}`}
              d={curvedPath(from, to, idx % 2 === 0 ? 6 : 9)}
              fill="none"
              stroke="rgba(103,232,249,0.35)"
              strokeWidth="0.45"
              initial={reduce ? false : { pathLength: 0, opacity: 0.25 }}
              animate={{ pathLength: 1, opacity: 0.9 }}
              transition={{ duration: reduce ? 0 : 1, delay: reduce ? 0 : idx * 0.1 }}
            />
          );
        })}
      </svg>

      {concerns.map((concern) => (
        <motion.button
          type="button"
          key={concern.id}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onMouseEnter={() => setSelected(concern.id)}
          onFocus={() => setSelected(concern.id)}
          className={cx(
            'concern-box',
            `concern-box--${concern.heat}`,
            selected === concern.id && 'concern-box--selected'
          )}
          style={{ left: `${concern.x}%`, top: `${concern.y}%`, width: `${concern.w}%`, height: `${concern.h}%` }}
        >
          <div className="concern-box__eyebrow">concern</div>
          <div className="concern-box__title">{concern.title}</div>
          <div className="concern-box__role">{concern.role}</div>
        </motion.button>
      ))}

      {current ? (
        <div className="exhibit-focus-card">
          <div className="exhibit-focus-card__eyebrow">selected concern</div>
          <div className="exhibit-focus-card__title">{current.title}</div>
          <p className="exhibit-focus-card__note">{current.role}</p>
          <div className="concern-heat-meter">
            <span className="concern-heat-meter__fill" style={{ width: HEAT_WIDTH[current.heat] }} />
          </div>
          <div className="concern-heat-meter__label">recent activity heat · {current.heat}</div>
        </div>
      ) : null}
    </Frame>
  );
}
