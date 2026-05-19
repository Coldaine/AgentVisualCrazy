import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearCanvasPulses,
  sampleCanvasPulseBoost,
  triggerCanvasPulse
} from '../../src/renderer/canvas/canvas-pulse';

describe('canvas pulse API', () => {
  beforeEach(() => {
    clearCanvasPulses();
  });

  it('returns zero boost with no active pulses', () => {
    expect(sampleCanvasPulseBoost(performance.now(), 800, 600)).toBe(0);
  });

  it('ramps boost while a burst pulse is active', () => {
    const t0 = performance.now();
    triggerCanvasPulse('burst', 0.5, 0.5, { intensity: 1, durationMs: 500 });
    const early = sampleCanvasPulseBoost(t0 + 50, 800, 600);
    const late = sampleCanvasPulseBoost(t0 + 600, 800, 600);
    expect(early).toBeGreaterThan(0);
    expect(late).toBe(0);
  });
});
