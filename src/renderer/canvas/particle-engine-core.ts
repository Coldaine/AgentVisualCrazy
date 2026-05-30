import { getQualityProfile, type QualityTier } from './quality';
import { STATE_COLORS, type AgentState, type Particle } from './types';

export interface ParticleSceneEdge {
  id: string;
  state: AgentState;
}

export interface ParticleEngineState {
  edges: ParticleSceneEdge[];
  qualityTier: QualityTier;
  particles: Particle[];
}

function seededUnitInterval(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

function buildParticle(edge: ParticleSceneEdge, qualityTier: QualityTier, slot: number): Particle {
  const profile = getQualityProfile(qualityTier);
  const baseSeed = `${edge.id}:${slot}:${qualityTier}`;
  const progress = seededUnitInterval(`${baseSeed}:progress`);
  const speedVariance = seededUnitInterval(`${baseSeed}:speed`);
  const trailVariance = seededUnitInterval(`${baseSeed}:trail`);
  const sizeVariance = seededUnitInterval(`${baseSeed}:size`);
  const opacityVariance = seededUnitInterval(`${baseSeed}:opacity`);

  return {
    id: `particle-${edge.id}-${slot}`,
    edgeId: edge.id,
    progress,
    speed: 0.04 + speedVariance * 0.065,
    trailLength: 12 + Math.round(trailVariance * 14 * profile.particleTrailScale),
    color: STATE_COLORS[edge.state],
    opacity: 0.4 + opacityVariance * 0.45 * profile.particleAlphaScale,
    size: 1.5 + sizeVariance * 2 * profile.particleSizeScale
  };
}

export function syncParticleEngineState(
  currentState: ParticleEngineState,
  edges: ParticleSceneEdge[],
  qualityTier: QualityTier
): ParticleEngineState {
  const profile = getQualityProfile(qualityTier);
  if (profile.particleMode === 'disabled' || profile.maxParticles === 0 || edges.length === 0) {
    return {
      edges: [...edges],
      qualityTier,
      particles: []
    };
  }

  const particles: Particle[] = [];
  for (const edge of edges) {
    for (let slot = 0; slot < profile.particlesPerEdge; slot += 1) {
      if (particles.length >= profile.maxParticles) {
        break;
      }
      particles.push(buildParticle(edge, qualityTier, slot));
    }
    if (particles.length >= profile.maxParticles) {
      break;
    }
  }

  const previousParticles = new Map(currentState.particles.map((particle) => [particle.id, particle]));
  const mergedParticles = particles.map((particle) => {
    const previous = previousParticles.get(particle.id);
    return previous ? { ...particle, progress: previous.progress } : particle;
  });

  return {
    edges: [...edges],
    qualityTier,
    particles: mergedParticles
  };
}

export function createParticleEngineState(edges: ParticleSceneEdge[], qualityTier: QualityTier): ParticleEngineState {
  return syncParticleEngineState(
    {
      edges: [],
      qualityTier,
      particles: []
    },
    edges,
    qualityTier
  );
}

export function advanceParticleEngineState(state: ParticleEngineState, dtMs: number): ParticleEngineState {
  if (state.particles.length === 0) {
    return state;
  }

  const clampedDt = Math.max(0, Math.min(dtMs, 48));
  const particles = state.particles.map((particle) => {
    let progress = particle.progress + (particle.speed * clampedDt) / 1000;
    while (progress >= 1) {
      progress -= 1;
    }
    return {
      ...particle,
      progress
    };
  });

  return {
    ...state,
    particles
  };
}
