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
import {
  clearCanvasPulses,
  sampleCanvasPulseBoost,
  tickCanvasPulses,
  triggerCanvasPulse
} from '../../src/renderer/canvas/canvas-pulse';

describe('canvas pulse API', () => {
  beforeEach(() => {
    clearCanvasPulses();
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
    // Pulse A: strong burst, center
    triggerCanvasPulse('burst', 0.5, 0.5, { intensity: 1, durationMs: 400, atMs: t0 });
    // Pulse B: weaker burst, center (75 % through duration at sample time)
    triggerCanvasPulse('burst', 0.5, 0.5, { intensity: 0.3, durationMs: 400, atMs: t0 + 100 });

    const sampleTime = t0 + 300; // A at 75 % lifetime, B at 50 % lifetime
    const boostAOnly =
      1 * (1 - 300 / 400) * 1 * 0.12; // 0.03
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

    // At t0+350: burst is 70 % through, ripple is 30 % through
    const expectedBurst = 1 * (1 - 350 / 500) * 1 * 0.12; // 0.036
    const expectedRipple = 1 * (1 - 150 / 500) * 1 * 0.06; // 0.042

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
    // dist from center (400, 300) to (0, 0) = 500
    // maxDist = hypot(800, 600) / 2 = 500
    // spatial = max(0, 1 - 500/500) = 0
    expect(sampleCanvasPulseBoost(t0 + 100, 800, 600)).toBe(0);
  });

  it('ripple boost at edge (1, 0) is zero due to spatial falloff', () => {
    const t0 = 40000;
    triggerCanvasPulse('ripple', 1, 0, { intensity: 1, durationMs: 1000, atMs: t0 });
    // dist from center (400, 300) to (800, 0) = 500
    // spatial = 0
    expect(sampleCanvasPulseBoost(t0 + 100, 800, 600)).toBe(0);
  });

  it('ripple boost at midway (0.25, 0.25) has exactly half spatial falloff', () => {
    const t0 = 50000;
    triggerCanvasPulse('ripple', 0.25, 0.25, { intensity: 1, durationMs: 1000, atMs: t0 });
    // dist from center (400, 300) to (200, 150) = hypot(200, 150) = 250
    // maxDist = 500, spatial = 1 - 250/500 = 0.5
    const expected = 1 * (1 - 100 / 1000) * 0.5 * 0.06;
    expect(sampleCanvasPulseBoost(t0 + 100, 800, 600)).toBeCloseTo(expected, 6);
  });

  // -----------------------------------------------------------------------
  // Intensity / duration edge cases (acceptance criterion 3)
  // -----------------------------------------------------------------------

  it('zero-duration pulse is pruned on first tick after creation', () => {
    const t0 = 60000;
    triggerCanvasPulse('burst', 0.5, 0.5, { durationMs: 0, atMs: t0 });
    // At t0+1: elapsed=1 > durationMs=0 → pruned by pruneExpiredCanvasPulses
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
    // amp = -1 * falloff * spatial * 0.12 → negative → max(0, ...) = 0
    expect(sampleCanvasPulseBoost(t0 + 50, 800, 600)).toBe(0);
  });
});
