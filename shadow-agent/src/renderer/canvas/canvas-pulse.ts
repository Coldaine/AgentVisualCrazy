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

export function triggerCanvasPulse(
  kind: CanvasPulseKind,
  x: number,
  y: number,
  options: { intensity?: number; durationMs?: number } = {}
): void {
  pulses.push({
    kind,
    x,
    y,
    startedAt: performance.now(),
    durationMs: options.durationMs ?? (kind === 'burst' ? 600 : 1200),
    intensity: options.intensity ?? 1
  });
}

/** Returns 0–1 boost to grid opacity for the current frame. */
export function sampleCanvasPulseBoost(time: number, width: number, height: number): number {
  const now = time;
  let boost = 0;
  for (let i = pulses.length - 1; i >= 0; i -= 1) {
    const pulse = pulses[i]!;
    const elapsed = now - pulse.startedAt;
    if (elapsed > pulse.durationMs) {
      pulses.splice(i, 1);
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
