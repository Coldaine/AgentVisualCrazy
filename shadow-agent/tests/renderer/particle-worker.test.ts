import { describe, expect, it } from 'vitest';
import { createParticleEngineState, type ParticleSceneEdge } from '../../src/renderer/canvas/particle-engine-core';
import { advanceParticleEngineState } from '../../src/renderer/canvas/particle-engine-core';
import {
  createInitialWorkerState,
  handleParticleWorkerMessage
} from '../../src/renderer/canvas/particle-worker-handler';
import type { ParticleWorkerInput } from '../../src/renderer/canvas/particle-worker-protocol';

const edges: ParticleSceneEdge[] = [
  { id: 'root-child', state: 'thinking' },
  { id: 'child-leaf', state: 'complete' }
];

describe('particle-worker-handler', () => {
  describe('createInitialWorkerState', () => {
    it('creates an empty state at high quality', () => {
      const state = createInitialWorkerState();
      expect(state.particles).toHaveLength(0);
      expect(state.edges).toHaveLength(0);
      expect(state.qualityTier).toBe('high');
    });
  });

  describe('handleParticleWorkerMessage — scene', () => {
    it('builds particles from edges within the quality budget', () => {
      const initialState = createInitialWorkerState();
      const message: ParticleWorkerInput = { type: 'scene', edges, qualityTier: 'high' };
      const { state, response } = handleParticleWorkerMessage(initialState, message);

      expect(response.type).toBe('snapshot');
      expect(state.particles.length).toBe(12);
      expect(new Set(state.particles.map((p) => p.edgeId))).toEqual(new Set(edges.map((e) => e.id)));
      expect(response.particles).toBe(state.particles);
    });

    it('resets particles when edges change on a new scene', () => {
      const initialState = createParticleEngineState(edges, 'high');
      const advancedState = advanceParticleEngineState(initialState, 500);
      const newEdges: ParticleSceneEdge[] = [
        { id: 'brand-new-edge', state: 'tool' },
        { id: 'another-new-edge', state: 'idle' }
      ];

      const message: ParticleWorkerInput = { type: 'scene', edges: newEdges, qualityTier: 'high' };
      const { state } = handleParticleWorkerMessage(advancedState, message);

      expect(state.particles).toHaveLength(12);
      expect(new Set(state.particles.map((p) => p.edgeId)))
        .toEqual(new Set(newEdges.map((e) => e.id)));
      expect(state.qualityTier).toBe('high');
    });

    it('produces empty particles for low quality tier', () => {
      const message: ParticleWorkerInput = { type: 'scene', edges, qualityTier: 'low' };
      const { state } = handleParticleWorkerMessage(createInitialWorkerState(), message);
      expect(state.particles).toHaveLength(0);
    });
  });

  describe('handleParticleWorkerMessage — tick', () => {
    it('advances particle progress with fixed dt', () => {
      const sceneState = createParticleEngineState(edges, 'high');
      const { state } = handleParticleWorkerMessage(sceneState, { type: 'tick', dtMs: 1000 });

      expect(state.particles.length).toBe(12);
      expect(state.particles[0]?.progress).toBeGreaterThan(sceneState.particles[0]?.progress ?? 0);
      expect(state.particles[0]?.progress).toBeLessThan(1);
    });

    it('does not change progress when dtMs is zero', () => {
      const sceneState = createParticleEngineState(edges, 'high');
      const { state } = handleParticleWorkerMessage(sceneState, { type: 'tick', dtMs: 0 });

      state.particles.forEach((particle, index) => {
        expect(particle.progress).toBe(sceneState.particles[index]?.progress);
      });
    });

    it('clamps large dtMs to 48ms', () => {
      const sceneState = createParticleEngineState(edges, 'high');
      const clampedState = handleParticleWorkerMessage(sceneState, { type: 'tick', dtMs: 500 }).state;
      const largeDtState = handleParticleWorkerMessage(sceneState, { type: 'tick', dtMs: 48 }).state;

      clampedState.particles.forEach((particle, index) => {
        expect(particle.progress).toBe(largeDtState.particles[index]?.progress);
      });
    });

    it('wraps progress past 1.0 back to [0, 1)', () => {
      const singleParticleState = createParticleEngineState(
        [{ id: 'fast-edge', state: 'thinking' }],
        'ultra'
      );

      const fastDt = 4000;
      const { state } = handleParticleWorkerMessage(singleParticleState, { type: 'tick', dtMs: fastDt });

      state.particles.forEach((particle) => {
        expect(particle.progress).toBeGreaterThanOrEqual(0);
        expect(particle.progress).toBeLessThan(1);
      });
    });

    it('returns current particles in snapshot response', () => {
      const sceneState = createParticleEngineState(edges, 'high');
      const { response } = handleParticleWorkerMessage(sceneState, { type: 'tick', dtMs: 100 });
      expect(response.type).toBe('snapshot');
      expect(response.particles.length).toBe(12);
    });

    it('returns empty snapshot for empty state', () => {
      const { state, response } = handleParticleWorkerMessage(
        createInitialWorkerState(),
        { type: 'tick', dtMs: 100 }
      );
      expect(state.particles).toHaveLength(0);
      expect(response.particles).toHaveLength(0);
    });
  });

  describe('handleParticleWorkerMessage — quality', () => {
    it('re-syncs state with a new quality tier preserving edges', () => {
      const sceneState = createParticleEngineState(edges, 'high');
      const advancedState = advanceParticleEngineState(sceneState, 300);

      const { state } = handleParticleWorkerMessage(advancedState, { type: 'quality', qualityTier: 'ultra' });

      expect(state.qualityTier).toBe('ultra');
      expect(state.particles.length).toBe(20);
      expect(state.edges).toEqual(edges);
    });

    it('downgrading to low produces no particles', () => {
      const sceneState = createParticleEngineState(edges, 'high');
      const { state } = handleParticleWorkerMessage(sceneState, { type: 'quality', qualityTier: 'low' });
      expect(state.particles).toHaveLength(0);
    });
  });

  describe('handleParticleWorkerMessage — invalid payload', () => {
    it('returns state unchanged for an unrecognised message type at runtime', () => {
      const sceneState = createParticleEngineState(edges, 'high');
      const advancedState = advanceParticleEngineState(sceneState, 200);

      const result = handleParticleWorkerMessage(advancedState, {
        type: '__unknown__',
        dtMs: 100
      } as unknown as ParticleWorkerInput);

      expect(result.state).toBe(advancedState);
      expect(result.response.particles).toBe(advancedState.particles);
    });

    it('does not crash on negative dtMs (clamped to 0)', () => {
      const sceneState = createParticleEngineState(edges, 'high');
      const { state } = handleParticleWorkerMessage(sceneState, { type: 'tick', dtMs: -100 });

      expect(state.particles.length).toBe(12);
      state.particles.forEach((p) => expect(p.progress).toBeGreaterThanOrEqual(0));
    });
  });
});