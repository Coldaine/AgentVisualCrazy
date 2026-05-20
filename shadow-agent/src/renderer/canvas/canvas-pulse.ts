import type { EventKind } from '../../shared/schema';

export type CanvasPulseKind = 'burst' | 'ripple';

/**
 * Maps canonical EventKind values to burst vs. ripple pulse parameters.
 *
 * | EventKind            | Pulse kind | Intensity | Duration | Rationale                |
 * |----------------------|------------|-----------|----------|--------------------------|
 * | tool_started         | burst      | 1.0       | 600ms    | Sharp action start       |
 * | tool_completed       | ripple     | 0.6       | 1200ms   | Soft completion          |
 * | tool_failed          | burst      | 1.2       | 800ms    | Emphasized error         |
 * | subagent_dispatched  | ripple     | 0.8       | 1000ms   | Branching feels wider    |
 * | subagent_returned    | ripple     | 0.5       | 1200ms   | Gentle return            |
 * | agent_spawned        | burst      | 0.7       | 600ms    | New node appears         |
 * | agent_completed      | ripple     | 0.5       | 1200ms   | Subtle completion        |
 * | session_started      | burst      | 1.0       | 1200ms   | Long intro pulse         |
 * | permission_requested | burst      | 0.6       | 500ms     | Brief attention call     |
 *
 * Kinds not listed (message, session_ended, agent_idle, context_snapshot,
 * shadow_insight) produce no pulse — they are too frequent or non-action.
 */
const EVENT_PULSE_MAP: Partial<
  Record<EventKind, { kind: CanvasPulseKind; intensity: number; durationMs: number }>
> = {
  tool_started: { kind: 'burst', intensity: 1.0, durationMs: 600 },
  tool_completed: { kind: 'ripple', intensity: 0.6, durationMs: 1200 },
  tool_failed: { kind: 'burst', intensity: 1.2, durationMs: 800 },
  subagent_dispatched: { kind: 'ripple', intensity: 0.8, durationMs: 1000 },
  subagent_returned: { kind: 'ripple', intensity: 0.5, durationMs: 1200 },
  agent_spawned: { kind: 'burst', intensity: 0.7, durationMs: 600 },
  agent_completed: { kind: 'ripple', intensity: 0.5, durationMs: 1200 },
  session_started: { kind: 'burst', intensity: 1.0, durationMs: 1200 },
  permission_requested: { kind: 'burst', intensity: 0.6, durationMs: 500 },
};

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

/** Tracks last-triggered timestamp per EventKind for per-kind debounce. */
const lastKindTimestamps = new Map<string, number>();
const KIND_DEBOUNCE_MS = 100;

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
    intensity: options.intensity ?? 1,
  });
}

/**
 * Map a canonical EventKind to a canvas pulse, with per-kind debounce.
 *
 * Returns true if a pulse was triggered, false if the kind is unmapped or
 * debounced.
 *
 * @param x Pulse origin in normalized canvas coordinates (0–1). Default 0.5 (center).
 * @param y Pulse origin in normalized canvas coordinates (0–1). Default 0.5 (center).
 */
export function triggerPulseForEventKind(
  eventKind: EventKind,
  x = 0.5,
  y = 0.5,
  now?: number
): boolean {
  const mapping = EVENT_PULSE_MAP[eventKind];
  if (!mapping) return false;

  const currentTime = now ?? performance.now();

  const lastTime = lastKindTimestamps.get(eventKind) ?? 0;
  if (currentTime - lastTime < KIND_DEBOUNCE_MS) {
    return false;
  }
  lastKindTimestamps.set(eventKind, currentTime);

  triggerCanvasPulse(mapping.kind, x, y, {
    intensity: mapping.intensity,
    durationMs: mapping.durationMs,
    atMs: currentTime,
  });
  return true;
}

/**
 * Process an array of CanonicalEvents, triggering pulses for each mapped kind.
 * Debounce is per-kind so rapid tool calls coalesce naturally.
 */
export function triggerPulsesForEvents(
  events: Array<{ kind: EventKind }>,
  x?: number,
  y?: number,
  now?: number
): void {
  const baseTime = now ?? performance.now();
  for (let i = 0; i < events.length; i++) {
    triggerPulseForEventKind(events[i]!.kind, x, y, baseTime + i);
  }
}

export function clearDebounceState(): void {
  lastKindTimestamps.clear();
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
