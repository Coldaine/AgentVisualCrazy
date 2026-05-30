import {
  advanceParticleEngineState,
  createParticleEngineState,
  syncParticleEngineState,
  type ParticleEngineState
} from './particle-engine-core';
import type { ParticleWorkerInput, ParticleWorkerOutput } from './particle-worker-protocol';

export function createInitialWorkerState(): ParticleEngineState {
  return createParticleEngineState([], 'high');
}

export function handleParticleWorkerMessage(
  state: ParticleEngineState,
  message: ParticleWorkerInput
): { state: ParticleEngineState; response: ParticleWorkerOutput } {
  let nextState: ParticleEngineState;

  if (message.type === 'scene') {
    nextState = syncParticleEngineState(state, message.edges, message.qualityTier);
  } else if (message.type === 'quality') {
    nextState = syncParticleEngineState(state, state.edges, message.qualityTier);
  } else if (message.type === 'tick') {
    nextState = advanceParticleEngineState(state, message.dtMs);
  } else {
    nextState = state;
  }

  return {
    state: nextState,
    response: {
      type: 'snapshot',
      particles: nextState.particles
    }
  };
}