/**
 * Exhibit 06 — Seismograph. Designed fresh in the Frame language (creative alt
 * 4A): the session as a seismic trace along a horizontal time axis. Events
 * deflect the line vertically, scaled and kind-colored by magnitude; failures
 * and aborts spike hard, quiet stretches read flat. The baseline trace draws on
 * left-to-right, and named tremors get annotation labels.
 */
import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Chip, Frame, accentFor } from './primitives';
import type { ExhibitArtifactOf, SeismographPayload, SeismographTremor } from './types';

export interface SeismographProps {
  payload: SeismographPayload;
  artifact: ExhibitArtifactOf<'seismograph'>;
}

const BASELINE = 52;
const DEFLECT = 34;

function spikeColor(kind: SeismographTremor['kind']): string {
  switch (kind) {
    case 'failure':
    case 'abort':
      return 'rgba(248,113,113,0.9)';
    case 'merge':
      return 'rgba(52,211,153,0.9)';
    case 'quiet':
      return 'rgba(148,163,184,0.55)';
    default:
      return accentFor(kind).from;
  }
}

export default function Seismograph({ payload }: SeismographProps) {
  const reduce = useReducedMotion();
  const { trace, annotations, windowMinutes } = payload;

  const points = useMemo(() => {
    const n = Math.max(1, trace.length);
    return trace.map((tremor, idx) => {
      const x = trace.length === 1 ? 50 : 8 + (idx / (n - 1)) * 84;
      const peak = BASELINE - Math.max(-1, Math.min(1, tremor.magnitude)) * DEFLECT;
      return { ...tremor, x, peak };
    });
  }, [trace]);

  // A seismic polyline: baseline between events, sharp deflection at each event.
  const tracePath = useMemo(() => {
    if (points.length === 0) return `M 4 ${BASELINE} L 96 ${BASELINE}`;
    let d = `M 4 ${BASELINE}`;
    for (const p of points) {
      d += ` L ${(p.x - 1.4).toFixed(2)} ${BASELINE} L ${p.x.toFixed(2)} ${p.peak.toFixed(2)} L ${(p.x + 1.4).toFixed(2)} ${BASELINE}`;
    }
    d += ` L 96 ${BASELINE}`;
    return d;
  }, [points]);

  const annotationByAt = useMemo(
    () => Object.fromEntries(annotations.map((a) => [a.at, a.text])),
    [annotations]
  );

  return (
    <Frame>
      <div className="exhibit-frame__chips">
        <Chip>seismic trace</Chip>
        <Chip>{windowMinutes} min window</Chip>
      </div>

      <svg viewBox="0 0 100 100" className="exhibit-svg" preserveAspectRatio="none">
        {/* time axis */}
        <line x1="4" y1={BASELINE} x2="96" y2={BASELINE} stroke="rgba(255,255,255,0.14)" strokeWidth="0.2" />
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={8 + f * 84}
            y1={BASELINE - 30}
            x2={8 + f * 84}
            y2={BASELINE + 30}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="0.2"
          />
        ))}

        {/* individual kind-colored spikes */}
        {points.map((p, idx) => (
          <line
            key={`spike-${idx}`}
            x1={p.x}
            y1={BASELINE}
            x2={p.x}
            y2={p.peak}
            stroke={spikeColor(p.kind)}
            strokeWidth={0.4 + Math.abs(p.magnitude) * 0.6}
            strokeLinecap="round"
            opacity={0.85}
          />
        ))}

        {/* the trace draws on left-to-right */}
        <motion.path
          d={tracePath}
          fill="none"
          stroke="rgba(125,224,255,0.85)"
          strokeWidth="0.5"
          strokeLinejoin="round"
          initial={reduce ? false : { pathLength: 0, opacity: 0.4 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: reduce ? 0 : 1.8, ease: 'easeInOut' }}
        />

        {/* peak dots */}
        {points.map((p, idx) => (
          <motion.circle
            key={`dot-${idx}`}
            cx={p.x}
            cy={p.peak}
            r={0.7 + Math.abs(p.magnitude) * 0.9}
            fill={spikeColor(p.kind)}
            initial={reduce ? false : { opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: reduce ? 0 : 0.3, delay: reduce ? 0 : 0.6 + idx * 0.05 }}
          />
        ))}
      </svg>

      {/* spike + annotation labels */}
      {points.map((p, idx) => {
        const annotation = p.label ?? annotationByAt[p.at];
        const above = p.peak <= BASELINE;
        return (
          <div
            key={`label-${idx}`}
            className="seismo-label"
            style={{
              left: `${p.x}%`,
              top: above ? `${p.peak - 10}%` : `${p.peak + 4}%`,
            }}
          >
            <span className="seismo-label__time">{p.at}</span>
            {annotation ? <span className="seismo-label__text">{annotation}</span> : null}
          </div>
        );
      })}

      <div className="seismo-axis">
        <span>start</span>
        <span>time →</span>
        <span>now</span>
      </div>
    </Frame>
  );
}
