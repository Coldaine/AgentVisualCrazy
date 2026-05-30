import { describe, expect, it } from 'vitest';
import { createRecordedContext, getUnimplementedMethods } from '../helpers/record-2d-context';

describe('record-2d-context', () => {
  it('records and retrieves save commands', () => {
    const ctx = createRecordedContext();
    ctx.save();
    ctx.save();
    const commands = ctx.getRecordedCommands();
    expect(commands.filter((c) => c.type === 'save')).toHaveLength(2);
  });

  it('records and retrieves restore commands', () => {
    const ctx = createRecordedContext();
    ctx.restore();
    const commands = ctx.getRecordedCommands();
    expect(commands.filter((c) => c.type === 'restore')).toHaveLength(1);
  });

  it('records save/restore pairs in order', () => {
    const ctx = createRecordedContext();
    ctx.save();
    ctx.restore();
    ctx.save();
    ctx.restore();
    const commands = ctx.getRecordedCommands();
    expect(commands.map((c) => c.type)).toEqual(['save', 'restore', 'save', 'restore']);
  });

  it('records beginPath', () => {
    const ctx = createRecordedContext();
    ctx.beginPath();
    const commands = ctx.getRecordedCommands();
    expect(commands).toContainEqual({ type: 'beginPath' });
  });

  it('records closePath', () => {
    const ctx = createRecordedContext();
    ctx.closePath();
    const commands = ctx.getRecordedCommands();
    expect(commands).toContainEqual({ type: 'closePath' });
  });

  it('records moveTo', () => {
    const ctx = createRecordedContext();
    ctx.moveTo(100, 200);
    const commands = ctx.getRecordedCommands();
    expect(commands).toContainEqual({ type: 'moveTo', x: 100, y: 200 });
  });

  it('records lineTo', () => {
    const ctx = createRecordedContext();
    ctx.lineTo(50, 75);
    const commands = ctx.getRecordedCommands();
    expect(commands).toContainEqual({ type: 'lineTo', x: 50, y: 75 });
  });

  it('records quadraticCurveTo', () => {
    const ctx = createRecordedContext();
    ctx.quadraticCurveTo(10, 20, 30, 40);
    const commands = ctx.getRecordedCommands();
    expect(commands).toContainEqual({ type: 'quadraticCurveTo', cpx: 10, cpy: 20, x: 30, y: 40 });
  });

  it('records arc', () => {
    const ctx = createRecordedContext();
    ctx.arc(50, 60, 10, 0, Math.PI * 2);
    const commands = ctx.getRecordedCommands();
    expect(commands).toContainEqual({ type: 'arc', x: 50, y: 60, radius: 10, startAngle: 0, endAngle: Math.PI * 2, counterclockwise: false });
  });

  it('records arc with counterclockwise', () => {
    const ctx = createRecordedContext();
    ctx.arc(5, 5, 3, 0, Math.PI, true);
    const commands = ctx.getRecordedCommands();
    expect(commands).toContainEqual({ type: 'arc', x: 5, y: 5, radius: 3, startAngle: 0, endAngle: Math.PI, counterclockwise: true });
  });

  it('records fill', () => {
    const ctx = createRecordedContext();
    ctx.fill();
    const commands = ctx.getRecordedCommands();
    expect(commands).toContainEqual({ type: 'fill' });
  });

  it('records stroke', () => {
    const ctx = createRecordedContext();
    ctx.stroke();
    const commands = ctx.getRecordedCommands();
    expect(commands).toContainEqual({ type: 'stroke' });
  });

  it('records fillText', () => {
    const ctx = createRecordedContext();
    ctx.fillText('hello', 10, 20);
    const commands = ctx.getRecordedCommands();
    expect(commands).toContainEqual({ type: 'fillText', text: 'hello', x: 10, y: 20, maxWidth: undefined });
  });

  it('records fillText with maxWidth', () => {
    const ctx = createRecordedContext();
    ctx.fillText('hello', 10, 20, 100);
    const commands = ctx.getRecordedCommands();
    expect(commands).toContainEqual({ type: 'fillText', text: 'hello', x: 10, y: 20, maxWidth: 100 });
  });

  it('records setLineDash', () => {
    const ctx = createRecordedContext();
    ctx.setLineDash([6, 5]);
    const commands = ctx.getRecordedCommands();
    expect(commands).toContainEqual({ type: 'setLineDash', segments: [6, 5] });
  });

  it('records setTransform', () => {
    const ctx = createRecordedContext();
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    const commands = ctx.getRecordedCommands();
    expect(commands).toContainEqual({ type: 'setTransform', a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
  });

  it('records clearRect', () => {
    const ctx = createRecordedContext();
    ctx.clearRect(0, 0, 800, 600);
    const commands = ctx.getRecordedCommands();
    expect(commands).toContainEqual({ type: 'clearRect', x: 0, y: 0, width: 800, height: 600 });
  });

  it('records fillRect', () => {
    const ctx = createRecordedContext();
    ctx.fillRect(10, 10, 100, 50);
    const commands = ctx.getRecordedCommands();
    expect(commands).toContainEqual({ type: 'fillRect', x: 10, y: 10, width: 100, height: 50 });
  });

  it('records translate', () => {
    const ctx = createRecordedContext();
    ctx.translate(15, 25);
    const commands = ctx.getRecordedCommands();
    expect(commands).toContainEqual({ type: 'translate', x: 15, y: 25 });
  });

  it('records scale', () => {
    const ctx = createRecordedContext();
    ctx.scale(0.5, 0.5);
    const commands = ctx.getRecordedCommands();
    expect(commands).toContainEqual({ type: 'scale', x: 0.5, y: 0.5 });
  });

  it('records createLinearGradient and addColorStop', () => {
    const ctx = createRecordedContext();
    const gradient = ctx.createLinearGradient(0, 0, 100, 200);
    gradient.addColorStop(0, 'red');
    gradient.addColorStop(1, 'blue');
    const commands = ctx.getRecordedCommands();
    const linearCmds = commands.filter((c) => c.type === 'createLinearGradient');
    expect(linearCmds).toHaveLength(1);
    const linear = linearCmds[0];
    expect(linear).toMatchObject({
      type: 'createLinearGradient',
      x0: 0, y0: 0, x1: 100, y1: 200
    });
    expect(typeof linear.gradientId).toBe('number');
    const stopCmds = commands.filter((c) => c.type === 'addColorStop');
    expect(stopCmds).toHaveLength(2);
    expect(stopCmds[0]).toMatchObject({ offset: 0, color: 'red' });
    expect(stopCmds[1]).toMatchObject({ offset: 1, color: 'blue' });
  });

  it('records createRadialGradient and addColorStop', () => {
    const ctx = createRecordedContext();
    const gradient = ctx.createRadialGradient(50, 50, 0, 50, 50, 100);
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(0.5, 'rgba(0,0,0,0.5)');
    const commands = ctx.getRecordedCommands();
    const radialCmds = commands.filter((c) => c.type === 'createRadialGradient');
    expect(radialCmds).toHaveLength(1);
    const radial = radialCmds[0];
    expect(radial).toMatchObject({
      type: 'createRadialGradient',
      x0: 50, y0: 50, r0: 0, x1: 50, y1: 50, r1: 100
    });
    expect(typeof radial.gradientId).toBe('number');
    const stopCmds = commands.filter((c) => c.type === 'addColorStop');
    expect(stopCmds).toHaveLength(2);
  });

  it('records state property changes (fillStyle, strokeStyle, lineWidth)', () => {
    const ctx = createRecordedContext();
    ctx.fillStyle = 'red';
    ctx.strokeStyle = 'blue';
    ctx.lineWidth = 5;
    const commands = ctx.getRecordedCommands();
    expect(commands.filter((c) => c.type === 'setProperty' && c.property === 'fillStyle')).toHaveLength(1);
    expect(commands.filter((c) => c.type === 'setProperty' && c.property === 'strokeStyle')).toHaveLength(1);
    expect(commands.filter((c) => c.type === 'setProperty' && c.property === 'lineWidth')).toHaveLength(1);
  });

  it('records shadow property changes', () => {
    const ctx = createRecordedContext();
    ctx.shadowColor = '#66ccff';
    ctx.shadowBlur = 12;
    const commands = ctx.getRecordedCommands();
    expect(commands).toContainEqual({ type: 'setProperty', property: 'shadowColor', value: '#66ccff' });
    expect(commands).toContainEqual({ type: 'setProperty', property: 'shadowBlur', value: 12 });
  });

  it('records globalAlpha', () => {
    const ctx = createRecordedContext();
    ctx.globalAlpha = 0.5;
    const commands = ctx.getRecordedCommands();
    expect(commands).toContainEqual({ type: 'setProperty', property: 'globalAlpha', value: 0.5 });
  });

  it('records font, textAlign, textBaseline', () => {
    const ctx = createRecordedContext();
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const commands = ctx.getRecordedCommands();
    expect(commands).toContainEqual({ type: 'setProperty', property: 'font', value: 'bold 11px sans-serif' });
    expect(commands).toContainEqual({ type: 'setProperty', property: 'textAlign', value: 'center' });
    expect(commands).toContainEqual({ type: 'setProperty', property: 'textBaseline', value: 'middle' });
  });

  it('records lineDashOffset', () => {
    const ctx = createRecordedContext();
    ctx.lineDashOffset = 3;
    const commands = ctx.getRecordedCommands();
    expect(commands).toContainEqual({ type: 'setProperty', property: 'lineDashOffset', value: 3 });
  });

  it('clears recorded commands via clearRecordedCommands', () => {
    const ctx = createRecordedContext();
    ctx.save();
    ctx.fillRect(0, 0, 10, 10);
    expect(ctx.getRecordedCommands().length).toBeGreaterThan(0);
    ctx.clearRecordedCommands();
    expect(ctx.getRecordedCommands()).toHaveLength(0);
  });

  it('reports unimplemented methods through defensive snapshots', () => {
    const ctx = createRecordedContext();
    expect(() => {
      (ctx as unknown as { measureText(_text: string): void }).measureText('test');
    }).toThrow(/unimplemented method "measureText"/);

    // Mutating the returned array must not erase the registry used to diagnose missing canvas APIs.
    const snapshot = getUnimplementedMethods();
    expect(snapshot).toContain('measureText');
    snapshot.length = 0;
    expect(getUnimplementedMethods()).toContain('measureText');
  });

  it('records a typical production draw flow', () => {
    const ctx = createRecordedContext();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(10, 10);
    ctx.lineTo(100, 10);
    ctx.quadraticCurveTo(50, 50, 100, 100);
    ctx.strokeStyle = 'rgba(102, 204, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    const commands = ctx.getRecordedCommands();
    const types = commands.map((c) => c.type).join(', ');
    expect(types).toBe('save, beginPath, moveTo, lineTo, quadraticCurveTo, setProperty, setProperty, stroke, restore');
  });

  it('records a complete render frame sequence', () => {
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
    ctx.strokeStyle = 'rgba(102, 204, 255, 0.55)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.shadowColor = '#66ccff';
    ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(5, 5, 16, 0.92)';
    ctx.fill();
    ctx.strokeStyle = '#66ccff';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('agent-1', 200, 196);
    ctx.restore();

    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(200, 200);
    ctx.lineTo(300, 150);
    ctx.stroke();
    ctx.restore();

    const commands = ctx.getRecordedCommands();
    expect(commands.length).toBeGreaterThan(0);

    const saveCount = commands.filter((c) => c.type === 'save').length;
    const restoreCount = commands.filter((c) => c.type === 'restore').length;
    expect(saveCount).toBe(restoreCount);
  });

  it('throws on calling an unimplemented method', () => {
    const ctx = createRecordedContext();
    expect(() => {
      (ctx as unknown as { resetTransform(): void }).resetTransform();
    }).toThrow(/unimplemented method "resetTransform"/);
  });

  it('throws on setting an unimplemented property', () => {
    const ctx = createRecordedContext();
    expect(() => {
      (ctx as unknown as { direction: string }).direction = 'ltr';
    }).toThrow(/unimplemented property "direction"/);
  });
});
