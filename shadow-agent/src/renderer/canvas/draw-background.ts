import { hexagonPath, toRgba } from './draw-utils';
import { RISK_COLORS, type RiskLevel } from './types';

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

export function drawRiskVignette(ctx: CanvasRenderingContext2D, width: number, height: number, riskLevel: RiskLevel) {
  if (riskLevel === 'low') {
    return;
  }

  const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height));
  gradient.addColorStop(0, 'transparent');
  gradient.addColorStop(1, toRgba(RISK_COLORS[riskLevel], riskLevel === 'critical' ? 0.2 : 0.13));

  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
