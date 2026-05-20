export type CanvasCommand =
  | { type: 'save' }
  | { type: 'restore' }
  | { type: 'beginPath' }
  | { type: 'closePath' }
  | { type: 'moveTo'; x: number; y: number }
  | { type: 'lineTo'; x: number; y: number }
  | { type: 'quadraticCurveTo'; cpx: number; cpy: number; x: number; y: number }
  | { type: 'arc'; x: number; y: number; radius: number; startAngle: number; endAngle: number; counterclockwise: boolean }
  | { type: 'fill' }
  | { type: 'stroke' }
  | { type: 'fillText'; text: string; x: number; y: number; maxWidth?: number }
  | { type: 'setLineDash'; segments: number[] }
  | { type: 'setTransform'; a: number; b: number; c: number; d: number; e: number; f: number }
  | { type: 'clearRect'; x: number; y: number; width: number; height: number }
  | { type: 'fillRect'; x: number; y: number; width: number; height: number }
  | { type: 'translate'; x: number; y: number }
  | { type: 'scale'; x: number; y: number }
  | { type: 'createLinearGradient'; x0: number; y0: number; x1: number; y1: number; gradientId: number }
  | { type: 'createRadialGradient'; x0: number; y0: number; r0: number; x1: number; y1: number; r1: number; gradientId: number }
  | { type: 'addColorStop'; gradientId: number; offset: number; color: string }
  | { type: 'setProperty'; property: string; value: unknown }
  | { type: 'getProperty'; property: string };

export interface RecordedGradient {
  id: number;
  type: 'linear' | 'radial';
  addColorStop(offset: number, color: string): void;
}

export interface RecordedContext {
  commands: CanvasCommand[];
  getRecordedCommands(): readonly CanvasCommand[];
  clearRecordedCommands(): void;
  canvas: Partial<HTMLCanvasElement>;
}

const UNIMPLEMENTED_METHODS = new Set<string>();

export function createRecordedContext(): CanvasRenderingContext2D & RecordedContext {
  let nextGradientId = 1;
  const commands: CanvasCommand[] = [];
  const state: Record<string, unknown> = {};

  const gradients = new Map<number, RecordedGradient>();

  function record(cmd: CanvasCommand): void {
    commands.push(cmd);
  }

  const knownProperties = [
    'fillStyle', 'strokeStyle', 'lineWidth', 'font', 'textAlign', 'textBaseline',
    'shadowColor', 'shadowBlur', 'globalAlpha', 'lineDashOffset', 'lineCap', 'lineJoin', 'miterLimit'
  ] as const;

  const ctx = new Proxy({} as CanvasRenderingContext2D & RecordedContext, {
    get(_target, prop: string | symbol) {
      if (typeof prop === 'symbol') {
        return undefined;
      }
      if (prop === 'commands') return commands;
      if (prop === 'getRecordedCommands') return () => commands;
      if (prop === 'clearRecordedCommands') return () => { commands.length = 0; };
      if (prop === 'canvas') return {};
      if (prop === 'save') return () => record({ type: 'save' });
      if (prop === 'restore') return () => record({ type: 'restore' });
      if (prop === 'beginPath') return () => record({ type: 'beginPath' });
      if (prop === 'closePath') return () => record({ type: 'closePath' });
      if (prop === 'fill') return () => record({ type: 'fill' });
      if (prop === 'stroke') return () => record({ type: 'stroke' });
      if (prop === 'moveTo') return (x: number, y: number) => record({ type: 'moveTo', x, y });
      if (prop === 'lineTo') return (x: number, y: number) => record({ type: 'lineTo', x, y });
      if (prop === 'quadraticCurveTo') return (cpx: number, cpy: number, x: number, y: number) => record({ type: 'quadraticCurveTo', cpx, cpy, x, y });
      if (prop === 'arc') return (x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise = false) => record({ type: 'arc', x, y, radius, startAngle, endAngle, counterclockwise });
      if (prop === 'fillText') return (text: string, x: number, y: number, maxWidth?: number) => record({ type: 'fillText', text, x, y, maxWidth });
      if (prop === 'setLineDash') return (segments: number[]) => record({ type: 'setLineDash', segments });
      if (prop === 'setTransform') return (a: number, b: number, c: number, d: number, e: number, f: number) => record({ type: 'setTransform', a, b, c, d, e, f });
      if (prop === 'clearRect') return (x: number, y: number, width: number, height: number) => record({ type: 'clearRect', x, y, width, height });
      if (prop === 'fillRect') return (x: number, y: number, width: number, height: number) => record({ type: 'fillRect', x, y, width, height });
      if (prop === 'translate') return (x: number, y: number) => record({ type: 'translate', x, y });
      if (prop === 'scale') return (x: number, y: number) => record({ type: 'scale', x, y });
      if (prop === 'createLinearGradient') {
        return (x0: number, y0: number, x1: number, y1: number) => {
          const gradientId = nextGradientId++;
          record({ type: 'createLinearGradient', x0, y0, x1, y1, gradientId });
          const gradient: RecordedGradient = {
            id: gradientId,
            type: 'linear',
            addColorStop(offset: number, color: string) {
              record({ type: 'addColorStop', gradientId, offset, color });
            }
          };
          gradients.set(gradientId, gradient);
          return gradient;
        };
      }
      if (prop === 'createRadialGradient') {
        return (x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) => {
          const gradientId = nextGradientId++;
          record({ type: 'createRadialGradient', x0, y0, r0, x1, y1, r1, gradientId });
          const gradient: RecordedGradient = {
            id: gradientId,
            type: 'radial',
            addColorStop(offset: number, color: string) {
              record({ type: 'addColorStop', gradientId, offset, color });
            }
          };
          gradients.set(gradientId, gradient);
          return gradient;
        };
      }
      if ((knownProperties as readonly string[]).includes(prop)) {
        return state[prop];
      }
      // Trap: mark as unimplemented and throw
      UNIMPLEMENTED_METHODS.add(prop);
      throw new Error(
        `record-2d-context: unimplemented method "${prop}" called. ` +
        `Arguments: []. Implement it in record-2d-context.ts`
      );
    },
    set(_target, prop: string | symbol, value: unknown) {
      if (typeof prop === 'symbol') {
        return false;
      }
      if (prop === 'commands') {
        throw new Error('record-2d-context: cannot directly set commands array');
      }
      if ((knownProperties as readonly string[]).includes(prop)) {
        record({ type: 'setProperty', property: prop, value });
        state[prop] = value;
        return true;
      }
      UNIMPLEMENTED_METHODS.add(prop);
      throw new Error(
        `record-2d-context: unimplemented property "${prop}" set. ` +
        `Implement it in record-2d-context.ts`
      );
    }
  });

  return ctx;
}

export function getUnimplementedMethods(): string[] {
  return [...UNIMPLEMENTED_METHODS];
}
