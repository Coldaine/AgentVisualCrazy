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

export function createRecorded2DContext(width = 800, height = 600): CanvasRenderingContext2D {
  const commands: RecordedCommand[] = [];
  const state = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1 };

  const recorder = {
    canvas: { width, height },
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(value: string) {
      state.fillStyle = value;
      commands.push({ type: 'fillStyle', value });
    },
    get strokeStyle() {
      return state.strokeStyle;
    },
    set strokeStyle(value: string) {
      state.strokeStyle = value;
      commands.push({ type: 'strokeStyle', value });
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
      commands.push({ type: 'save' });
    },
    restore() {
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
