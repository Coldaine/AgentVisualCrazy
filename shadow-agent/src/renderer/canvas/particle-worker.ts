import { advanceParticleEngineState, createParticleEngineState, syncParticleEngineState, type ParticleEngineState } from './particle-engine-core';
import type { ParticleWorkerInput, ParticleWorkerOutput } from './particle-worker-protocol';

let state: ParticleEngineState = createParticleEngineState([], 'high');

self.onmessage = (event: MessageEvent<ParticleWorkerInput>) => {
  const message = event.data;
  if (message.type === 'scene') {
    state = syncParticleEngineState(state, message.edges, message.qualityTier);
  } else if (message.type === 'quality') {
    state = syncParticleEngineState(state, state.edges, message.qualityTier);
  } else if (message.type === 'tick') {
    state = advanceParticleEngineState(state, message.dtMs);
  }

  const response: ParticleWorkerOutput = {
    type: 'snapshot',
    particles: state.particles
  };
  self.postMessage(response);
};
