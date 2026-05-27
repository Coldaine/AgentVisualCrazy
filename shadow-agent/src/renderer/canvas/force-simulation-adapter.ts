import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation
} from 'd3-force';
import type { SimulationEdge, SimulationNode } from './types';

type D3LinkForce = ReturnType<typeof forceLink<SimulationNode, SimulationEdge>>;
type D3CenterForce = ReturnType<typeof forceCenter<SimulationNode>>;

export interface GraphPhysicsSimulation {
  updateNodes(nodes: SimulationNode[]): void;
  updateLinks(edges: SimulationEdge[]): void;
  updateCenter(x: number, y: number): void;
  restart(alpha: number): void;
  stop(): void;
}

export interface GraphPhysicsSimulationOptions {
  nodes: SimulationNode[];
  edges: SimulationEdge[];
  width: number;
  height: number;
  collideRadius: number;
  onTick: () => void;
}

export interface GraphPhysicsAdapter {
  readonly id: string;
  createSimulation(options: GraphPhysicsSimulationOptions): GraphPhysicsSimulation;
}

class D3GraphPhysicsSimulation implements GraphPhysicsSimulation {
  private readonly simulation: Simulation<SimulationNode, SimulationEdge>;
  private readonly linkForce: D3LinkForce;
  private readonly centerForce: D3CenterForce;

  constructor(options: GraphPhysicsSimulationOptions) {
    this.linkForce = forceLink<SimulationNode, SimulationEdge>(options.edges)
      .id((node) => node.id)
      .distance(150);
    this.centerForce = forceCenter<SimulationNode>(options.width / 2, options.height / 2);
    this.simulation = forceSimulation<SimulationNode>(options.nodes)
      .force('charge', forceManyBody<SimulationNode>().strength(-300))
      .force('link', this.linkForce)
      .force('center', this.centerForce)
      .force('collide', forceCollide<SimulationNode>(options.collideRadius))
      .alphaDecay(0.02)
      .on('tick', options.onTick);
  }

  updateNodes(nodes: SimulationNode[]): void {
    this.simulation.nodes(nodes);
  }

  updateLinks(edges: SimulationEdge[]): void {
    this.linkForce.links(edges);
  }

  updateCenter(x: number, y: number): void {
    this.centerForce.x(x);
    this.centerForce.y(y);
  }

  restart(alpha: number): void {
    this.simulation.alpha(alpha).restart();
  }

  stop(): void {
    this.simulation.stop();
  }
}

const d3GraphPhysicsAdapter: GraphPhysicsAdapter = {
  id: 'd3-force-graph-physics',
  createSimulation(options) {
    return new D3GraphPhysicsSimulation(options);
  }
};

export function getGraphPhysicsAdapter(): GraphPhysicsAdapter {
  return d3GraphPhysicsAdapter;
}
