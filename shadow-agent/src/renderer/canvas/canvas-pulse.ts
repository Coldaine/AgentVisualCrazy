/** Event-driven atmosphere pulse (Citadel-inspired stub). */

export type CanvasPulseKind = 'burst' | 'ripple';

interface ActivePulse {
  kind: CanvasPulseKind;
  x: number;
  y: number;
  startedAt: number;
  durationMs: number;
  intensity: number;
}

const pulses: ActivePulse[] = [];
const MAX_ACTIVE_PULSES = 32;

function pruneExpiredCanvasPulses(now: number): void {
  for (let i = pulses.length - 1; i >= 0; i -= 1) {
    const pulse = pulses[i]!;
    if (now - pulse.startedAt > pulse.durationMs) {
      pulses.splice(i, 1);
    }
  }
}

export function triggerCanvasPulse(
  kind: CanvasPulseKind,
  x: number,
  y: number,
  options: { intensity?: number; durationMs?: number; atMs?: number } = {}
): void {
  const now = options.atMs ?? performance.now();
  pruneExpiredCanvasPulses(now);
  if (pulses.length >= MAX_ACTIVE_PULSES) {
    pulses.shift();
  }
  pulses.push({
    kind,
    x,
    y,
    startedAt: now,
    durationMs: options.durationMs ?? (kind === 'burst' ? 600 : 1200),
    intensity: options.intensity ?? 1
  });
}

/** Prune expired pulses even when the grid is not drawn (e.g. low quality tier). */
export function tickCanvasPulses(now: number): void {
  pruneExpiredCanvasPulses(now);
}

/**
 * Returns 0–1 boost to grid opacity for the current frame.
 *
 * Boost curve per pulse:
 *   falloff = 1 - (time - startedAt) / durationMs       [linear 1→0 over lifetime]
 *   spatial = max(0, 1 - dist(pulse_xy, center) / half_diagonal)  [linear 1→0 from origin to canvas edge]
 *   amp = intensity * falloff * spatial * (burst ? 0.12 : 0.06)
 *   final boost = max(boost, amp) across all active pulses
 */
export function sampleCanvasPulseBoost(time: number, width: number, height: number): number {
  pruneExpiredCanvasPulses(time);
  let boost = 0;
  for (const pulse of pulses) {
    const elapsed = time - pulse.startedAt;
    if (elapsed > pulse.durationMs) {
      continue;
    }
    const t = elapsed / pulse.durationMs;
    const falloff = 1 - t;
    const cx = pulse.x * width;
    const cy = pulse.y * height;
    const dist = Math.hypot(width / 2 - cx, height / 2 - cy);
    const maxDist = Math.hypot(width, height) * 0.5;
    const spatial = Math.max(0, 1 - dist / maxDist);
    const amp = pulse.intensity * falloff * spatial * (pulse.kind === 'burst' ? 0.12 : 0.06);
    boost = Math.max(boost, amp);
  }
  return boost;
}

export function clearCanvasPulses(): void {
  pulses.length = 0;
}
