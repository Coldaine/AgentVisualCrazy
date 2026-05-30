export const QUALITY_TIER_ORDER = ['ultra', 'high', 'medium', 'low'] as const;

export type QualityTier = (typeof QUALITY_TIER_ORDER)[number];
export type QualityChangeReason = 'initial' | 'resource-budget' | 'frame-budget' | 'frame-recovery' | 'stable';
export type ParticleExecutionMode = 'worker' | 'inline' | 'disabled';

export interface ResourceMetrics {
  nodeCount: number;
  edgeCount: number;
  particleCount: number;
  pixelCount: number;
  hardwareConcurrency?: number;
  deviceMemoryGb?: number;
  prefersReducedMotion?: boolean;
}

export interface QualityProfile {
  tier: QualityTier;
  label: string;
  pixelRatioCap: number;
  showGrid: boolean;
  gridStep: number;
  glowBlurScale: number;
  edgeWidthScale: number;
  showRiskVignette: boolean;
  showShadowNode: boolean;
  showPredictionTrail: boolean;
  particleMode: ParticleExecutionMode;
  particlesPerEdge: number;
  maxParticles: number;
  particleSizeScale: number;
  particleAlphaScale: number;
  particleTrailScale: number;
  frameBudgetMs: number;
}

export interface QualityControllerState {
  tier: QualityTier;
  profile: QualityProfile;
  resourceBudgetTier: QualityTier;
  resourcePressure: number;
  frameTimeEmaMs: number;
  slowFrames: number;
  fastFrames: number;
  lastChangeReason: QualityChangeReason;
}

const EMA_ALPHA = 0.14;
const SLOW_FRAMES_TO_DOWNGRADE = 18;
const FAST_FRAMES_TO_UPGRADE = 120;
const HARD_DEGRADE_FRAME_MS = 40;

export const QUALITY_PROFILES: Record<QualityTier, QualityProfile> = {
  ultra: {
    tier: 'ultra',
    label: 'Ultra',
    pixelRatioCap: 2,
    showGrid: true,
    gridStep: 36,
    glowBlurScale: 1.25,
    edgeWidthScale: 1.15,
    showRiskVignette: true,
    showShadowNode: true,
    showPredictionTrail: true,
    particleMode: 'worker',
    particlesPerEdge: 10,
    maxParticles: 360,
    particleSizeScale: 1.15,
    particleAlphaScale: 1,
    particleTrailScale: 1.2,
    frameBudgetMs: 16.7
  },
  high: {
    tier: 'high',
    label: 'High',
    pixelRatioCap: 1.6,
    showGrid: true,
    gridStep: 44,
    glowBlurScale: 1,
    edgeWidthScale: 1,
    showRiskVignette: true,
    showShadowNode: true,
    showPredictionTrail: true,
    particleMode: 'worker',
    particlesPerEdge: 6,
    maxParticles: 220,
    particleSizeScale: 1,
    particleAlphaScale: 0.9,
    particleTrailScale: 1,
    frameBudgetMs: 16.7
  },
  medium: {
    tier: 'medium',
    label: 'Medium',
    pixelRatioCap: 1.25,
    showGrid: true,
    gridStep: 56,
    glowBlurScale: 0.72,
    edgeWidthScale: 0.92,
    showRiskVignette: true,
    showShadowNode: true,
    showPredictionTrail: false,
    particleMode: 'worker',
    particlesPerEdge: 3,
    maxParticles: 120,
    particleSizeScale: 0.86,
    particleAlphaScale: 0.7,
    particleTrailScale: 0.7,
    frameBudgetMs: 16.7
  },
  low: {
    tier: 'low',
    label: 'Low',
    pixelRatioCap: 1,
    showGrid: false,
    gridStep: 72,
    glowBlurScale: 0.45,
    edgeWidthScale: 0.82,
    showRiskVignette: true,
    showShadowNode: false,
    showPredictionTrail: false,
    particleMode: 'disabled',
    particlesPerEdge: 0,
    maxParticles: 0,
    particleSizeScale: 0,
    particleAlphaScale: 0,
    particleTrailScale: 0,
    frameBudgetMs: 16.7
  }
};

export function getQualityProfile(tier: QualityTier): QualityProfile {
  return QUALITY_PROFILES[tier];
}

function clampPressure(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function estimateResourcePressure(metrics: ResourceMetrics): number {
  if (metrics.prefersReducedMotion) {
    return 100;
  }

  const cpuPenalty =
    metrics.hardwareConcurrency === undefined ? 4 :
    metrics.hardwareConcurrency <= 2 ? 20 :
    metrics.hardwareConcurrency <= 4 ? 11 :
    metrics.hardwareConcurrency <= 6 ? 6 :
    0;

  const memoryPenalty =
    metrics.deviceMemoryGb === undefined ? 4 :
    metrics.deviceMemoryGb <= 4 ? 18 :
    metrics.deviceMemoryGb <= 8 ? 8 :
    0;

  const geometryPressure = metrics.nodeCount * 0.8 + metrics.edgeCount * 0.4;
  const particlePressure = metrics.particleCount * 0.08;
  const pixelPressure = metrics.pixelCount / 700_000;

  return clampPressure(geometryPressure + particlePressure + pixelPressure + cpuPenalty + memoryPenalty);
}

export function tierFromResourcePressure(resourcePressure: number, prefersReducedMotion = false): QualityTier {
  if (prefersReducedMotion || resourcePressure >= 55) {
    return 'low';
  }
  if (resourcePressure >= 35) {
    return 'medium';
  }
  if (resourcePressure >= 20) {
    return 'high';
  }
  return 'ultra';
}

export function getTierIndex(tier: QualityTier): number {
  return QUALITY_TIER_ORDER.indexOf(tier);
}

function getLowerQualityTier(tier: QualityTier): QualityTier {
  const index = getTierIndex(tier);
  return QUALITY_TIER_ORDER[Math.min(index + 1, QUALITY_TIER_ORDER.length - 1)];
}

function getHigherQualityTier(tier: QualityTier): QualityTier {
  const index = getTierIndex(tier);
  return QUALITY_TIER_ORDER[Math.max(index - 1, 0)];
}

function clampTierToBudget(tier: QualityTier, budgetTier: QualityTier): QualityTier {
  return QUALITY_TIER_ORDER[Math.max(getTierIndex(tier), getTierIndex(budgetTier))];
}

export function createQualityController(metrics: ResourceMetrics, startingTier?: QualityTier): QualityControllerState {
  const resourcePressure = estimateResourcePressure(metrics);
  const resourceBudgetTier = tierFromResourcePressure(resourcePressure, metrics.prefersReducedMotion);
  const tier = clampTierToBudget(startingTier ?? resourceBudgetTier, resourceBudgetTier);
  return {
    tier,
    profile: getQualityProfile(tier),
    resourceBudgetTier,
    resourcePressure,
    frameTimeEmaMs: 16.7,
    slowFrames: 0,
    fastFrames: 0,
    lastChangeReason: 'initial'
  };
}

export function sampleQualityController(
  state: QualityControllerState,
  frameTimeMs: number,
  metrics: ResourceMetrics
): QualityControllerState {
  const resourcePressure = estimateResourcePressure(metrics);
  const resourceBudgetTier = tierFromResourcePressure(resourcePressure, metrics.prefersReducedMotion);
  const frameTimeEmaMs = state.frameTimeEmaMs * (1 - EMA_ALPHA) + frameTimeMs * EMA_ALPHA;

  let tier = clampTierToBudget(state.tier, resourceBudgetTier);
  let slowFrames = state.slowFrames;
  let fastFrames = state.fastFrames;
  let lastChangeReason: QualityChangeReason = 'stable';

  if (tier !== state.tier) {
    slowFrames = 0;
    fastFrames = 0;
    lastChangeReason = 'resource-budget';
  }

  const profile = getQualityProfile(tier);
  const slowBudgetMs = profile.frameBudgetMs * 1.18;
  const fastBudgetMs = profile.frameBudgetMs * 0.72;
  const severeSlowFrame = frameTimeMs >= HARD_DEGRADE_FRAME_MS || frameTimeEmaMs >= HARD_DEGRADE_FRAME_MS * 0.88;

  if (severeSlowFrame) {
    slowFrames += 4;
    fastFrames = 0;
  } else if (frameTimeEmaMs > slowBudgetMs) {
    slowFrames += 1;
    fastFrames = 0;
  } else if (frameTimeEmaMs < fastBudgetMs) {
    fastFrames += 1;
    slowFrames = Math.max(0, slowFrames - 1);
  } else {
    slowFrames = Math.max(0, slowFrames - 1);
    fastFrames = Math.max(0, fastFrames - 2);
  }

  if (slowFrames >= SLOW_FRAMES_TO_DOWNGRADE && tier !== 'low') {
    tier = getLowerQualityTier(tier);
    slowFrames = 0;
    fastFrames = 0;
    lastChangeReason = 'frame-budget';
  } else if (fastFrames >= FAST_FRAMES_TO_UPGRADE) {
    const upgradeTier = getHigherQualityTier(tier);
    if (getTierIndex(upgradeTier) >= getTierIndex(resourceBudgetTier) && upgradeTier !== tier) {
      tier = upgradeTier;
      slowFrames = 0;
      fastFrames = 0;
      lastChangeReason = 'frame-recovery';
    }
  }

  return {
    tier,
    profile: getQualityProfile(tier),
    resourceBudgetTier,
    resourcePressure,
    frameTimeEmaMs,
    slowFrames,
    fastFrames,
    lastChangeReason
  };
}
