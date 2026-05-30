import '../helpers/path2d-polyfill';
import { describe, expect, it } from 'vitest';
import { colors } from '../../src/renderer/theme/colors';
import { createRecordedContext } from '../helpers/record-2d-context';
import { STATE_COLORS } from '../../src/renderer/canvas/types';
import { drawPredictionTrail, drawShadowNode } from '../../src/renderer/canvas/draw-utils';

describe('canvas draw semantics', () => {
  it('STATE_COLORS aligns thinking state with holo base', () => {
    expect(STATE_COLORS.thinking).toBe(colors.holoBase);
  });

  it('recorded context captures fill and stroke styles', () => {
    const ctx = createRecordedContext();
    ctx.fillStyle = colors.void;
    ctx.fillRect(0, 0, 400, 300);
    ctx.strokeStyle = colors.holoBase;
    ctx.lineWidth = 2;
    ctx.stroke();

    const commands = ctx.getRecordedCommands();
    expect(commands).toContainEqual({ type: 'setProperty', property: 'fillStyle', value: colors.void });
    expect(commands).toContainEqual({ type: 'fillRect', x: 0, y: 0, width: 400, height: 300 });
    expect(commands).toContainEqual({ type: 'setProperty', property: 'strokeStyle', value: colors.holoBase });
    expect(commands).toContainEqual({ type: 'setProperty', property: 'lineWidth', value: 2 });
    expect(commands.some((c) => c.type === 'stroke')).toBe(true);
  });
});

// US-003: brain-visual render proof. These exercise the SAME draw functions the
// live CanvasRenderer invokes (draw-utils.ts), proving the holographic shadow
// node + prediction trail actually render from a model insight.
describe('brain-visual render path (model insight reaches the canvas)', () => {
  it('drawShadowNode renders the holographic shadow node (dashed connector + hexagon + glyph)', () => {
    const ctx = createRecordedContext();
    drawShadowNode(
      ctx,
      220,
      160,
      { kind: 'risk', summary: 'Repeated reads on config.ts', confidence: 0.81 },
      5000
    );
    const commands = ctx.getRecordedCommands();
    // dashed connector from the agent node to the shadow node
    expect(commands.some((c) => c.type === 'setLineDash')).toBe(true);
    // hexagon body filled
    expect(commands.some((c) => c.type === 'fill')).toBe(true);
    // the crystal-ball glyph label
    expect(commands.some((c) => c.type === 'fillText' && c.text.includes('🔮'))).toBe(true);
  });

  it('drawPredictionTrail renders a dashed bezier with a labeled confidence percentage', () => {
    const ctx = createRecordedContext();
    drawPredictionTrail(ctx, 220, 160, 'Will likely run tests next', 0.72);
    const commands = ctx.getRecordedCommands();
    expect(commands.some((c) => c.type === 'quadraticCurveTo')).toBe(true);
    expect(commands.some((c) => c.type === 'setLineDash')).toBe(true);
    expect(
      commands.some(
        (c) => c.type === 'fillText' && c.text.includes('Will likely run tests next') && c.text.includes('72%')
      )
    ).toBe(true);
  });
});
