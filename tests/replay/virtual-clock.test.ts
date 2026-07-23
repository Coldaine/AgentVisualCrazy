import { describe, it, expect, vi } from 'vitest';
import { createVirtualClock, realClock } from '../../src/shared/clock';
import { createInferenceTrigger } from '../../src/inference/trigger';
import type { CanonicalEvent } from '../../src/shared/schema';

const makeEvent = (kind: CanonicalEvent['kind'] = 'message'): CanonicalEvent => ({
  id: `${kind}-${Math.random()}`,
  kind,
  timestamp: new Date().toISOString(),
  source: 'codex-rollout',
  sessionId: 'sess',
  actor: 'agent',
  payload: {},
  harnessId: 'codex',
});

describe('createVirtualClock', () => {
  it('does not advance time on its own', () => {
    const clock = createVirtualClock(1000);
    expect(clock.now()).toBe(1000);
    expect(clock.now()).toBe(1000);
  });

  it('fires timers in due order as time advances', () => {
    const clock = createVirtualClock(0);
    const order: string[] = [];
    clock.setTimeout(() => order.push('b'), 200);
    clock.setTimeout(() => order.push('a'), 100);
    clock.setTimeout(() => order.push('c'), 300);

    clock.advanceTo(150);
    expect(order).toEqual(['a']);
    expect(clock.now()).toBe(150);

    clock.advanceTo(250);
    expect(order).toEqual(['a', 'b']);

    clock.advanceTo(1000);
    expect(order).toEqual(['a', 'b', 'c']);
    expect(clock.now()).toBe(1000);
  });

  it('clearTimeout cancels a pending virtual timer', () => {
    const clock = createVirtualClock(0);
    const spy = vi.fn();
    const t = clock.setTimeout(spy, 100);
    clock.clearTimeout(t);
    clock.advanceTo(1000);
    expect(spy).not.toHaveBeenCalled();
  });

  it('drain fires all remaining timers in due order', () => {
    const clock = createVirtualClock(0);
    const order: number[] = [];
    clock.setTimeout(() => order.push(2), 200);
    clock.setTimeout(() => order.push(1), 100);
    clock.drain();
    expect(order).toEqual([1, 2]);
    expect(clock.pendingTimers()).toBe(0);
  });

  it('handlers may schedule further timers that still fire within the advance', () => {
    const clock = createVirtualClock(0);
    const order: string[] = [];
    clock.setTimeout(() => {
      order.push('first');
      clock.setTimeout(() => order.push('second'), 50);
    }, 100);
    clock.advanceTo(1000);
    expect(order).toEqual(['first', 'second']);
  });

  it('realClock exposes now/setTimeout/clearTimeout', () => {
    expect(typeof realClock.now()).toBe('number');
    const handle = realClock.setTimeout(() => undefined, 10_000);
    realClock.clearTimeout(handle); // must not throw
  });
});

describe('createInferenceTrigger with an injected virtual clock', () => {
  it('time gate reads virtual time, not wall time', () => {
    const clock = createVirtualClock(0);
    const cb = vi.fn();
    const trigger = createInferenceTrigger(
      cb,
      { minEventsBetween: 2, timeBetweenMs: 1000, maxEventsBetween: 999 },
      clock,
    );

    // Enough events, but only 0 virtual ms elapsed → time gate blocks.
    trigger.onEvents([makeEvent(), makeEvent()]);
    expect(cb).not.toHaveBeenCalled();

    // Advance virtual time past the gate, deliver one more event → schedules
    // the 200 ms debounce on the virtual clock.
    clock.advanceTo(2000);
    trigger.onEvents([makeEvent()]);
    expect(cb).not.toHaveBeenCalled(); // debounce still pending

    // Advancing past the debounce window fires exactly one 'normal' trigger.
    clock.advanceTo(2200);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('normal');
    trigger.stop();
  });

  it('immediate kinds fire synchronously regardless of the clock', () => {
    const clock = createVirtualClock(5000);
    const cb = vi.fn();
    const trigger = createInferenceTrigger(cb, {}, clock);
    trigger.onEvents([makeEvent('tool_failed')]);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('immediate_kind');
    trigger.stop();
  });

  it('max events forces a firing under the virtual clock', () => {
    const clock = createVirtualClock(0);
    const cb = vi.fn();
    const trigger = createInferenceTrigger(
      cb,
      { minEventsBetween: 100, timeBetweenMs: 9_999_999, maxEventsBetween: 3 },
      clock,
    );
    trigger.onEvents([makeEvent(), makeEvent(), makeEvent()]);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('max_events');
    trigger.stop();
  });
});
