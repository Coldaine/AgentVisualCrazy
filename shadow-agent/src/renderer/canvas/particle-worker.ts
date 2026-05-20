import { advanceParticleEngineState, createParticleEngineState, syncParticleEngineState, type ParticleEngineState } from './particle-engine-core';
import type { ParticleWorkerInput, ParticleWorkerOutput } from './particle-worker-protocol';

let state: ParticleEngineState = createParticleEngineState([], 'high');

self.onmessage = (event: MessageEvent<ParticleWorkerInput>) => {
  const payload = event.data;
  if (payload.type === 'scene') {
    state = syncParticleEngineState(state, payload.edges, payload.qualityTier);
  } else if (payload.type === 'quality') {
    state = syncParticleEngineState(state, state.edges, payload.qualityTier);
  } else if (payload.type === 'tick') {
    state = advanceParticleEngineState(state, payload.dtMs);
  }

  const response: ParticleWorkerOutput = {
    type: 'snapshot',
    particles: state.particles
  };
  self.postMessage(response);
};
