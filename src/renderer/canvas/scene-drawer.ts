import { colors } from '../theme/colors';
import {
  getQualityProfile,
  type QualityTier
} from './quality';
import {
  NODE_RADIUS,
  RISK_COLORS,
  STATE_COLORS,
  type Particle,
  type RiskLevel,
  type SimulationEdge,
  type SimulationNode
} from './types';

export function hexagonPath(cx: number, cy: number, radius: number): Path2D {
  const path = new Path2D();
  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI / 3) * index - Math.PI / 6;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    if (index === 0) {
      path.moveTo(x, y);
    } else {
      path.lineTo(x, y);
    }
  }
  path.closePath();
  return path;
}

export function toRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized
        .split('')
        .map((part) => `${part}${part}`)
        .join('')
    : normalized;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getQuadraticControlPoint(sx: number, sy: number, tx: number, ty: number) {
  const midX = (sx + tx) / 2;
  const midY = (sy + ty) / 2;
  const dx = tx - sx;
  const dy = ty - sy;
  return {
    x: midX - dy * 0.2,
    y: midY + dx * 0.2
  };
}

export function getQuadraticPoint(
  sx: number, sy: number,
  cx: number, cy: number,
  tx: number, ty: number,
  t: number
) {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * sx + 2 * inverse * t * cx + t * t * tx,
    y: inverse * inverse * sy + 2 * inverse * t * cy + t * t * ty
  };
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  gridStep: number,
  time = 0
) {
  ctx.save();
  const pulse = 0.06 + 0.03 * Math.sin(time * 0.0012);
  ctx.strokeStyle = `rgba(102, 204, 255, ${pulse})`;
  ctx.lineWidth = 0.5;
  for (let x = 0; x < width + gridStep; x += gridStep) {
    for (let y = 0; y < height + gridStep; y += gridStep * 0.866) {
      ctx.stroke(hexagonPath(x, y, gridStep * 0.5));
    }
  }
  ctx.restore();
}

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

export function drawAgentNode(
  ctx: CanvasRenderingContext2D,
  node: SimulationNode,
  time: number,
  qualityTier: QualityTier
) {
  const color = STATE_COLORS[node.state];
  const profile = getQualityProfile(qualityTier);
  const pulse = node.state === 'thinking' ? Math.sin(time * 0.0035) * 3.5 : 0;
  const radius = NODE_RADIUS + pulse;

  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = (node.state === 'thinking' ? 24 : 12) * profile.glowBlurScale;
  const hexagon = hexagonPath(node.x, node.y, radius);
  ctx.fillStyle = 'rgba(5, 5, 16, 0.92)';
  ctx.fill(hexagon);
  ctx.strokeStyle = color;
  ctx.lineWidth = (node.state === 'thinking' ? 2.6 : 1.6) * profile.edgeWidthScale;
  ctx.stroke(hexagon);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = colors.textPrimary;
  ctx.font = 'bold 11px "Segoe UI Variable Text", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(node.label, node.x, node.y - 4);
  ctx.fillStyle = colors.textSecondary;
  ctx.font = '9px system-ui';
  ctx.fillText(`${node.toolCount} tools`, node.x, node.y + 10);
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

export function drawRiskVignette(ctx: CanvasRenderingContext2D, width: number, height: number, riskLevel: RiskLevel) {
  if (riskLevel === 'low') {
    return;
  }

  const gradient = ctx.createRadialGradient(
    width / 2, height / 2, 0,
    width / 2, height / 2, Math.max(width, height)
  );
  gradient.addColorStop(0, 'transparent');
  gradient.addColorStop(1, toRgba(RISK_COLORS[riskLevel], riskLevel === 'critical' ? 0.2 : 0.13));

  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

export interface CanonicalScene {
  label: string;
  width: number;
  height: number;
  time: number;
  qualityTier: QualityTier;
  nodes: SimulationNode[];
  edges: SimulationEdge[];
  particles: Particle[];
  riskLevel: RiskLevel;
}

export function drawScene(ctx: CanvasRenderingContext2D, scene: CanonicalScene) {
  const profile = getQualityProfile(scene.qualityTier);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, scene.width * 2, scene.height * 2);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = colors.void;
  ctx.fillRect(0, 0, scene.width, scene.height);

  if (profile.showGrid) {
    drawGrid(ctx, scene.width, scene.height, profile.gridStep, scene.time);
  }

  const nodesById = new Map(scene.nodes.map((node) => [node.id, node]));
  for (const edge of scene.edges) {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (source && target) {
      drawEdge(ctx, source, target, STATE_COLORS[edge.state], profile.edgeWidthScale);
    }
  }

  const edgesById = new Map(scene.edges.map((edge) => [edge.id, edge]));
  drawParticles(ctx, scene.particles, nodesById, edgesById, scene.qualityTier);

  for (const node of scene.nodes) {
    drawAgentNode(ctx, node, scene.time, scene.qualityTier);
  }

  if (profile.showRiskVignette) {
    drawRiskVignette(ctx, scene.width, scene.height, scene.riskLevel);
  }
}

export const CANVAS_WIDTH = 760;
export const CANVAS_HEIGHT = 420;
export const FROZEN_TIME = 5000;
