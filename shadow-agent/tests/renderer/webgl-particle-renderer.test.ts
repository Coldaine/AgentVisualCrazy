import { describe, expect, it } from 'vitest';
import {
  buildParticleVertexBuffer,
  createWebglParticleRenderer
} from '../../src/renderer/canvas/webgl-particle-renderer';
import type { SimulationEdge, SimulationNode, Particle } from '../../src/renderer/canvas/types';

const nodesById = new Map<string, SimulationNode>([
  ['source', { id: 'source', label: 'Source', state: 'thinking', toolCount: 1, x: 100, y: 120, vx: 0, vy: 0 }],
  ['target', { id: 'target', label: 'Target', state: 'complete', toolCount: 2, x: 300, y: 220, vx: 0, vy: 0 }]
]);

const edgesById = new Map<string, SimulationEdge>([
  ['source-target', { id: 'source-target', source: 'source', target: 'target', state: 'thinking' }]
]);

const particles: Particle[] = [
  {
    id: 'p1',
    edgeId: 'source-target',
    progress: 0.5,
    speed: 0.2,
    trailLength: 30,
    color: '#66ccff',
    opacity: 0.8,
    size: 4
  },
  {
    id: 'missing-edge',
    edgeId: 'missing',
    progress: 0.5,
    speed: 0.2,
    trailLength: 30,
    color: '#ff5566',
    opacity: 1,
    size: 6
  }
];

describe('webgl particle renderer', () => {
  it('builds a compact point-sprite vertex buffer for visible particles', () => {
    const buffer = buildParticleVertexBuffer({
      particles,
      nodesById,
      edgesById,
      qualityTier: 'high',
      width: 400,
      height: 300,
      dpr: 2
    });

    expect(buffer.count).toBe(1);
    expect(buffer.data).toHaveLength(7);
    expect(buffer.data[0]).toBeCloseTo(-0.05, 4);
    expect(buffer.data[1]).toBeCloseTo(-0.2667, 4);
    expect(buffer.data[2]).toBeCloseTo(0.4, 4);
    expect(buffer.data[3]).toBeCloseTo(0.8, 4);
    expect(buffer.data[4]).toBe(1);
    expect(buffer.data[5]).toBeCloseTo(0.72, 4);
    expect(buffer.data[6]).toBe(8);
  });

  it('returns an empty buffer when the selected tier disables particles', () => {
    const buffer = buildParticleVertexBuffer({
      particles,
      nodesById,
      edgesById,
      qualityTier: 'low',
      width: 400,
      height: 300,
      dpr: 1
    });

    expect(buffer.count).toBe(0);
    expect(buffer.data).toHaveLength(0);
  });

  it('does not create a renderer when WebGL is unavailable', () => {
    const canvas = {
      getContext: () => null
    } as unknown as HTMLCanvasElement;

    expect(createWebglParticleRenderer(canvas)).toBeNull();
  });
});
