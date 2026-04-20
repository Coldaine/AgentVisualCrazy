import type { Particle } from './types';
import type { QualityTier } from './quality';
import type { ParticleSceneEdge } from './particle-engine-core';

export type ParticleWorkerInput =
  | {
      type: 'scene';
      edges: ParticleSceneEdge[];
      qualityTier: QualityTier;
    }
  | {
      type: 'quality';
      qualityTier: QualityTier;
    }
  | {
      type: 'tick';
      dtMs: number;
    };

export type ParticleWorkerOutput = {
  type: 'snapshot';
  particles: Particle[];
};
