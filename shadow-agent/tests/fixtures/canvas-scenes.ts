import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FROZEN_TIME,
  type CanonicalScene
} from '../../src/renderer/canvas/scene-drawer';
import type { SimulationEdge, SimulationNode, Particle } from '../../src/renderer/canvas/types';

function node(
  id: string,
  label: string,
  state: SimulationNode['state'],
  x: number,
  y: number,
  toolCount = 0,
  parentId?: string
): SimulationNode {
  return { id, label, state, toolCount, parentId, x, y, vx: 0, vy: 0 };
}

function edge(id: string, source: string, target: string, state: SimulationEdge['state']): SimulationEdge {
  return { id, source, target, state };
}

function particle(
  id: string,
  edgeId: string,
  progress: number,
  speed: number,
  color: string,
  opacity = 0.7,
  size = 2,
  trailLength = 18
): Particle {
  return { id, edgeId, progress, speed, trailLength, color, opacity, size };
}

export const idleGraphScene: CanonicalScene = {
  label: 'idle-graph',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  time: FROZEN_TIME,
  qualityTier: 'high',
  nodes: [
    node('root', 'Orchestrator', 'idle', 180, 180, 5),
    node('child-a', 'Reader', 'idle', 380, 120, 3, 'root'),
    node('child-b', 'Writer', 'idle', 380, 260, 7, 'root'),
  ],
  edges: [
    edge('root-child-a', 'root', 'child-a', 'idle'),
    edge('root-child-b', 'root', 'child-b', 'idle'),
  ],
  particles: [],
  riskLevel: 'low',
};

export const activeToolBurstScene: CanonicalScene = {
  label: 'active-tool-burst',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  time: FROZEN_TIME,
  qualityTier: 'high',
  nodes: [
    node('root', 'Agent', 'thinking', 200, 200, 12),
    node('child', 'Tool Exec', 'thinking', 420, 160, 4, 'root'),
  ],
  edges: [
    edge('root-child', 'root', 'child', 'thinking'),
  ],
  particles: [
    particle('p1', 'root-child', 0.3, 0.06, '#66ccff'),
    particle('p2', 'root-child', 0.6, 0.08, '#66ccff'),
    particle('p3', 'root-child', 0.85, 0.05, '#66ccff'),
    particle('p4', 'root-child', 0.15, 0.07, '#66ccff'),
    particle('p5', 'root-child', 0.45, 0.09, '#66ccff'),
    particle('p6', 'root-child', 0.72, 0.055, '#66ccff'),
  ],
  riskLevel: 'low',
};

export const riskOverlayScene: CanonicalScene = {
  label: 'risk-overlay',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  time: FROZEN_TIME,
  qualityTier: 'high',
  nodes: [
    node('root', 'Agent', 'thinking', 220, 180, 8),
    node('failing', 'Failing Tool', 'idle', 440, 220, 15, 'root'),
  ],
  edges: [
    edge('root-failing', 'root', 'failing', 'idle'),
  ],
  particles: [
    particle('p1', 'root-failing', 0.5, 0.06, '#66ccff'),
    particle('p2', 'root-failing', 0.25, 0.07, '#66ccff'),
    particle('p3', 'root-failing', 0.75, 0.05, '#66ccff'),
  ],
  riskLevel: 'high',
};

export const emptySessionScene: CanonicalScene = {
  label: 'empty-session',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  time: FROZEN_TIME,
  qualityTier: 'high',
  nodes: [],
  edges: [],
  particles: [],
  riskLevel: 'low',
};

export const denseSubgraphScene: CanonicalScene = {
  label: 'dense-subgraph',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  time: FROZEN_TIME,
  qualityTier: 'medium',
  nodes: [
    node('root', 'Root', 'thinking', 100, 200, 20),
    node('a1', 'Agent A', 'idle', 300, 80, 8, 'root'),
    node('a2', 'Agent B', 'complete', 300, 180, 12, 'root'),
    node('a3', 'Agent C', 'thinking', 300, 300, 5, 'root'),
    node('a4', 'Agent D', 'idle', 300, 400, 3, 'root'),
    node('b1', 'Sub A1', 'idle', 500, 40, 4, 'a1'),
    node('b2', 'Sub A2', 'complete', 500, 110, 6, 'a1'),
    node('b3', 'Sub B1', 'thinking', 500, 240, 9, 'a2'),
  ],
  edges: [
    edge('root-a1', 'root', 'a1', 'idle'),
    edge('root-a2', 'root', 'a2', 'complete'),
    edge('root-a3', 'root', 'a3', 'thinking'),
    edge('root-a4', 'root', 'a4', 'idle'),
    edge('a1-b1', 'a1', 'b1', 'idle'),
    edge('a1-b2', 'a1', 'b2', 'complete'),
    edge('a2-b3', 'a2', 'b3', 'thinking'),
  ],
  particles: [
    particle('p1', 'root-a3', 0.3, 0.06, '#66ccff'),
    particle('p2', 'root-a3', 0.65, 0.07, '#66ccff'),
    particle('p3', 'root-a3', 0.9, 0.05, '#66ccff'),
    particle('p4', 'a2-b3', 0.4, 0.08, '#66ccff'),
    particle('p5', 'a2-b3', 0.75, 0.06, '#66ccff'),
  ],
  riskLevel: 'medium',
};

export const glassPanelScene: CanonicalScene = {
  label: 'glass-panel-visible',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  time: FROZEN_TIME,
  qualityTier: 'ultra',
  nodes: [
    node('root', 'Main Agent', 'thinking', 200, 200, 18),
    node('sub', 'Subagent', 'thinking', 440, 150, 7, 'root'),
  ],
  edges: [
    edge('root-sub', 'root', 'sub', 'thinking'),
  ],
  particles: [
    particle('p1', 'root-sub', 0.22, 0.06, '#cc88ff'),
    particle('p2', 'root-sub', 0.48, 0.07, '#cc88ff'),
    particle('p3', 'root-sub', 0.73, 0.055, '#cc88ff'),
    particle('p4', 'root-sub', 0.91, 0.065, '#cc88ff'),
    particle('p5', 'root-sub', 0.12, 0.08, '#cc88ff'),
    particle('p6', 'root-sub', 0.37, 0.05, '#cc88ff'),
    particle('p7', 'root-sub', 0.58, 0.09, '#cc88ff'),
    particle('p8', 'root-sub', 0.82, 0.06, '#cc88ff'),
    particle('p9', 'root-sub', 0.33, 0.07, '#cc88ff'),
    particle('p10', 'root-sub', 0.67, 0.055, '#cc88ff'),
  ],
  riskLevel: 'low',
};

export const ALL_CANONICAL_SCENES: CanonicalScene[] = [
  idleGraphScene,
  activeToolBurstScene,
  riskOverlayScene,
  emptySessionScene,
  denseSubgraphScene,
  glassPanelScene,
];
