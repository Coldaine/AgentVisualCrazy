import type { AgentNode } from '../../shared/schema';

export type AgentState = 'idle' | 'thinking' | 'tool' | 'complete' | 'error' | 'paused' | 'subagent';

export interface SimulationNode {
  id: string;
  label: string;
  state: AgentState;
  toolCount: number;
  parentId?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface SimulationEdge {
  id: string;
  source: string;
  target: string;
  state: AgentState;
}

export interface Particle {
  id: string;
  edgeId: string;
  progress: number;
  speed: number;
  trailLength: number;
  color: string;
  label?: string;
}

export interface ToolCard {
  id: string;
  label: string;
  x: number;
  y: number;
  active: boolean;
}

export const STATE_COLORS: Record<AgentState, string> = {
  idle:     '#66ccff',
  thinking: '#66ccff',
  tool:     '#ffbb44',
  complete: '#66ffaa',
  error:    '#ff5566',
  paused:   '#888899',
  subagent: '#cc88ff',
};

export const NODE_RADIUS = 32;
export const COLLIDE_RADIUS = 60;