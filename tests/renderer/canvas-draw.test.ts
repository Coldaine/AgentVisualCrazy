import '../helpers/path2d-polyfill';
import { describe, expect, it } from 'vitest';
import { createRecordedContext, type CanvasCommand } from '../helpers/record-2d-context';
import { drawAgentNode, drawPredictionTrail, drawShadowNode } from '../../src/renderer/canvas/draw-utils';

function commandsOfType<T extends CanvasCommand['type']>(
  commands: readonly CanvasCommand[],
  type: T
): Array<Extract<CanvasCommand, { type: T }>> {
  return commands.filter((command): command is Extract<CanvasCommand, { type: T }> => command.type === type);
}

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
    // These coordinates protect the actual connector geometry, not a palette constant.
    expect(commandsOfType(commands, 'moveTo')[0]).toEqual({ type: 'moveTo', x: 220, y: 160 });
    expect(commandsOfType(commands, 'lineTo')[0]).toEqual({ type: 'lineTo', x: 308, y: 98 });
    expect(commands).toContainEqual({ type: 'setLineDash', segments: [6, 5] });
    expect(commandsOfType(commands, 'fill')).toHaveLength(1);
    expect(commandsOfType(commands, 'stroke')).toHaveLength(2);
    expect(commands).toContainEqual({ type: 'fillText', text: '\uD83D\uDD2E', x: 308, y: 96, maxWidth: undefined });
  });

  it('drawPredictionTrail renders a dashed bezier with a labeled confidence percentage', () => {
    const ctx = createRecordedContext();
    drawPredictionTrail(ctx, 220, 160, 'Will likely run tests next', 0.72);
    const commands = ctx.getRecordedCommands();
    // The bezier endpoint and label position are the observable prediction-trail contract.
    expect(commandsOfType(commands, 'moveTo')[0]).toEqual({ type: 'moveTo', x: 220, y: 160 });
    expect(commandsOfType(commands, 'quadraticCurveTo')[0]).toEqual({
      type: 'quadraticCurveTo',
      cpx: 300,
      cpy: 184,
      x: 360,
      y: 258
    });
    expect(commands).toContainEqual({ type: 'setLineDash', segments: [7, 6] });
    expect(commands).toContainEqual({
      type: 'fillText',
      text: 'Will likely run tests next (72%)',
      x: 372,
      y: 256,
      maxWidth: undefined
    });
  });

  it('drawAgentNode renders node labels and tool counts at stable node-relative positions', () => {
    const ctx = createRecordedContext();
    drawAgentNode(
      ctx,
      { id: 'agent-1', label: 'Implementer', state: 'thinking', toolCount: 3, x: 140, y: 90, vx: 0, vy: 0 },
      5000,
      'high'
    );

    const commands = ctx.getRecordedCommands();
    // Label assertions protect the user-visible canvas semantics that snapshots can obscure.
    expect(commands).toContainEqual({ type: 'fillText', text: 'Implementer', x: 140, y: 86, maxWidth: undefined });
    expect(commands).toContainEqual({ type: 'fillText', text: '3 tools', x: 140, y: 100, maxWidth: undefined });
    expect(commands.some((command) => command.type === 'setProperty' && command.property === 'shadowBlur')).toBe(true);
    expect(commandsOfType(commands, 'fill')).toHaveLength(1);
    expect(commandsOfType(commands, 'stroke')).toHaveLength(1);
  });
});
