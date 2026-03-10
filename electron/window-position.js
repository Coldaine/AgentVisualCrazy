/**
 * Window Position Calculator
 *
 * Computes the (x, y) coordinates for the sidecar Electron window
 * based on the display work area and desired position preference.
 *
 * Extracted as a pure function for testability (no Electron dependency).
 */

/**
 * Compute window (x, y) position within a display work area.
 *
 * @param {{ x: number, y: number, width: number, height: number }} workArea
 * @param {number} winW - Window width in pixels
 * @param {number} winH - Window height in pixels
 * @param {'right'|'left'|'center'|string} [position='right'] - Desired position
 * @returns {{ x: number, y: number }}
 */
function computeWindowPosition(workArea, winW, winH, position) {
  const { x: areaX, y: areaY, width: areaW } = workArea;

  let x;
  if (position === 'left') {
    x = areaX;
  } else if (position === 'center') {
    x = Math.round(areaX + (areaW - winW) / 2);
  } else {
    // 'right' is the default for any unknown value
    x = areaX + areaW - winW;
  }

  return { x, y: areaY };
}

module.exports = { computeWindowPosition };
