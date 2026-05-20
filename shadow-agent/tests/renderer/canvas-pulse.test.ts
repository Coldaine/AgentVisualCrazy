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
});
