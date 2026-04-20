import { describe, expect, it } from 'vitest';
import {
  createQualityController,
  estimateResourcePressure,
  sampleQualityController,
  tierFromResourcePressure,
  type ResourceMetrics
} from '../../src/renderer/canvas/quality';

function makeMetrics(overrides: Partial<ResourceMetrics> = {}): ResourceMetrics {
  return {
    nodeCount: 18,
    edgeCount: 14,
    particleCount: 80,
    pixelCount: 1280 * 720,
    hardwareConcurrency: 8,
    deviceMemoryGb: 16,
    prefersReducedMotion: false,
    ...overrides
  };
}

describe('canvas quality controller', () => {
  it('treats reduced-motion environments as low-budget scenes', () => {
    const pressure = estimateResourcePressure(makeMetrics({ prefersReducedMotion: true }));
    expect(pressure).toBe(100);
    expect(tierFromResourcePressure(pressure, true)).toBe('low');
  });

  it('downgrades after sustained slow frames', () => {
    let state = createQualityController(makeMetrics(), 'ultra');

    for (let index = 0; index < 24; index += 1) {
      state = sampleQualityController(state, 28, makeMetrics());
    }

    expect(state.tier).toBe('medium');
    expect(state.resourceBudgetTier).toBe('high');
  });

  it('recovers one tier at a time without exceeding the resource budget', () => {
    const constrainedMetrics = makeMetrics({
      nodeCount: 24,
      edgeCount: 20,
      particleCount: 120,
      deviceMemoryGb: 8
    });
    let state = createQualityController(constrainedMetrics, 'low');

    for (let index = 0; index < 140; index += 1) {
      state = sampleQualityController(state, 9, constrainedMetrics);
    }

    expect(state.resourceBudgetTier).toBe('medium');
    expect(state.tier).toBe('medium');
  });
});
