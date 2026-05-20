import { createInitialWorkerState, handleParticleWorkerMessage } from './particle-worker-handler';
import type { ParticleEngineState } from './particle-engine-core';
import type { ParticleWorkerInput } from './particle-worker-protocol';

let state: ParticleEngineState = createInitialWorkerState();

self.onmessage = (event: MessageEvent<ParticleWorkerInput>) => {
  const result = handleParticleWorkerMessage(state, event.data);
  state = result.state;
  self.postMessage(result.response);
};