/**
 * Window Position Tests
 *
 * Tests for computeWindowPosition: places the Electron sidecar window
 * at the right, left, or center of the primary display work area.
 */

const { computeWindowPosition } = require('../../electron/window-position');

describe('computeWindowPosition', () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1080 };
  const winW = 720;
  const winH = 850;

  describe('right position (default)', () => {
    it('places window flush against the right edge', () => {
      const { x } = computeWindowPosition(workArea, winW, winH, 'right');
      expect(x).toBe(workArea.width - winW); // 1200
    });

    it('places window at top of work area', () => {
      const { y } = computeWindowPosition(workArea, winW, winH, 'right');
      expect(y).toBe(workArea.y);
    });

    it('respects non-zero work area x offset (e.g. secondary monitor)', () => {
      const offsetArea = { x: 1920, y: 0, width: 2560, height: 1440 };
      const { x } = computeWindowPosition(offsetArea, winW, winH, 'right');
      expect(x).toBe(offsetArea.x + offsetArea.width - winW);
    });
  });

  describe('left position', () => {
    it('places window flush against the left edge', () => {
      const { x } = computeWindowPosition(workArea, winW, winH, 'left');
      expect(x).toBe(workArea.x);
    });

    it('places window at top of work area', () => {
      const { y } = computeWindowPosition(workArea, winW, winH, 'left');
      expect(y).toBe(workArea.y);
    });
  });

  describe('center position', () => {
    it('centers the window horizontally', () => {
      const { x } = computeWindowPosition(workArea, winW, winH, 'center');
      expect(x).toBe(Math.round(workArea.x + (workArea.width - winW) / 2));
    });

    it('places window at top of work area', () => {
      const { y } = computeWindowPosition(workArea, winW, winH, 'center');
      expect(y).toBe(workArea.y);
    });
  });

  describe('defaults', () => {
    it('defaults to right when position is undefined', () => {
      const pos = computeWindowPosition(workArea, winW, winH, undefined);
      const right = computeWindowPosition(workArea, winW, winH, 'right');
      expect(pos).toEqual(right);
    });

    it('defaults to right for unknown position values', () => {
      const pos = computeWindowPosition(workArea, winW, winH, 'banana');
      const right = computeWindowPosition(workArea, winW, winH, 'right');
      expect(pos).toEqual(right);
    });
  });

  describe('window taller than work area', () => {
    it('clamps y to work area top when window height exceeds screen height', () => {
      const small = { x: 0, y: 0, width: 1920, height: 600 };
      const { y } = computeWindowPosition(small, winW, winH, 'right');
      expect(y).toBe(small.y);
    });
  });
});
