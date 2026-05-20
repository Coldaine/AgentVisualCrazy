import '../helpers/path2d-polyfill';
import { describe, expect, it } from 'vitest';
import { drawScene } from '../../src/renderer/canvas/scene-drawer';
import { ALL_CANONICAL_SCENES } from '../fixtures/canvas-scenes';

function createRecordingContext() {
  const calls: Array<{ method: string; props: Record<string, unknown> }> = [];
  const props: Record<string, unknown> = {};
  let gradientId = 0;

  function record(method: string, args: Record<string, unknown> = {}) {
    calls.push({ method, props: { ...props, ...args } });
  }

  const ctx: Record<string, unknown> = {
    calls,
    snapshot: () => JSON.parse(JSON.stringify(calls)),

    save: () => record('save'),
    restore: () => record('restore'),
    beginPath: () => record('beginPath'),
    closePath: () => record('closePath'),

    clearRect(x: number, y: number, w: number, h: number) { record('clearRect', { x, y, w, h }); },
    fillRect(x: number, y: number, w: number, h: number) { record('fillRect', { x, y, w, h }); },
    moveTo(x: number, y: number) { record('moveTo', { x, y }); },
    lineTo(x: number, y: number) { record('lineTo', { x, y }); },
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) { record('quadraticCurveTo', { cpx, cpy, x, y }); },
    arc(x: number, y: number, radius: number, startAngle: number, endAngle: number) { record('arc', { x, y, radius, startAngle, endAngle }); },
    fill() { record('fill'); },
    stroke() { record('stroke'); },
    setLineDash(segments: number[]) { record('setLineDash', { segments: segments.map(String) }); },
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number) { record('setTransform', { a, b, c, d, e, f }); },
    fillText(text: string, x: number, y: number) { record('fillText', { text, x, y }); },

    createLinearGradient(x0: number, y0: number, x1: number, y1: number) {
      const id = ++gradientId;
      record('createLinearGradient', { x0, y0, x1, y1, gradientId: id });
      return { addColorStop: (offset: number, color: string) => record('addColorStop', { offset, color, gradientId: id }) };
    },

    createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) {
      const id = ++gradientId;
      record('createRadialGradient', { x0, y0, r0, x1, y1, r1, gradientId: id });
      return { addColorStop: (offset: number, color: string) => record('addColorStop', { offset, color, gradientId: id }) };
    },

    get fillStyle() { return props.fillStyle ?? ''; },
    set fillStyle(v) { props.fillStyle = String(v); },
    get strokeStyle() { return props.strokeStyle ?? ''; },
    set strokeStyle(v) { props.strokeStyle = String(v); },
    get lineWidth() { return props.lineWidth ?? 1; },
    set lineWidth(v) { props.lineWidth = v; },
    get shadowColor() { return props.shadowColor ?? ''; },
    set shadowColor(v) { props.shadowColor = v; },
    get shadowBlur() { return props.shadowBlur ?? 0; },
    set shadowBlur(v) { props.shadowBlur = v; },
    get font() { return props.font ?? ''; },
    set font(v) { props.font = v; },
    get textAlign() { return props.textAlign ?? 'start'; },
    set textAlign(v) { props.textAlign = v; },
    get textBaseline() { return props.textBaseline ?? 'alphabetic'; },
    set textBaseline(v) { props.textBaseline = v; },
    get globalAlpha() { return props.globalAlpha ?? 1; },
    set globalAlpha(v) { props.globalAlpha = v; },
    get globalCompositeOperation() { return props.globalCompositeOperation ?? 'source-over'; },
    set globalCompositeOperation(v) { props.globalCompositeOperation = v; },
    get canvas() { return null; },
  };

  return ctx as unknown as CanvasRenderingContext2D & { snapshot: () => unknown[] };
}

describe('canvas scene pixel snapshots', () => {
  it('recording context works', () => {
    const ctx = createRecordingContext();
    const calls = ctx.snapshot();
    expect(calls).toEqual([]);
  });

  for (const scene of ALL_CANONICAL_SCENES) {
    it(`matches the "${scene.label}" canonical scene`, () => {
      const ctx = createRecordingContext();
      drawScene(ctx, scene);
      const calls = ctx.snapshot();
      expect(calls).toMatchSnapshot(scene.label);
    });
  }
});