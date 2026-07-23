/**
 * Clock abstraction — an injectable time source.
 *
 * The essential surface is `now(): number` (see plan-codex-replay.md D3, item
 * A). It is extended here with `setTimeout` / `clearTimeout` because the only
 * consumer that needs a *virtual* clock — the deterministic replay runner —
 * also needs debounced timers (the inference trigger's 200 ms batch window) to
 * advance on virtual time rather than wall time. Without that, a debounce
 * scheduled with the real `setTimeout` would fire on the host event loop and
 * make trigger firing depend on replay speed, breaking determinism.
 *
 * `realClock` delegates to the host globals, so injecting it (or nothing) is
 * byte-for-byte identical to the pre-existing `Date.now()` / `setTimeout`
 * behavior — every existing caller and test is unaffected.
 */

/**
 * Opaque handle returned by {@link Clock.setTimeout}. For the real clock this
 * is the host timer object; for the virtual clock it is a small branded token.
 */
export type ClockTimer = ReturnType<typeof setTimeout> | { readonly __virtualTimerId: number };

export interface Clock {
  /** Current time in milliseconds (wall-clock for the real clock). */
  now(): number;
  /** Schedule `handler` to run after `ms` of this clock's time has elapsed. */
  setTimeout(handler: () => void, ms: number): ClockTimer;
  /** Cancel a pending timer. No-op for null/undefined/unknown handles. */
  clearTimeout(timer: ClockTimer | null | undefined): void;
}

/**
 * The default clock: reads wall-clock time and schedules real host timers.
 * Behaviorally identical to calling the globals directly.
 */
export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (timer) => {
    if (timer != null && !(typeof timer === 'object' && '__virtualTimerId' in timer)) {
      clearTimeout(timer);
    }
  },
};

interface VirtualTimer {
  id: number;
  due: number;
  seq: number;
  handler: () => void;
}

/**
 * A virtual clock for deterministic simulation. Time never flows on its own —
 * it only moves when {@link VirtualClock.advanceTo} or
 * {@link VirtualClock.drain} is called, at which point any timers whose due
 * time has been reached fire in (due, insertion) order. Because both the
 * current time and every scheduled callback are driven purely by these calls,
 * a replay produces an identical sequence of `now()` reads and timer firings
 * regardless of how fast (or slow) wall-clock time is passing.
 */
export interface VirtualClock extends Clock {
  /** Set the current virtual time without firing any timers. */
  setStart(virtualMs: number): void;
  /**
   * Advance virtual time to `virtualMs`, firing every timer due at or before
   * it (in order). Never moves time backwards. Handlers may schedule further
   * timers, which fire too if they fall within the advance window.
   */
  advanceTo(virtualMs: number): void;
  /** Fire all remaining timers in due order, advancing time to the last one. */
  drain(): void;
  /** Number of timers still pending. */
  pendingTimers(): number;
}

export function createVirtualClock(startMs = 0): VirtualClock {
  let current = startMs;
  let nextId = 1;
  let seqCounter = 0;
  let timers: VirtualTimer[] = [];

  const earliestDueIndex = (upTo: number | null): number => {
    let best = -1;
    for (let i = 0; i < timers.length; i += 1) {
      const t = timers[i];
      if (upTo !== null && t.due > upTo) continue;
      if (
        best === -1 ||
        t.due < timers[best].due ||
        (t.due === timers[best].due && t.seq < timers[best].seq)
      ) {
        best = i;
      }
    }
    return best;
  };

  const fireDue = (upTo: number | null): void => {
    // Loop rather than iterate a snapshot: a fired handler may enqueue a new
    // timer that is itself due within this same advance window.
    for (;;) {
      const idx = earliestDueIndex(upTo);
      if (idx === -1) break;
      const timer = timers[idx];
      timers.splice(idx, 1);
      current = Math.max(current, timer.due);
      timer.handler();
    }
  };

  return {
    now: () => current,
    setTimeout(handler, ms) {
      const timer: VirtualTimer = {
        id: nextId++,
        due: current + Math.max(0, ms),
        seq: seqCounter++,
        handler,
      };
      timers.push(timer);
      return { __virtualTimerId: timer.id };
    },
    clearTimeout(timer) {
      if (timer && typeof timer === 'object' && '__virtualTimerId' in timer) {
        const id = timer.__virtualTimerId;
        timers = timers.filter((t) => t.id !== id);
      }
    },
    setStart(virtualMs) {
      current = virtualMs;
    },
    advanceTo(virtualMs) {
      if (virtualMs <= current) {
        // Still fire anything already due at `current` (e.g. a 0 ms timer).
        fireDue(current);
        return;
      }
      fireDue(virtualMs);
      current = Math.max(current, virtualMs);
    },
    drain() {
      fireDue(null);
    },
    pendingTimers() {
      return timers.length;
    },
  };
}
