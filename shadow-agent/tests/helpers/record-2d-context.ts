type DrawStyle = string | CanvasGradient | CanvasPattern;

function styleToken(value: DrawStyle): string {
  return typeof value === 'string' ? value : '[CanvasGradient|CanvasPattern]';
}

export type RecordedCommand =
  | { type: 'fillStyle'; value: string }
  | { type: 'strokeStyle'; value: string }
  | { type: 'lineWidth'; value: number }
  | { type: 'fillRect'; x: number; y: number; w: number; h: number }
  | { type: 'stroke'; path?: string }
  | { type: 'save' }
  | { type: 'restore' };

export interface Recorded2DContext {
  commands: RecordedCommand[];
  canvas: { width: number; height: number };
}

interface DrawState {
  fillStyle: DrawStyle;
  strokeStyle: DrawStyle;
  lineWidth: number;
}

export function createRecorded2DContext(width = 800, height = 600): CanvasRenderingContext2D {
  const commands: RecordedCommand[] = [];
  const state: DrawState = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1 };
  const stack: DrawState[] = [];

  const recorder = {
    canvas: { width, height },
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(value: DrawStyle) {
      state.fillStyle = value;
      commands.push({ type: 'fillStyle', value: styleToken(value) });
    },
    get strokeStyle() {
      return state.strokeStyle;
    },
    set strokeStyle(value: DrawStyle) {
      state.strokeStyle = value;
      commands.push({ type: 'strokeStyle', value: styleToken(value) });
    },
    get lineWidth() {
      return state.lineWidth;
    },
    set lineWidth(value: number) {
      state.lineWidth = value;
      commands.push({ type: 'lineWidth', value });
    },
    fillRect(x: number, y: number, w: number, h: number) {
      commands.push({ type: 'fillRect', x, y, w, h });
    },
    stroke(path?: Path2D) {
      commands.push({ type: 'stroke', path: path ? 'path' : undefined });
    },
    save() {
      stack.push({ fillStyle: state.fillStyle, strokeStyle: state.strokeStyle, lineWidth: state.lineWidth });
      commands.push({ type: 'save' });
    },
    restore() {
      const previous = stack.pop();
      if (previous) {
        state.fillStyle = previous.fillStyle;
        state.strokeStyle = previous.strokeStyle;
        state.lineWidth = previous.lineWidth;
      }
      commands.push({ type: 'restore' });
    },
    setTransform() {
      /* no-op for command tests */
    },
    clearRect() {
      /* no-op */
    },
    createLinearGradient() {
      return { addColorStop: () => undefined } as CanvasGradient;
    },
    __commands: commands
  };

  return recorder as unknown as CanvasRenderingContext2D & { __commands: RecordedCommand[] };
}

export function getRecordedCommands(ctx: CanvasRenderingContext2D): RecordedCommand[] {
  return (ctx as CanvasRenderingContext2D & { __commands: RecordedCommand[] }).__commands;
}
