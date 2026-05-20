export function hexagonPath(cx: number, cy: number, radius: number): Path2D {
  const path = new Path2D();
  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI / 3) * index - Math.PI / 6;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    if (index === 0) {
      path.moveTo(x, y);
    } else {
      path.lineTo(x, y);
    }
  }
  path.closePath();
  return path;
}

export function toRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized
        .split('')
        .map((part) => `${part}${part}`)
        .join('')
    : normalized;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getQuadraticControlPoint(sx: number, sy: number, tx: number, ty: number) {
  const midX = (sx + tx) / 2;
  const midY = (sy + ty) / 2;
  const dx = tx - sx;
  const dy = ty - sy;
  return {
    x: midX - dy * 0.2,
    y: midY + dx * 0.2
  };
}

export function getQuadraticPoint(sx: number, sy: number, cx: number, cy: number, tx: number, ty: number, t: number) {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * sx + 2 * inverse * t * cx + t * t * tx,
    y: inverse * inverse * sy + 2 * inverse * t * cy + t * t * ty
  };
}
