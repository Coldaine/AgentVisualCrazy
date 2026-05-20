import { describe, expect, it } from 'vitest';
import { colors } from '../../src/renderer/theme/colors';
import { createRecordedContext } from '../helpers/record-2d-context';
import { STATE_COLORS } from '../../src/renderer/canvas/types';

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
