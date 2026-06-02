import { describe, expect, it } from 'vitest';
import { createRecordedContext, getUnimplementedMethods } from '../helpers/record-2d-context';

describe('record-2d-context', () => {
  it('records renderer path commands in order with arguments intact', () => {
    const ctx = createRecordedContext();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(10, 20);
    ctx.lineTo(40, 20);
    ctx.quadraticCurveTo(50, 30, 60, 40);
    ctx.arc(60, 40, 8, 0, Math.PI, true);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // The helper must preserve draw order because canvas rendering tests inspect command flow.
    expect(ctx.getRecordedCommands()).toEqual([
      { type: 'save' },
      { type: 'beginPath' },
      { type: 'moveTo', x: 10, y: 20 },
      { type: 'lineTo', x: 40, y: 20 },
      { type: 'quadraticCurveTo', cpx: 50, cpy: 30, x: 60, y: 40 },
      {
        type: 'arc',
        x: 60,
        y: 40,
        radius: 8,
        startAngle: 0,
        endAngle: Math.PI,
        counterclockwise: true,
      },
      { type: 'closePath' },
      { type: 'stroke' },
      { type: 'restore' },
    ]);
  });

  it('records frame, transform, dash, and text commands used by renderer assertions', () => {
    const ctx = createRecordedContext();

    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, 960, 540);
    ctx.fillRect(4, 8, 32, 16);
    ctx.translate(12, 24);
    ctx.scale(0.5, 0.75);
    ctx.setLineDash([6, 5]);
    ctx.fillText('agent-1', 100, 120, 180);

    // This protects the composite helper surface that downstream draw tests rely on.
    expect(ctx.getRecordedCommands()).toEqual([
      { type: 'setTransform', a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 },
      { type: 'clearRect', x: 0, y: 0, width: 960, height: 540 },
      { type: 'fillRect', x: 4, y: 8, width: 32, height: 16 },
      { type: 'translate', x: 12, y: 24 },
      { type: 'scale', x: 0.5, y: 0.75 },
      { type: 'setLineDash', segments: [6, 5] },
      { type: 'fillText', text: 'agent-1', x: 100, y: 120, maxWidth: 180 },
    ]);
  });

  it('records gradients and links color stops to the created gradient id', () => {
    const ctx = createRecordedContext();

    const linear = ctx.createLinearGradient(0, 0, 100, 200);
    linear.addColorStop(0, 'red');
    linear.addColorStop(1, 'blue');
    const radial = ctx.createRadialGradient(50, 50, 0, 50, 50, 100);
    radial.addColorStop(0.25, 'transparent');

    // Gradient stop ownership is the behavior snapshots cannot infer from command counts alone.
    expect(ctx.getRecordedCommands()).toEqual([
      { type: 'createLinearGradient', x0: 0, y0: 0, x1: 100, y1: 200, gradientId: 1 },
      { type: 'addColorStop', gradientId: 1, offset: 0, color: 'red' },
      { type: 'addColorStop', gradientId: 1, offset: 1, color: 'blue' },
      { type: 'createRadialGradient', x0: 50, y0: 50, r0: 0, x1: 50, y1: 50, r1: 100, gradientId: 2 },
      { type: 'addColorStop', gradientId: 2, offset: 0.25, color: 'transparent' },
    ]);
  });

  it('records style state changes and returns the latest known property value', () => {
    const ctx = createRecordedContext();

    ctx.fillStyle = '#050510';
    ctx.strokeStyle = '#66ccff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#66ccff';
    ctx.shadowBlur = 12;
    ctx.globalAlpha = 0.5;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineDashOffset = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 4;

    // State reads matter because renderer code can branch after setting canvas properties.
    expect(ctx.fillStyle).toBe('#050510');
    expect(ctx.strokeStyle).toBe('#66ccff');
    expect(ctx.lineWidth).toBe(2);
    expect(ctx.getRecordedCommands()).toEqual([
      { type: 'setProperty', property: 'fillStyle', value: '#050510' },
      { type: 'setProperty', property: 'strokeStyle', value: '#66ccff' },
      { type: 'setProperty', property: 'lineWidth', value: 2 },
      { type: 'setProperty', property: 'shadowColor', value: '#66ccff' },
      { type: 'setProperty', property: 'shadowBlur', value: 12 },
      { type: 'setProperty', property: 'globalAlpha', value: 0.5 },
      { type: 'setProperty', property: 'font', value: 'bold 11px sans-serif' },
      { type: 'setProperty', property: 'textAlign', value: 'center' },
      { type: 'setProperty', property: 'textBaseline', value: 'middle' },
      { type: 'setProperty', property: 'lineDashOffset', value: 3 },
      { type: 'setProperty', property: 'lineCap', value: 'round' },
      { type: 'setProperty', property: 'lineJoin', value: 'round' },
      { type: 'setProperty', property: 'miterLimit', value: 4 },
    ]);
  });

  it('clears the command buffer without replacing the recorder contract', () => {
    const ctx = createRecordedContext();

    ctx.save();
    ctx.fillRect(0, 0, 10, 10);
    ctx.clearRecordedCommands();
    ctx.restore();

    // Downstream tests reuse contexts between phases, so clearing must be observable immediately.
    expect(ctx.getRecordedCommands()).toEqual([{ type: 'restore' }]);
  });

  it('records a balanced production-like render frame', () => {
    const ctx = createRecordedContext();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, 1920, 1080);
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, 960, 540);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(100, 200);
    ctx.lineTo(300, 200);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.fillText('agent-1', 200, 196);
    ctx.restore();

    const commands = ctx.getRecordedCommands();
    const saveCount = commands.filter((command) => command.type === 'save').length;
    const restoreCount = commands.filter((command) => command.type === 'restore').length;

    // Balanced save/restore catches helper regressions that would make snapshots misleading.
    expect(saveCount).toBe(restoreCount);
    expect(commands.map((command) => command.type)).toContain('fillText');
  });

  it('surfaces unimplemented APIs without letting diagnostics snapshots mutate the registry', () => {
    const ctx = createRecordedContext();

    expect(() => {
      (ctx as unknown as { measureText(_text: string): void }).measureText('test');
    }).toThrow(/unimplemented method "measureText"/);
    expect(() => {
      (ctx as unknown as { direction: string }).direction = 'ltr';
    }).toThrow(/unimplemented property "direction"/);

    const snapshot = getUnimplementedMethods();
    snapshot.length = 0;

    // Missing APIs should stay visible after a caller mutates its defensive snapshot.
    expect(getUnimplementedMethods()).toEqual(expect.arrayContaining(['measureText', 'direction']));
  });
});
