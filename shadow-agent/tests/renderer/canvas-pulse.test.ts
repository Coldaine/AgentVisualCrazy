/**
 * Tests for canvas-pulse burst/ripple pulse API.
 *
 * Boost curve per pulse:
 *   falloff = 1 - elapsed/durationMs          (linear 1→0 over lifetime)
 *   spatial = max(0, 1 - dist(pulse, center) / half_diagonal)  (1 at center, 0 at corners)
 *   amp = intensity * falloff * spatial * (burst ? 0.12 : 0.06)
 *   final boost = max(boost, amp) across all active pulses
 */
import { describe, expect, it, beforeEach } from 'vitest';
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

describe('canvas pulse API', () => {
  beforeEach(() => {
    clearCanvasPulses();
    clearDebounceState();
  });

  // -----------------------------------------------------------------------
  // Existing baseline tests
  // -----------------------------------------------------------------------

  it('returns zero boost with no active pulses', () => {
    expect(sampleCanvasPulseBoost(1000, 800, 600)).toBe(0);
  });

  it('ramps boost while a burst pulse is active', () => {
    const t0 = 1000;
    triggerCanvasPulse('burst', 0.5, 0.5, { intensity: 1, durationMs: 500, atMs: t0 });
    const early = sampleCanvasPulseBoost(t0 + 50, 800, 600);
    const late = sampleCanvasPulseBoost(t0 + 600, 800, 600);
    expect(early).toBeGreaterThan(0);
    expect(late).toBe(0);
  });

  it('tickCanvasPulses prunes expired pulses without sampling the grid', () => {
    const t0 = 2000;
    triggerCanvasPulse('ripple', 0.5, 0.5, { durationMs: 100, atMs: t0 });
    tickCanvasPulses(t0 + 200);
    expect(sampleCanvasPulseBoost(t0 + 200, 800, 600)).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Concurrent pulses (acceptance criterion 1)
  // -----------------------------------------------------------------------

  it('stacks concurrent burst pulses, boost reflects max amp not sum', () => {
    const t0 = 5000;
    triggerCanvasPulse('burst', 0.5, 0.5, { intensity: 1, durationMs: 400, atMs: t0 });
    triggerCanvasPulse('burst', 0.5, 0.5, { intensity: 0.3, durationMs: 400, atMs: t0 + 100 });

    const sampleTime = t0 + 300;
    const boostAOnly = 1 * (1 - 300 / 400) * 1 * 0.12;
    const boostBOnly =
      0.3 * (1 - 200 / 400) * 1 * 0.12; // 0.018

    const boost = sampleCanvasPulseBoost(sampleTime, 800, 600);
    expect(boost).toBe(Math.max(boostAOnly, boostBOnly));
    expect(boost).toBeLessThan(boostAOnly + boostBOnly);
  });

  it('concurrent burst + ripple both contribute via max amp', () => {
    const t0 = 10000;
    triggerCanvasPulse('burst', 0.5, 0.5, { intensity: 1, durationMs: 500, atMs: t0 });
    triggerCanvasPulse('ripple', 0.5, 0.5, { intensity: 1, durationMs: 500, atMs: t0 + 200 });

    const expectedBurst = 1 * (1 - 350 / 500) * 1 * 0.12;
    const expectedRipple = 1 * (1 - 150 / 500) * 1 * 0.06;

    const boost = sampleCanvasPulseBoost(t0 + 350, 800, 600);
    expect(boost).toBeCloseTo(Math.max(expectedBurst, expectedRipple), 6);
  });

  // -----------------------------------------------------------------------
  // Ripple spatial falloff (acceptance criterion 2)
  // -----------------------------------------------------------------------

  it('ripple boost is highest at canvas center (0.5, 0.5)', () => {
    const t0 = 20000;
    triggerCanvasPulse('ripple', 0.5, 0.5, { intensity: 1, durationMs: 1000, atMs: t0 });
    const centerBoost = sampleCanvasPulseBoost(t0 + 100, 800, 600);
    expect(centerBoost).toBeCloseTo(1 * (1 - 100 / 1000) * 1 * 0.06, 6);
  });

  it('ripple boost at canvas corner (0, 0) is zero due to spatial falloff', () => {
    const t0 = 30000;
    triggerCanvasPulse('ripple', 0, 0, { intensity: 1, durationMs: 1000, atMs: t0 });
    expect(sampleCanvasPulseBoost(t0 + 100, 800, 600)).toBe(0);
  });

  it('ripple boost at edge (1, 0) is zero due to spatial falloff', () => {
    const t0 = 40000;
    triggerCanvasPulse('ripple', 1, 0, { intensity: 1, durationMs: 1000, atMs: t0 });
    expect(sampleCanvasPulseBoost(t0 + 100, 800, 600)).toBe(0);
  });

  it('ripple boost at midway (0.25, 0.25) has exactly half spatial falloff', () => {
    const t0 = 50000;
    triggerCanvasPulse('ripple', 0.25, 0.25, { intensity: 1, durationMs: 1000, atMs: t0 });
    const expected = 1 * (1 - 100 / 1000) * 0.5 * 0.06;
    expect(sampleCanvasPulseBoost(t0 + 100, 800, 600)).toBeCloseTo(expected, 6);
  });

  // -----------------------------------------------------------------------
  // Intensity / duration edge cases (acceptance criterion 3)
  // -----------------------------------------------------------------------

  it('zero-duration pulse is pruned on first tick after creation', () => {
    const t0 = 60000;
    triggerCanvasPulse('burst', 0.5, 0.5, { durationMs: 0, atMs: t0 });
    expect(sampleCanvasPulseBoost(t0 + 1, 800, 600)).toBe(0);
  });

  it('zero intensity produces zero boost', () => {
    const t0 = 70000;
    triggerCanvasPulse('burst', 0.5, 0.5, { intensity: 0, durationMs: 500, atMs: t0 });
    expect(sampleCanvasPulseBoost(t0 + 50, 800, 600)).toBe(0);
  });

  it('intensity above 1 scales boost proportionally', () => {
    const t0 = 80000;
    triggerCanvasPulse('burst', 0.5, 0.5, { intensity: 2, durationMs: 500, atMs: t0 });
    const expected = 2 * (1 - 50 / 500) * 1 * 0.12;
    expect(sampleCanvasPulseBoost(t0 + 50, 800, 600)).toBeCloseTo(expected, 6);
  });

  it('negative intensity is treated as zero boost (clamped by max(0, boost))', () => {
    const t0 = 90000;
    triggerCanvasPulse('burst', 0.5, 0.5, { intensity: -1, durationMs: 500, atMs: t0 });
    expect(sampleCanvasPulseBoost(t0 + 50, 800, 600)).toBe(0);
  });

  // -----------------------------------------------------------------------
  // EventKind pulse mapping (acceptance criterion 4+)
  // -----------------------------------------------------------------------

  it('triggers burst pulse for tool_started', () => {
    const t0 = 100000;
    const triggered = triggerPulseForEventKind('tool_started', 0.5, 0.5, t0);
    expect(triggered).toBe(true);
    expect(sampleCanvasPulseBoost(t0 + 50, 800, 600)).toBeGreaterThan(0);
  });

  it('triggers ripple pulse for tool_completed', () => {
    const t0 = 110000;
    triggerPulseForEventKind('tool_completed', 0.5, 0.5, t0);
    expect(sampleCanvasPulseBoost(t0 + 50, 800, 600)).toBeGreaterThan(0);
  });

  it('triggers burst pulse for tool_failed', () => {
    const t0 = 120000;
    triggerPulseForEventKind('tool_failed', 0.5, 0.5, t0);
    const boost = sampleCanvasPulseBoost(t0 + 50, 800, 600);
    expect(boost).toBeGreaterThan(0);
  });

  it('triggers ripple pulse for subagent_dispatched', () => {
    const t0 = 130000;
    triggerPulseForEventKind('subagent_dispatched', 0.5, 0.5, t0);
    expect(sampleCanvasPulseBoost(t0 + 50, 800, 600)).toBeGreaterThan(0);
  });

  it('triggers ripple pulse for subagent_returned', () => {
    const t0 = 140000;
    triggerPulseForEventKind('subagent_returned', 0.5, 0.5, t0);
    expect(sampleCanvasPulseBoost(t0 + 50, 800, 600)).toBeGreaterThan(0);
  });

  it('triggers burst pulse for agent_spawned', () => {
    const t0 = 150000;
    triggerPulseForEventKind('agent_spawned', 0.5, 0.5, t0);
    expect(sampleCanvasPulseBoost(t0 + 50, 800, 600)).toBeGreaterThan(0);
  });

  it('triggers ripple pulse for agent_completed', () => {
    const t0 = 160000;
    triggerPulseForEventKind('agent_completed', 0.5, 0.5, t0);
    expect(sampleCanvasPulseBoost(t0 + 50, 800, 600)).toBeGreaterThan(0);
  });

  it('triggers burst pulse for session_started', () => {
    const t0 = 170000;
    triggerPulseForEventKind('session_started', 0.5, 0.5, t0);
    expect(sampleCanvasPulseBoost(t0 + 50, 800, 600)).toBeGreaterThan(0);
  });

  it('triggers burst pulse for permission_requested', () => {
    const t0 = 180000;
    triggerPulseForEventKind('permission_requested', 0.5, 0.5, t0);
    expect(sampleCanvasPulseBoost(t0 + 50, 800, 600)).toBeGreaterThan(0);
  });

  it('returns false for unmapped EventKind (message)', () => {
    const triggered = triggerPulseForEventKind('message', 0.5, 0.5, 190000);
    expect(triggered).toBe(false);
  });

  it('returns false for unmapped EventKind (session_ended)', () => {
    const triggered = triggerPulseForEventKind('session_ended', 0.5, 0.5, 200000);
    expect(triggered).toBe(false);
  });

  it('returns false for unmapped EventKind (context_snapshot)', () => {
    const triggered = triggerPulseForEventKind('context_snapshot', 0.5, 0.5, 210000);
    expect(triggered).toBe(false);
  });

  it('returns false for unmapped EventKind (shadow_insight)', () => {
    const triggered = triggerPulseForEventKind('shadow_insight', 0.5, 0.5, 220000);
    expect(triggered).toBe(false);
  });

  it('returns false for unmapped EventKind (agent_idle)', () => {
    const triggered = triggerPulseForEventKind('agent_idle', 0.5, 0.5, 230000);
    expect(triggered).toBe(false);
  });

  it('uses canvas center (0.5, 0.5) as default pulse origin', () => {
    const t0 = 240000;
    triggerPulseForEventKind('tool_started', undefined, undefined, t0);
    const centerBoost = sampleCanvasPulseBoost(t0 + 100, 800, 600);
    expect(centerBoost).toBeGreaterThan(0);
  });

  it('debounces same EventKind within 100ms window', () => {
    const t0 = 250000;
    const first = triggerPulseForEventKind('tool_started', 0.5, 0.5, t0);
    const second = triggerPulseForEventKind('tool_started', 0.5, 0.5, t0 + 50);
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('allows same EventKind after debounce window expires', () => {
    const t0 = 260000;
    const first = triggerPulseForEventKind('tool_started', 0.5, 0.5, t0);
    const second = triggerPulseForEventKind('tool_started', 0.5, 0.5, t0 + 150);
    expect(first).toBe(true);
    expect(second).toBe(true);
  });

  it('does not debounce different EventKinds', () => {
    const t0 = 270000;
    const toolPulse = triggerPulseForEventKind('tool_started', 0.5, 0.5, t0);
    const agentPulse = triggerPulseForEventKind('agent_spawned', 0.5, 0.5, t0 + 50);
    expect(toolPulse).toBe(true);
    expect(agentPulse).toBe(true);
  });

  // -----------------------------------------------------------------------
  // triggerPulsesForEvents batch API
  // -----------------------------------------------------------------------

  it('triggerPulsesForEvents fires pulses for a batch of mapped events', () => {
    const t0 = 280000;
    triggerPulsesForEvents(
      [{ kind: 'tool_started' }, { kind: 'subagent_dispatched' }, { kind: 'message' }],
      undefined,
      undefined,
      t0
    );
    expect(sampleCanvasPulseBoost(t0 + 50, 800, 600)).toBeGreaterThan(0);
  });

  it('triggerPulsesForEvents skips unmapped kinds without error', () => {
    const t0 = 290000;
    triggerPulsesForEvents(
      [{ kind: 'message' }, { kind: 'agent_idle' }, { kind: 'shadow_insight' }],
      undefined,
      undefined,
      t0
    );
    expect(sampleCanvasPulseBoost(t0 + 50, 800, 600)).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Pulse kind / intensity matches documented mapping
  // -----------------------------------------------------------------------

  it('tool_failed has higher intensity than tool_started', () => {
    const t0 = 300000;
    clearCanvasPulses();
    triggerPulseForEventKind('tool_started', 0.5, 0.5, t0);
    const startedBoost = sampleCanvasPulseBoost(t0 + 50, 800, 600);

    clearCanvasPulses();
    triggerPulseForEventKind('tool_failed', 0.5, 0.5, t0);
    const failedBoost = sampleCanvasPulseBoost(t0 + 50, 800, 600);

    expect(failedBoost).toBeGreaterThan(startedBoost);
  });

  it('session_started has longer duration than tool_started', () => {
    const t0 = 310000;
    clearCanvasPulses();
    triggerPulseForEventKind('tool_started', 0.5, 0.5, t0);
    const startedAlive = sampleCanvasPulseBoost(t0 + 700, 800, 600);
    expect(startedAlive).toBe(0);

    clearCanvasPulses();
    triggerPulseForEventKind('session_started', 0.5, 0.5, t0);
    const sessionAlive = sampleCanvasPulseBoost(t0 + 700, 800, 600);
    expect(sessionAlive).toBeGreaterThan(0);
  });
});
