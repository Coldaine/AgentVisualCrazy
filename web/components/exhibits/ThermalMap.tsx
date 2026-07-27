/**
 * Exhibit 07 — Thermal Map. Designed fresh in the Frame language (creative alt
 * 5A): file/subsystem churn as a squarified treemap. Cell area is the model's
 * attention weight; cell color lerps cool blue (stable) -> hot red (volatile)
 * by heat 0..1. The hottest cell gets a white-hot border and a "why" callout.
 */
import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Chip, Frame } from './primitives';
import type { ExhibitArtifactOf, ThermalCell, ThermalMapPayload } from './types';

export interface ThermalMapProps {
  payload: ThermalMapPayload;
  artifact: ExhibitArtifactOf<'thermal_map'>;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const HEAT_STOPS: Array<{ at: number; rgb: [number, number, number] }> = [
  { at: 0, rgb: [56, 189, 248] }, // cool blue
  { at: 0.5, rgb: [245, 158, 11] }, // amber
  { at: 1, rgb: [248, 113, 113] }, // hot red
];

function heatColor(heat: number, alpha = 0.85): string {
  const h = Math.max(0, Math.min(1, heat));
  let lo = HEAT_STOPS[0];
  let hi = HEAT_STOPS[HEAT_STOPS.length - 1];
  for (let i = 0; i < HEAT_STOPS.length - 1; i++) {
    if (h >= HEAT_STOPS[i].at && h <= HEAT_STOPS[i + 1].at) {
      lo = HEAT_STOPS[i];
      hi = HEAT_STOPS[i + 1];
      break;
    }
  }
  const span = hi.at - lo.at || 1;
  const t = (h - lo.at) / span;
  const c = lo.rgb.map((v, i) => Math.round(v + (hi.rgb[i] - v) * t));
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}

function worstRatio(areas: number[], side: number): number {
  const sum = areas.reduce((a, b) => a + b, 0);
  const max = Math.max(...areas);
  const min = Math.min(...areas);
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
}

/** Classic squarified treemap over a percentage rect. `values` are unscaled weights. */
function squarify(values: number[], rect: Rect): Rect[] {
  const result: Rect[] = new Array(values.length);
  const totalWeight = values.reduce((a, b) => a + b, 0) || 1;
  const areaScale = (rect.w * rect.h) / totalWeight;
  const areas = values.map((v) => v * areaScale);
  const order = values.map((_, i) => i).sort((a, b) => areas[b] - areas[a]);

  let x = rect.x;
  let y = rect.y;
  let w = rect.w;
  let h = rect.h;
  let idx = 0;

  while (idx < order.length) {
    const side = Math.min(w, h);
    const row: number[] = [];
    let best = Infinity;
    while (idx < order.length) {
      const candidate = [...row, order[idx]];
      const ratio = worstRatio(candidate.map((k) => areas[k]), side);
      if (row.length === 0 || ratio <= best) {
        row.push(order[idx]);
        best = ratio;
        idx++;
      } else {
        break;
      }
    }
    const rowSum = row.reduce((s, k) => s + areas[k], 0);
    if (w <= h) {
      const rowH = rowSum / w;
      let cx = x;
      for (const k of row) {
        const cw = (areas[k] / rowSum) * w;
        result[k] = { x: cx, y, w: cw, h: rowH };
        cx += cw;
      }
      y += rowH;
      h -= rowH;
    } else {
      const rowW = rowSum / h;
      let cy = y;
      for (const k of row) {
        const ch = (areas[k] / rowSum) * h;
        result[k] = { x, y: cy, w: rowW, h: ch };
        cy += ch;
      }
      x += rowW;
      w -= rowW;
    }
  }
  return result;
}

export default function ThermalMap({ payload }: ThermalMapProps) {
  const reduce = useReducedMotion();
  const { cells, hottest } = payload;

  const layout = useMemo(() => {
    const rect: Rect = { x: 4, y: 15, w: 92, h: 68 };
    const rects = squarify(
      cells.map((c) => Math.max(0.0001, c.weight)),
      rect
    );
    return cells.map((cell, i) => ({ cell, rect: rects[i] }));
  }, [cells]);

  const hottestIdx = useMemo(() => {
    const byPath = layout.findIndex((l) => l.cell.path === hottest.path);
    if (byPath >= 0) return byPath;
    let max = -1;
    let maxIdx = 0;
    layout.forEach((l, i) => {
      if (l.cell.heat > max) {
        max = l.cell.heat;
        maxIdx = i;
      }
    });
    return maxIdx;
  }, [layout, hottest.path]);

  return (
    <Frame>
      <div className="exhibit-frame__chips">
        <Chip>attention-weighted churn</Chip>
        <Chip>cool stable · hot volatile</Chip>
      </div>

      {layout.map(({ cell, rect }, i) => {
        if (!rect) return null;
        const isHottest = i === hottestIdx;
        return (
          <motion.div
            key={cell.path}
            className={`thermal-cell${isHottest ? ' thermal-cell--hottest' : ''}`}
            initial={reduce ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: reduce ? 0 : 0.4, delay: reduce ? 0 : i * 0.03 }}
            style={{
              left: `${rect.x}%`,
              top: `${rect.y}%`,
              width: `${rect.w}%`,
              height: `${rect.h}%`,
              background: `linear-gradient(135deg, ${heatColor(cell.heat, 0.32)}, ${heatColor(cell.heat, 0.16)})`,
              borderColor: heatColor(cell.heat, 0.5),
            }}
          >
            <span className="thermal-cell__path">{cell.label ?? cell.path}</span>
            <span className="thermal-cell__heat" style={{ color: heatColor(cell.heat, 1) }}>
              {Math.round(cell.heat * 100)}
            </span>
          </motion.div>
        );
      })}

      <motion.div
        className="thermal-callout"
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 0.3 }}
      >
        <div className="thermal-callout__eyebrow">hottest · {hottest.path}</div>
        <p className="thermal-callout__why">{hottest.why}</p>
      </motion.div>
    </Frame>
  );
}
