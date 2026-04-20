import { describe, expect, it } from 'vitest';
import {
  advanceParticleEngineState,
  createParticleEngineState,
  syncParticleEngineState,
  type ParticleSceneEdge
} from '../../src/renderer/canvas/particle-engine-core';

const edges: ParticleSceneEdge[] = [
  { id: 'root-child', state: 'thinking' },
  { id: 'child-leaf', state: 'complete' }
];

describe('particle engine core', () => {
  it('allocates particles within the selected quality budget', () => {
    const state = createParticleEngineState(edges, 'high');

    expect(state.particles.length).toBe(12);
    expect(new Set(state.particles.map((particle) => particle.edgeId))).toEqual(new Set(edges.map((edge) => edge.id)));
  });

  it('disables particles for the low tier', () => {
    const state = createParticleEngineState(edges, 'low');
    expect(state.particles).toHaveLength(0);
  });

  it('advances particle progress and preserves values for matched particles when the scene is resynced', () => {
    const initial = createParticleEngineState(edges, 'high');
    const advanced = advanceParticleEngineState(initial, 1000);
    const resynced = syncParticleEngineState(advanced, edges, 'medium');

    expect(advanced.particles.some((particle, index) => particle.progress !== initial.particles[index]?.progress)).toBe(true);
    expect(resynced.particles.every((particle) => particle.progress >= 0 && particle.progress < 1)).toBe(true);
    expect(resynced.particles[0]?.progress).toBe(advanced.particles[0]?.progress);
  });
});
