import { getQualityProfile, type QualityTier } from './quality';
import {
  getQuadraticControlPoint,
  getQuadraticPoint
} from './draw-utils';
import type { Particle, SimulationEdge, SimulationNode } from './types';

const FLOATS_PER_PARTICLE = 7;

const VERTEX_SHADER_SOURCE = `
  attribute vec2 a_position;
  attribute vec4 a_color;
  attribute float a_size;
  varying vec4 v_color;

  void main() {
    v_color = a_color;
    gl_Position = vec4(a_position, 0.0, 1.0);
    gl_PointSize = a_size;
  }
`;

const FRAGMENT_SHADER_SOURCE = `
  precision mediump float;
  varying vec4 v_color;

  void main() {
    vec2 offset = gl_PointCoord - vec2(0.5);
    float alpha = smoothstep(0.5, 0.0, length(offset));
    gl_FragColor = vec4(v_color.rgb, v_color.a * alpha);
  }
`;

export type ParticleDrawMode = 'webgl' | 'canvas';

export interface ParticleVertexBufferInput {
  particles: Particle[];
  nodesById: Map<string, SimulationNode>;
  edgesById: Map<string, SimulationEdge>;
  qualityTier: QualityTier;
  width: number;
  height: number;
  dpr: number;
}

export interface ParticleVertexBuffer {
  data: Float32Array;
  count: number;
}

export interface WebglParticleDrawInput extends ParticleVertexBufferInput {
  clearOnly?: boolean;
}

export interface WebglParticleRenderer {
  readonly mode: 'webgl';
  resize(width: number, height: number, dpr: number): void;
  draw(input: WebglParticleDrawInput): boolean;
  clear(): void;
  destroy(): void;
}

type ParticleGl = WebGLRenderingContext | WebGL2RenderingContext;

function hexToRgb(color: string): [number, number, number] {
  const normalized = color.replace('#', '');
  const value = normalized.length === 3
    ? normalized
        .split('')
        .map((part) => `${part}${part}`)
        .join('')
    : normalized;

  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255
  ];
}

export function buildParticleVertexBuffer(input: ParticleVertexBufferInput): ParticleVertexBuffer {
  const profile = getQualityProfile(input.qualityTier);
  if (profile.particleMode === 'disabled' || input.width <= 0 || input.height <= 0) {
    return { data: new Float32Array(0), count: 0 };
  }

  const values: number[] = [];
  for (const particle of input.particles) {
    const edge = input.edgesById.get(particle.edgeId);
    if (!edge) {
      continue;
    }

    const source = input.nodesById.get(edge.source);
    const target = input.nodesById.get(edge.target);
    if (!source || !target) {
      continue;
    }

    const controlPoint = getQuadraticControlPoint(source.x, source.y, target.x, target.y);
    const head = getQuadraticPoint(
      source.x,
      source.y,
      controlPoint.x,
      controlPoint.y,
      target.x,
      target.y,
      particle.progress
    );
    const [red, green, blue] = hexToRgb(particle.color);
    const alpha = particle.opacity * profile.particleAlphaScale;
    const radius = Math.max(1.25, particle.size * profile.particleSizeScale) * input.dpr;
    const clipX = (head.x / input.width) * 2 - 1;
    const clipY = 1 - (head.y / input.height) * 2;

    values.push(clipX, clipY, red, green, blue, alpha, radius);
  }

  return {
    data: new Float32Array(values),
    count: values.length / FLOATS_PER_PARTICLE
  };
}

function createShader(gl: ParticleGl, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) {
    return null;
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function createProgram(gl: ParticleGl): WebGLProgram | null {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
  if (!vertexShader || !fragmentShader) {
    if (vertexShader) gl.deleteShader(vertexShader);
    if (fragmentShader) gl.deleteShader(fragmentShader);
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return null;
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  return program;
}

class GpuParticleRenderer implements WebglParticleRenderer {
  readonly mode = 'webgl' as const;
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: ParticleGl;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly positionLocation: number;
  private readonly colorLocation: number;
  private readonly sizeLocation: number;

  constructor(canvas: HTMLCanvasElement, gl: ParticleGl, program: WebGLProgram, buffer: WebGLBuffer) {
    this.canvas = canvas;
    this.gl = gl;
    this.program = program;
    this.buffer = buffer;
    this.positionLocation = gl.getAttribLocation(program, 'a_position');
    this.colorLocation = gl.getAttribLocation(program, 'a_color');
    this.sizeLocation = gl.getAttribLocation(program, 'a_size');

    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  }

  resize(width: number, height: number, dpr: number): void {
    const nextWidth = Math.max(1, Math.round(width * dpr));
    const nextHeight = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== nextWidth || this.canvas.height !== nextHeight) {
      this.canvas.width = nextWidth;
      this.canvas.height = nextHeight;
    }
    this.gl.viewport(0, 0, nextWidth, nextHeight);
  }

  clear(): void {
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  draw(input: WebglParticleDrawInput): boolean {
    this.resize(input.width, input.height, input.dpr);
    this.clear();
    if (input.clearOnly) {
      return true;
    }

    const vertexBuffer = buildParticleVertexBuffer(input);
    if (vertexBuffer.count === 0) {
      return true;
    }

    const stride = FLOATS_PER_PARTICLE * Float32Array.BYTES_PER_ELEMENT;
    this.gl.useProgram(this.program);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertexBuffer.data, this.gl.DYNAMIC_DRAW);

    this.gl.enableVertexAttribArray(this.positionLocation);
    this.gl.vertexAttribPointer(this.positionLocation, 2, this.gl.FLOAT, false, stride, 0);
    this.gl.enableVertexAttribArray(this.colorLocation);
    this.gl.vertexAttribPointer(this.colorLocation, 4, this.gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
    this.gl.enableVertexAttribArray(this.sizeLocation);
    this.gl.vertexAttribPointer(this.sizeLocation, 1, this.gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT);
    this.gl.drawArrays(this.gl.POINTS, 0, vertexBuffer.count);
    return true;
  }

  destroy(): void {
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
  }
}

export function createWebglParticleRenderer(canvas: HTMLCanvasElement): WebglParticleRenderer | null {
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: false })
    ?? canvas.getContext('webgl', { alpha: true, antialias: false });
  if (!gl) {
    return null;
  }

  const program = createProgram(gl);
  const buffer = gl.createBuffer();
  if (!program || !buffer) {
    if (program) gl.deleteProgram(program);
    if (buffer) gl.deleteBuffer(buffer);
    return null;
  }

  return new GpuParticleRenderer(canvas, gl, program, buffer);
}
