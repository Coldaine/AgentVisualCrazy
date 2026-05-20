class Path2DPolyfill {
  private commands: Array<{ type: string; args: number[] }> = [];

  constructor(path?: Path2DPolyfill) {
    if (path) {
      this.commands = [...path.commands];
    }
  }

  moveTo(x: number, y: number): void {
    this.commands.push({ type: 'moveTo', args: [x, y] });
  }

  lineTo(x: number, y: number): void {
    this.commands.push({ type: 'lineTo', args: [x, y] });
  }

  closePath(): void {
    this.commands.push({ type: 'closePath', args: [] });
  }

  addPath(path: Path2DPolyfill): void {
    this.commands.push(...path.commands);
  }
}

if (typeof globalThis.Path2D === 'undefined') {
  (globalThis as unknown as Record<string, unknown>).Path2D = Path2DPolyfill;
}
