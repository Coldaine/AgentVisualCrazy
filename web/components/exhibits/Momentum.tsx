/**
 * Exhibit 05 — Momentum. Ported from prototype view 05: a 0-100 gauge (arcPath +
 * animated needle), stat tiles, inferred what's-next items with evidence and
 * confidence bars, and the curator's own refresh/retire recommendations
 * (retirement reasons render, per the plan).
 */
import { motion, useReducedMotion } from 'framer-motion';
import { Chip, Frame, arcPath, cx } from './primitives';
import type { ExhibitArtifactOf, MomentumPayload } from './types';

export interface MomentumProps {
  payload: MomentumPayload;
  artifact: ExhibitArtifactOf<'momentum'>;
}

export default function Momentum({ payload }: MomentumProps) {
  const reduce = useReducedMotion();
  const { value, label, stats, next, curation } = payload;
  const clamped = Math.max(0, Math.min(100, value));
  const angle = -120 + (clamped / 100) * 240;
  const needleX = 120 + 82 * Math.cos(((angle - 90) * Math.PI) / 180);
  const needleY = 120 + 82 * Math.sin(((angle - 90) * Math.PI) / 180);
  // Split the arc so the filled portion tracks the value.
  const splitDeg = -120 + (clamped / 100) * 240;

  return (
    <Frame>
      <div className="exhibit-frame__chips">
        <Chip>single-glance state</Chip>
        <Chip>what&apos;s next inferred</Chip>
      </div>

      <div className="momentum-grid">
        <div className="momentum-panel">
          <div className="momentum-panel__head">
            <div>
              <div className="momentum-panel__eyebrow">momentum indicator</div>
              <div className="momentum-panel__label">{label}</div>
            </div>
          </div>
          <div className="momentum-gauge-row">
            <svg width="240" height="150" viewBox="0 0 240 150" className="momentum-gauge">
              <path d={arcPath(120, 120, 82, -120, 120)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="16" strokeLinecap="round" />
              <path d={arcPath(120, 120, 82, -120, splitDeg)} fill="none" stroke="rgba(34,211,238,0.55)" strokeWidth="16" strokeLinecap="round" />
              <path d={arcPath(120, 120, 82, splitDeg, 120)} fill="none" stroke="rgba(251,146,60,0.3)" strokeWidth="16" strokeLinecap="round" />
              <motion.circle
                cx={needleX}
                cy={needleY}
                r="8"
                fill="white"
                animate={reduce ? undefined : { scale: [1, 1.15, 1] }}
                transition={reduce ? undefined : { repeat: Infinity, duration: 1.8 }}
              />
              <line x1="120" y1="120" x2={needleX} y2={needleY} stroke="rgba(255,255,255,0.82)" strokeWidth="4" strokeLinecap="round" />
              <text x="120" y="112" textAnchor="middle" fontSize="30" fontWeight="700" fill="#fff">
                {Math.round(clamped)}
              </text>
            </svg>
            <div className="momentum-stats">
              {stats.map((stat) => (
                <div key={stat.label} className={cx('exhibit-stat-tile', `exhibit-stat-tile--${stat.tone}`)}>
                  <div className="exhibit-stat-tile__label">{stat.label}</div>
                  <div className="exhibit-stat-tile__value">{stat.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="momentum-panel">
          <div className="momentum-panel__eyebrow momentum-panel__eyebrow--accent">what&apos;s next</div>
          <div className="momentum-next">
            {next.map((item) => (
              <div key={item.title} className="momentum-next__item">
                <div className="momentum-next__topline">
                  <div>
                    <div className="momentum-next__title">{item.title}</div>
                    <div className="momentum-next__evidence">{item.evidence}</div>
                  </div>
                  <div className="momentum-next__pct">{item.confidence}%</div>
                </div>
                <div className="momentum-next__bar">
                  <span style={{ width: `${Math.max(0, Math.min(100, item.confidence))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {curation.length > 0 ? (
        <div className="momentum-curation">
          <div className="momentum-panel__eyebrow">curation hooks</div>
          <div className="momentum-curation__cards">
            {curation.map((rec) => (
              <div key={`${rec.artifactId}-${rec.action}`} className={cx('curation-card', `curation-card--${rec.action}`)}>
                <div className="curation-card__action">{rec.action} candidate</div>
                <div className="curation-card__target">{rec.artifactId}</div>
                <div className="curation-card__reason">{rec.reason}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Frame>
  );
}
