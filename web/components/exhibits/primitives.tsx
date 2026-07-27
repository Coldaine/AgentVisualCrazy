/**
 * Ported prototype primitives (`docs/ideas/repoviz/exhibit-prototype.jsx`),
 * re-expressed in TypeScript against plain CSS classes (this repo has no
 * Tailwind). These are the shared spatial language every exhibit is built from:
 * the dark {@link Frame}, {@link accentByKind} entity colors, the {@link Chip}
 * eyebrow, the absolutely-positioned {@link ExhibitNode}, and the SVG path
 * helpers {@link curvedPath} / {@link arcPath}.
 */
import type { CSSProperties, ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { NodeKind } from './types';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export interface Point {
  x: number;
  y: number;
}

export interface AccentPair {
  from: string;
  to: string;
}

/**
 * kind -> gradient color pair. Extends the prototype's repo-entity map
 * (pr/issue/branch/release/commit/file/module) with the plan's agent-session
 * node kinds (goal/turn/tool/file/incident/artifact).
 */
export const accentByKind: Record<string, AccentPair> = {
  // Agent-session node kinds (plan vocabulary)
  goal: { from: 'rgba(52,211,153,0.75)', to: 'rgba(20,184,166,0.75)' },
  turn: { from: 'rgba(56,189,248,0.75)', to: 'rgba(14,165,233,0.75)' },
  tool: { from: 'rgba(167,139,250,0.75)', to: 'rgba(99,102,241,0.75)' },
  file: { from: 'rgba(244,114,182,0.75)', to: 'rgba(236,72,153,0.75)' },
  incident: { from: 'rgba(251,146,60,0.8)', to: 'rgba(248,113,113,0.85)' },
  artifact: { from: 'rgba(129,140,248,0.75)', to: 'rgba(139,92,246,0.75)' },
  // Prototype repo-entity kinds (kept for continuity)
  pr: { from: 'rgba(56,189,248,0.7)', to: 'rgba(14,165,233,0.7)' },
  issue: { from: 'rgba(251,191,36,0.7)', to: 'rgba(249,115,22,0.7)' },
  branch: { from: 'rgba(232,121,249,0.7)', to: 'rgba(168,85,247,0.7)' },
  release: { from: 'rgba(52,211,153,0.7)', to: 'rgba(20,184,166,0.7)' },
  commit: { from: 'rgba(167,139,250,0.7)', to: 'rgba(99,102,241,0.7)' },
  module: { from: 'rgba(96,165,250,0.7)', to: 'rgba(34,211,238,0.7)' },
};

export function accentFor(kind: string): AccentPair {
  return accentByKind[kind] ?? accentByKind.turn;
}

export function accentGradient(kind: string): string {
  const pair = accentFor(kind);
  return `linear-gradient(135deg, ${pair.from}, ${pair.to})`;
}

/** Quadratic-curve SVG path between two points, bulged by `intensity`. */
export function curvedPath(a: Point, b: Point, intensity = 9): string {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const curve = a.y < b.y ? -intensity : intensity;
  return `M ${a.x} ${a.y} Q ${mx} ${my + curve} ${b.x} ${b.y}`;
}

/** Arc SVG path on a circle, degrees measured clockwise from 12 o'clock. */
export function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = ((startDeg - 90) * Math.PI) / 180;
  const end = ((endDeg - 90) * Math.PI) / 180;
  const sx = cx + r * Math.cos(start);
  const sy = cy + r * Math.sin(start);
  const ex = cx + r * Math.cos(end);
  const ey = cy + r * Math.sin(end);
  const largeArc = endDeg - startDeg <= 180 ? 0 : 1;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}`;
}

/**
 * The dark spatial container: #050914 surface, triple radial glows, faint 60px
 * grid, and a top/bottom vignette. Everything an exhibit draws lives inside it.
 */
export function Frame({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={cx('exhibit-frame', className)} style={style}>
      <div className="exhibit-frame__glows" aria-hidden />
      <div className="exhibit-frame__grid" aria-hidden />
      <div className="exhibit-frame__vignette" aria-hidden />
      {children}
    </div>
  );
}

/** Uppercase, letter-spaced eyebrow pill. */
export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('exhibit-chip', className)}>{children}</span>;
}

export interface ExhibitNodeProps {
  x: number;
  y: number;
  title: string;
  subtitle: string;
  kind: string;
  urgent?: boolean;
  selected?: boolean;
  onHover?: () => void;
}

/**
 * A node card positioned by percentage coordinates: gradient kind-dot,
 * title/subtitle, an optional pulsing `urgent` badge, and a selected ring.
 */
export function ExhibitNode({ x, y, title, subtitle, kind, urgent, selected, onHover }: ExhibitNodeProps) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      initial={reduce ? false : { opacity: 0, scale: 0.92, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.45 }}
      onMouseEnter={onHover}
      onFocus={onHover}
      className={cx('exhibit-node', selected && 'exhibit-node--selected')}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <span className="exhibit-node__dot" style={{ background: accentGradient(kind) }} aria-hidden />
      <span className="exhibit-node__body">
        <span className="exhibit-node__topline">
          <span className="exhibit-node__title">{title}</span>
          {urgent ? (
            <motion.span
              className="exhibit-node__urgent"
              animate={reduce ? undefined : { opacity: [0.45, 1, 0.45], scale: [1, 1.12, 1] }}
              transition={reduce ? undefined : { repeat: Infinity, duration: 1.8 }}
            >
              urgent
            </motion.span>
          ) : null}
        </span>
        <span className="exhibit-node__subtitle">{subtitle}</span>
      </span>
    </motion.button>
  );
}

/** Shared entry/exit variant for the AnimatePresence stage swap. */
export const stageSwapVariants = {
  initial: { opacity: 0, y: 12, scale: 0.992 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, scale: 0.992 },
};

export type { NodeKind };
