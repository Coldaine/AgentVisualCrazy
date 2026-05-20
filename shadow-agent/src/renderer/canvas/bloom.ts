export interface BloomConfig {
  enabled: boolean;
  threshold: number;
  strength: number;
  radius: number;
}

export const BLOOM_CONFIGS = {
  ultra: { enabled: true, threshold: 0.82, strength: 1.4, radius: 6 },
  high: { enabled: true, threshold: 0.86, strength: 1.0, radius: 4 },
  medium: { enabled: true, threshold: 0.9, strength: 0.6, radius: 3 },
  low: { enabled: false, threshold: 0, strength: 0, radius: 0 }
} as const satisfies Record<string, BloomConfig>;

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function applyBloom(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: BloomConfig
): void {
  if (!config.enabled || width === 0 || height === 0) {
    return;
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const brightData = new Uint8ClampedArray(data.length);
  const threshold = config.threshold * 255;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luma = luminance(r, g, b);

    if (luma > threshold) {
      const scale = config.strength * ((luma - threshold) / (255 - threshold));
      brightData[i] = Math.min(255, r * scale);
      brightData[i + 1] = Math.min(255, g * scale);
      brightData[i + 2] = Math.min(255, b * scale);
      brightData[i + 3] = data[i + 3];
    }
  }

  const brightImage = new ImageData(brightData, width, height);

  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const offCtx = offscreen.getContext('2d');
  if (!offCtx) {
    return;
  }
  offCtx.putImageData(brightImage, 0, 0);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.filter = `blur(${config.radius}px)`;
  ctx.drawImage(offscreen, 0, 0);
  ctx.filter = 'none';
  ctx.restore();
}
