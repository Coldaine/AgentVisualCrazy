/**
 * Tests for canvas-pulse burst/ripple pulse API.
 *
 * Boost curve per pulse:
 *   falloff = 1 - elapsed/durationMs
 *   spatial = max(0, 1 - dist(pulse, center) / half_diagonal)
 *   amp = intensity * falloff * spatial * (burst ? 0.12 : 0.06)
 *   final boost = max(boost, amp) across all active pulses
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { EventKind } from '../../src/shared/schema';
import {
  clearCanvasPulses,
  clearDebounceState,
  sampleCanvasPulseBoost,
  tickCanvasPulses,
  triggerCanvasPulse,
  triggerPulseForEventKind,
  triggerPulsesForEvents,
} from '../../src/renderer/canvas/canvas-pulse';

const mappedActionEvents: EventKind[] = [
  'tool_started',
  'tool_completed',
  'tool_failed',
  'subagent_dispatched',
  'subagent_returned',
  'agent_spawned',
  'agent_completed',
  'session_started',
  'permission_requested',
];

const unmappedNarrativeEvents: EventKind[] = [
  'message',
  'session_ended',
  'context_snapshot',
  'shadow_insight',
  'agent_idle',
];

describe('canvas pulse API', () => {
  beforeEach(() => {
    clearCanvasPulses();
    clearDebounceState();
  });

  it('returns zero boost until a live pulse is active', () => {
    const t0 = 1000;

    expect(sampleCanvasPulseBoost(t0, 800, 600)).toBe(0);
    triggerCanvasPulse('burst', 0.5, 0.5, { intensity: 1, durationMs: 500, atMs: t0 });

    // This guards the visible pulse lifetime instead of only testing that trigger() appends data.
    expect(sampleCanvasPulseBoost(t0 + 50, 800, 600)).toBeGreaterThan(0);
    expect(sampleCanvasPulseBoost(t0 + 600, 800, 600)).toBe(0);
  });

  it('tickCanvasPulses prunes expired pulses without requiring a grid sample', () => {
    const t0 = 2000;
    triggerCanvasPulse('ripple', 0.5, 0.5, { durationMs: 100, atMs: t0 });

    tickCanvasPulses(t0 + 200);

    // Low-quality rendering can skip sampling, so explicit ticking must still clear stale pulses.
    expect(sampleCanvasPulseBoost(t0 + 200, 800, 600)).toBe(0);
  });

  it('uses the maximum contribution from concurrent pulses rather than summing them', () => {
    const t0 = 5000;
    triggerCanvasPulse('burst', 0.5, 0.5, { intensity: 1, durationMs: 400, atMs: t0 });
    triggerCanvasPulse('ripple', 0.5, 0.5, { intensity: 1, durationMs: 500, atMs: t0 + 200 });

    const expectedBurst = 1 * (1 - 350 / 400) * 1 * 0.12;
    const expectedRipple = 1 * (1 - 150 / 500) * 1 * 0.06;
    const boost = sampleCanvasPulseBoost(t0 + 350, 800, 600);

    // Max composition prevents bursts from over-brightening when many events arrive together.
    expect(boost).toBeCloseTo(Math.max(expectedBurst, expectedRipple), 6);
    expect(boost).toBeLessThan(expectedBurst + expectedRipple);
  });

  it('applies spatial falloff from the canvas center to the edges', () => {
    const t0 = 10000;

    triggerCanvasPulse('ripple', 0.5, 0.5, { intensity: 1, durationMs: 1000, atMs: t0 });
    const centerBoost = sampleCanvasPulseBoost(t0 + 100, 800, 600);
    clearCanvasPulses();

    triggerCanvasPulse('ripple', 0.25, 0.25, { intensity: 1, durationMs: 1000, atMs: t0 });
    const midwayBoost = sampleCanvasPulseBoost(t0 + 100, 800, 600);
    clearCanvasPulses();

    triggerCanvasPulse('ripple', 0, 0, { intensity: 1, durationMs: 1000, atMs: t0 });
    const cornerBoost = sampleCanvasPulseBoost(t0 + 100, 800, 600);

    // These ratios protect the visual gradient, not just the presence of any pulse.
    expect(centerBoost).toBeCloseTo(1 * (1 - 100 / 1000) * 1 * 0.06, 6);
    expect(midwayBoost).toBeCloseTo(1 * (1 - 100 / 1000) * 0.5 * 0.06, 6);
    expect(cornerBoost).toBe(0);
  });

  it('handles duration and intensity edge cases without negative visible boost', () => {
    const t0 = 20000;

    triggerCanvasPulse('burst', 0.5, 0.5, { durationMs: 0, atMs: t0 });
    expect(sampleCanvasPulseBoost(t0 + 1, 800, 600)).toBe(0);

    triggerCanvasPulse('burst', 0.5, 0.5, { intensity: 0, durationMs: 500, atMs: t0 + 1000 });
    expect(sampleCanvasPulseBoost(t0 + 1050, 800, 600)).toBe(0);

    triggerCanvasPulse('burst', 0.5, 0.5, { intensity: -1, durationMs: 500, atMs: t0 + 2000 });
    expect(sampleCanvasPulseBoost(t0 + 2050, 800, 600)).toBe(0);

    triggerCanvasPulse('burst', 0.5, 0.5, { intensity: 2, durationMs: 500, atMs: t0 + 3000 });
    // The high-intensity case stays here because clamping bugs can hide behind zero-only checks.
    expect(sampleCanvasPulseBoost(t0 + 3050, 800, 600)).toBeCloseTo(2 * (1 - 50 / 500) * 0.12, 6);
  });

  it('triggers pulses only for action-oriented event kinds', () => {
    const t0 = 30000;

    const mappedResults = mappedActionEvents.map((kind, index) => {
      clearCanvasPulses();
      clearDebounceState();
      const atMs = t0 + index * 1000;
      return {
        kind,
        triggered: triggerPulseForEventKind(kind, 0.5, 0.5, atMs),
        boost: sampleCanvasPulseBoost(atMs + 50, 800, 600),
      };
    });

    const unmappedResults = unmappedNarrativeEvents.map((kind, index) => {
      clearCanvasPulses();
      clearDebounceState();
      const atMs = t0 + 10000 + index * 1000;
      return {
        kind,
        triggered: triggerPulseForEventKind(kind, 0.5, 0.5, atMs),
        boost: sampleCanvasPulseBoost(atMs + 50, 800, 600),
      };
    });

    // The mapping is the public behavior: action events animate, narrative/state events stay quiet.
    expect(mappedResults).toEqual(
      mappedActionEvents.map((kind) => ({
        kind,
        triggered: true,
        boost: expect.any(Number),
      }))
    );
    expect(mappedResults.every((result) => result.boost > 0)).toBe(true);
    expect(unmappedResults).toEqual(
      unmappedNarrativeEvents.map((kind) => ({ kind, triggered: false, boost: 0 }))
    );
  });

  it('defaults event pulses to the canvas center and debounces by event kind', () => {
    const t0 = 40000;

    const firstToolPulse = triggerPulseForEventKind('tool_started', undefined, undefined, t0);
    const immediateToolPulse = triggerPulseForEventKind('tool_started', 0.5, 0.5, t0 + 50);
    const differentEventPulse = triggerPulseForEventKind('agent_spawned', 0.5, 0.5, t0 + 50);
    const delayedToolPulse = triggerPulseForEventKind('tool_started', 0.5, 0.5, t0 + 150);

    // Debounce is per kind, so rapid repeats coalesce without suppressing unrelated actions.
    expect(firstToolPulse).toBe(true);
    expect(sampleCanvasPulseBoost(t0 + 100, 800, 600)).toBeGreaterThan(0);
    expect(immediateToolPulse).toBe(false);
    expect(differentEventPulse).toBe(true);
    expect(delayedToolPulse).toBe(true);
  });

  it('fires mapped events in a batch while skipping unmapped events', () => {
    const t0 = 50000;

    triggerPulsesForEvents(
      [{ kind: 'message' }, { kind: 'tool_started' }, { kind: 'subagent_dispatched' }],
      undefined,
      undefined,
      t0
    );
    const mixedBatchBoost = sampleCanvasPulseBoost(t0 + 50, 800, 600);

    clearCanvasPulses();
    clearDebounceState();
    triggerPulsesForEvents(
      [{ kind: 'message' }, { kind: 'agent_idle' }, { kind: 'shadow_insight' }],
      undefined,
      undefined,
      t0 + 1000
    );

    // Batch callers should get one visible effect from action events and no effect from quiet events.
    expect(mixedBatchBoost).toBeGreaterThan(0);
    expect(sampleCanvasPulseBoost(t0 + 1050, 800, 600)).toBe(0);
  });

  it('keeps error and session-start events visually distinct from routine tool starts', () => {
    const t0 = 60000;

    triggerPulseForEventKind('tool_started', 0.5, 0.5, t0);
    const startedBoost = sampleCanvasPulseBoost(t0 + 50, 800, 600);

    clearCanvasPulses();
    clearDebounceState();
    triggerPulseForEventKind('tool_failed', 0.5, 0.5, t0);
    const failedBoost = sampleCanvasPulseBoost(t0 + 50, 800, 600);

    clearCanvasPulses();
    clearDebounceState();
    triggerPulseForEventKind('tool_started', 0.5, 0.5, t0);
    const startedExpired = sampleCanvasPulseBoost(t0 + 700, 800, 600);

    clearCanvasPulses();
    clearDebounceState();
    triggerPulseForEventKind('session_started', 0.5, 0.5, t0);
    const sessionStillAlive = sampleCanvasPulseBoost(t0 + 700, 800, 600);

    // These comparisons protect the visual semantics encoded in the event mapping.
    expect(failedBoost).toBeGreaterThan(startedBoost);
    expect(startedExpired).toBe(0);
    expect(sessionStillAlive).toBeGreaterThan(0);
  });
});
