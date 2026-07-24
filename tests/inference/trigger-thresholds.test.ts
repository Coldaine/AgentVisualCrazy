/**
 * Trigger cadence for the curator design (docs/plans/plan-exhibit-floor.md):
 * fewer, bigger normal-path calls. The immediate paths (agent_completed,
 * tool_failed) are unchanged; the normal-path floor is raised to 25 events /
 * 120s. These tests pin the *default* thresholds (no config override) so a
 * silent loosening would fail.
 */
import { describe, expect, it, vi } from 'vitest';
import { createInferenceTrigger } from '../../src/inference/trigger';
import { createVirtualClock } from '../../src/shared/clock';
import type { CanonicalEvent } from '../../src/shared/schema';

const makeEvent = (kind: CanonicalEvent['kind'] = 'message'): CanonicalEvent => ({
  id: Math.random().toString(),
  kind,
  timestamp: new Date().toISOString(),
  source: 'claude-transcript',
  sessionId: 'sess',
  actor: 'assistant',
  payload: {},
});

describe('createInferenceTrigger — raised default thresholds (curator cadence)', () => {
  it('immediate paths still fire on tool_failed and agent_completed', () => {
    for (const kind of ['tool_failed', 'agent_completed'] as const) {
      const cb = vi.fn();
      const trigger = createInferenceTrigger(cb);
      trigger.onEvents([makeEvent(kind)]);
      expect(cb).toHaveBeenCalledTimes(1);
      trigger.stop();
    }
  });

  it('does NOT fire the normal path below the 25-event floor even after 120s', () => {
    const cb = vi.fn();
    const clock = createVirtualClock(0);
    const trigger = createInferenceTrigger(cb, {}, clock);
    clock.advanceTo(200_000); // 200s elapsed, well past the 120s time gate
    trigger.onEvents(Array.from({ length: 24 }, () => makeEvent()));
    clock.drain();
    expect(cb).not.toHaveBeenCalled();
    trigger.stop();
  });

  it('does NOT fire the normal path before 120s even with 25 events', () => {
    const cb = vi.fn();
    const clock = createVirtualClock(0);
    const trigger = createInferenceTrigger(cb, {}, clock);
    clock.advanceTo(100_000); // 100s elapsed, below the 120s time gate
    trigger.onEvents(Array.from({ length: 25 }, () => makeEvent()));
    clock.drain();
    expect(cb).not.toHaveBeenCalled();
    trigger.stop();
  });

  it('fires the normal path once 25 events AND 120s are both satisfied', () => {
    const cb = vi.fn();
    const clock = createVirtualClock(0);
    const trigger = createInferenceTrigger(cb, {}, clock);
    clock.advanceTo(120_000);
    trigger.onEvents(Array.from({ length: 25 }, () => makeEvent()));
    clock.drain(); // flush the 200ms debounce on virtual time
    expect(cb).toHaveBeenCalledTimes(1);
    trigger.stop();
  });

  it('still forces a trigger at the 50-event ceiling regardless of the timer', () => {
    const cb = vi.fn();
    const clock = createVirtualClock(0);
    const trigger = createInferenceTrigger(cb, {}, clock);
    trigger.onEvents(Array.from({ length: 50 }, () => makeEvent()));
    expect(cb).toHaveBeenCalledTimes(1); // max_events fires immediately, no debounce
    trigger.stop();
  });
});
