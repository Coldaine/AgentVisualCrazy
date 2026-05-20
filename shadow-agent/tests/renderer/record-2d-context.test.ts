import { describe, expect, it } from 'vitest';
import { createRecorded2DContext, getRecordedCommands } from '../helpers/record-2d-context';

describe('record-2d-context', () => {
  it('restores stroke style after save/restore', () => {
    const ctx = createRecorded2DContext();
    ctx.strokeStyle = '#66ccff';
    ctx.save();
    ctx.strokeStyle = '#ff5566';
    ctx.restore();

    expect(ctx.strokeStyle).toBe('#66ccff');
    expect(getRecordedCommands(ctx).filter((c) => c.type === 'save')).toHaveLength(1);
    expect(getRecordedCommands(ctx).filter((c) => c.type === 'restore')).toHaveLength(1);
  });

  it('records gradient stroke assignments', () => {
    const ctx = createRecorded2DContext();
    const gradient = ctx.createLinearGradient(0, 0, 1, 1);
    ctx.strokeStyle = gradient;

    expect(getRecordedCommands(ctx)).toContainEqual({
      type: 'strokeStyle',
      value: '[CanvasGradient|CanvasPattern]'
    });
  });
});
