import { hexagonPath, toRgba } from './draw-utils';
import { STATE_COLORS, NODE_RADIUS, type SimulationNode } from './types';
import { colors } from '../theme/colors';
import { type QualityTier, getQualityProfile } from './quality';
import type { ShadowInsight } from '../../shared/schema';

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

export function drawShadowNode(ctx: CanvasRenderingContext2D, agentX: number, agentY: number, insight: ShadowInsight, time: number) {
  const x = agentX + 88;
  const y = agentY - 62;
  const pulse = insight.kind === 'risk' ? Math.sin(time * 0.004) * 2.4 : 0;
  const outline = toRgba(colors.stateSubagent, 0.62);

  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(agentX, agentY);
  ctx.lineTo(x, y);
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.shadowColor = outline;
  ctx.shadowBlur = 16;
  const hexagon = hexagonPath(x, y, NODE_RADIUS - 4 + pulse);
  ctx.fillStyle = 'rgba(5, 5, 16, 0.7)';
  ctx.fill(hexagon);
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.stroke(hexagon);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = colors.textPrimary;
  ctx.font = 'bold 13px "Segoe UI Emoji", "Segoe UI Variable Text", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('\uD83D\uDD2E', x, y - 2);
  ctx.restore();
}

export function drawPredictionTrail(ctx: CanvasRenderingContext2D, sourceX: number, sourceY: number, targetLabel: string, confidence: number) {
  const targetX = sourceX + 140;
  const targetY = sourceY + 98;
  const controlPoint = {
    x: sourceX + 80,
    y: sourceY + 24
  };

  ctx.save();
  ctx.setLineDash([7, 6]);
  ctx.beginPath();
  ctx.moveTo(sourceX, sourceY);
  ctx.quadraticCurveTo(controlPoint.x, controlPoint.y, targetX, targetY);
  ctx.strokeStyle = toRgba(colors.textPrimary, Math.max(0.28, confidence * 0.55));
  ctx.lineWidth = 1.7;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = colors.textPrimary;
  ctx.font = '10px "Segoe UI Variable Text", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${targetLabel} (${Math.round(confidence * 100)}%)`, targetX + 12, targetY - 2);
  ctx.restore();
}
