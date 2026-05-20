import { toRgba, getQuadraticControlPoint, getQuadraticPoint } from './draw-utils';
import { type SimulationEdge, type SimulationNode, type Particle } from './types';
import { type QualityTier, getQualityProfile } from './quality';

export function drawEdge(
  ctx: CanvasRenderingContext2D,
  source: SimulationNode,
  target: SimulationNode,
  color: string,
  edgeWidthScale: number
) {
  const controlPoint = getQuadraticControlPoint(source.x, source.y, target.x, target.y);
  const gradient = ctx.createLinearGradient(source.x, source.y, target.x, target.y);
  gradient.addColorStop(0, toRgba(color, 0.55));
  gradient.addColorStop(1, toRgba(color, 0.12));

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(source.x, source.y);
  ctx.quadraticCurveTo(controlPoint.x, controlPoint.y, target.x, target.y);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 3 * edgeWidthScale;
  ctx.stroke();
  ctx.restore();
}

export function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  nodesById: Map<string, SimulationNode>,
  edgesById: Map<string, SimulationEdge>,
  qualityTier: QualityTier
) {
  const profile = getQualityProfile(qualityTier);
  if (profile.particleMode === 'disabled') {
    return;
  }

  for (const particle of particles) {
    const edge = edgesById.get(particle.edgeId);
    if (!edge) {
      continue;
    }
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source || !target) {
      continue;
    }

    const controlPoint = getQuadraticControlPoint(source.x, source.y, target.x, target.y);
    const head = getQuadraticPoint(source.x, source.y, controlPoint.x, controlPoint.y, target.x, target.y, particle.progress);
    const tailProgress = Math.max(0, particle.progress - particle.trailLength / 240);
    const tail = getQuadraticPoint(source.x, source.y, controlPoint.x, controlPoint.y, target.x, target.y, tailProgress);
    const alpha = particle.opacity * profile.particleAlphaScale;
    const radius = Math.max(1.25, particle.size * profile.particleSizeScale);
    const gradient = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);

    gradient.addColorStop(0, toRgba(particle.color, 0));
    gradient.addColorStop(1, toRgba(particle.color, alpha));

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(head.x, head.y);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = radius;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(head.x, head.y, radius + 0.75, 0, Math.PI * 2);
    ctx.fillStyle = toRgba(particle.color, Math.min(1, alpha + 0.12));
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 6 * profile.glowBlurScale;
    ctx.fill();
    ctx.restore();
  }
}
