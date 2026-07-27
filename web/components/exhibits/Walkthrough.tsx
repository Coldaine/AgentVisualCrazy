/**
 * Exhibit 03 — Walkthrough. Ported from prototype view 03: one turn/task that
 * deserves a deep dive, shown spatially. A central narrative card, satellite
 * tool-call/commit cards drawn to it with solid connectors, touched-file tiles
 * on dashed connectors, and plan-vs-outcome tags.
 */
import { motion, useReducedMotion } from 'framer-motion';
import { Chip, Frame, cx, curvedPath } from './primitives';
import type { ExhibitArtifactOf, WalkthroughPayload } from './types';

export interface WalkthroughProps {
  payload: WalkthroughPayload;
  artifact: ExhibitArtifactOf<'walkthrough'>;
}

const CENTER = { x: 50, y: 48 };

export default function Walkthrough({ payload, artifact }: WalkthroughProps) {
  const reduce = useReducedMotion();
  const { headline, body, tags, satellites, files } = payload;

  return (
    <Frame>
      <div className="exhibit-frame__chips">
        <Chip>central narrative node</Chip>
        <Chip>satellites + file tiles</Chip>
      </div>

      <svg viewBox="0 0 100 100" className="exhibit-svg" preserveAspectRatio="none">
        {satellites.map((sat, idx) => (
          <motion.path
            key={sat.id}
            d={curvedPath(CENTER, { x: sat.x, y: sat.y }, idx % 2 === 0 ? 7 : 10)}
            fill="none"
            stroke="rgba(167,139,250,0.5)"
            strokeWidth="0.45"
            initial={reduce ? false : { pathLength: 0, opacity: 0.3 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: reduce ? 0 : 0.85, delay: reduce ? 0 : idx * 0.08 }}
          />
        ))}
        {files.map((file, idx) => (
          <motion.path
            key={file.label}
            d={curvedPath(CENTER, { x: file.x, y: file.y }, 5)}
            fill="none"
            stroke="rgba(244,114,182,0.28)"
            strokeDasharray="1.4 1.2"
            strokeWidth="0.35"
            initial={reduce ? false : { pathLength: 0, opacity: 0.2 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : 0.35 + idx * 0.07 }}
          />
        ))}
      </svg>

      <motion.div
        initial={reduce ? false : { opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="walkthrough-center"
      >
        <div className="walkthrough-center__eyebrow">{artifact.title}</div>
        <div className="walkthrough-center__headline">{headline}</div>
        <p className="walkthrough-center__body">{body}</p>
        <div className="walkthrough-center__tags">
          {tags.map((tag) => (
            <span key={tag.label} className={cx('walkthrough-tag', `walkthrough-tag--${tag.kind}`)}>
              {tag.label}
            </span>
          ))}
        </div>
      </motion.div>

      {satellites.map((sat) => (
        <motion.div
          key={sat.id}
          initial={reduce ? false : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="walkthrough-satellite"
          style={{ left: `${sat.x}%`, top: `${sat.y}%` }}
        >
          <div className="walkthrough-satellite__eyebrow">step</div>
          <div className="walkthrough-satellite__label">{sat.label}</div>
          <div className="walkthrough-satellite__note">{sat.note}</div>
        </motion.div>
      ))}

      {files.map((file) => (
        <motion.div
          key={file.label}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="walkthrough-file"
          style={{ left: `${file.x}%`, top: `${file.y}%` }}
        >
          {file.label}
        </motion.div>
      ))}
    </Frame>
  );
}
