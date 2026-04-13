import { useEffect, useRef, useCallback } from 'react';
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import type { AgentNode } from '../../shared/schema';
import { SimulationNode, SimulationEdge, Particle, STATE_COLORS, NODE_RADIUS, COLLIDE_RADIUS } from './types';
import { colors } from '../theme/colors';

// Map schema AgentNode state → canvas AgentState
function mapState(state: AgentNode['state']): SimulationNode['state'] {
  if (state === 'completed') return 'complete';
  if (state === 'active') return 'thinking';
  return 'idle';
}

// Build initial simulation nodes from agent nodes
function buildNodes(agentNodes: AgentNode[]): SimulationNode[] {
  return agentNodes.map((n) => ({
    id: n.id,
    label: n.label,
    state: mapState(n.state),
    toolCount: n.toolCount,
    parentId: n.parentId,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
  }));
}

// Build edges from parent-child relationships
function buildEdges(nodes: SimulationNode[]): SimulationEdge[] {
  return nodes
    .filter((n) => n.parentId && nodes.some((p) => p.id === n.parentId))
    .map((n) => ({
      id: `${n.parentId}-${n.id}`,
      source: n.parentId as string,
      target: n.id,
      state: n.state,
    }));
}

// Draw a hexagon path at (cx, cy) with given radius
function hexagonPath(cx: number, cy: number, r: number): Path2D {
  const path = new Path2D();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
  return path;
}

// Draw a tapered bezier edge
function drawEdge(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number,
  tx: number, ty: number,
  color: string
) {
  const midX = (sx + tx) / 2;
  const midY = (sy + ty) / 2;
  const dx = tx - sx;
  const dy = ty - sy;
  const ctrlX = midX - dy * 0.2;
  const ctrlY = midY + dx * 0.2;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(ctrlX, ctrlY, tx, ty);

  const gradient = ctx.createLinearGradient(sx, sy, tx, ty);
  gradient.addColorStop(0, color.replace(')', ', 0.6)').replace('rgb', 'rgba'));
  gradient.addColorStop(1, color.replace(')', ', 0.15)').replace('rgb', 'rgba'));

  ctx.strokeStyle = gradient;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

// Draw agent node as hexagon with glow
function drawAgentNode(
  ctx: CanvasRenderingContext2D,
  node: SimulationNode,
  time: number
) {
  const { x, y, state, label, toolCount } = node;
  const color = STATE_COLORS[state];

  // Breathing/pulse for thinking state
  let radius = NODE_RADIUS;
  if (state === 'thinking') {
    const pulse = Math.sin(time * 0.003) * 4;
    radius += pulse;
  }

  // Outer glow
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = state === 'thinking' ? 24 : 14;

  // Hexagon body
  const hex = hexagonPath(x, y, radius);
  ctx.fillStyle = 'rgba(5, 5, 16, 0.9)';
  ctx.fill(hex);
  ctx.strokeStyle = color;
  ctx.lineWidth = state === 'thinking' ? 2.5 : 1.5;
  ctx.stroke();
  ctx.restore();

  // Label
  ctx.save();
  ctx.fillStyle = colors.textPrimary;
  ctx.font = 'bold 11px "Segoe UI Variable Text", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y - 4);
  ctx.fillStyle = colors.textSecondary;
  ctx.font = '9px system-ui';
  ctx.fillText(`${toolCount} tools`, x, y + 10);
  ctx.restore();
}

// Draw particles along edges
function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  nodes: Map<string, SimulationNode>
) {
  for (const p of particles) {
    const edge = edgesMap.get(p.edgeId);
    if (!edge) continue;
    const src = nodes.get(edge.source);
    const tgt = nodes.get(edge.target);
    if (!src || !tgt) continue;

    // Position along bezier curve
    const t = p.progress;
    const midX = (src.x + tgt.x) / 2;
    const midY = (src.y + tgt.y) / 2;
    const dx = tgt.x - src.x;
    const dy = tgt.y - src.y;
    const ctrlX = midX - dy * 0.2;
    const ctrlY = midY + dx * 0.2;

    const bx = (1-t)*(1-t)*src.x + 2*(1-t)*t*ctrlX + t*t*tgt.x;
    const by = (1-t)*(1-t)*src.y + 2*(1-t)*t*ctrlY + t*t*tgt.y;

    // Draw comet trail
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx, by, 3, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();
  }
}

interface CanvasRendererProps {
  agentNodes: AgentNode[];
}

// Module-level state shared with the animation loop
let nodes: SimulationNode[] = [];
let simEdges: SimulationEdge[] = [];
let sim: Simulation<SimulationNode, SimulationEdge> | null = null;
let particles: Particle[] = [];
let edgesMap: Map<string, SimulationEdge> = new Map();

export default function CanvasRenderer({ agentNodes }: CanvasRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const nodesRef = useRef(nodes);
  const simRef = useRef<Simulation<SimulationNode, SimulationEdge> | null>(null);

  const draw = useCallback((time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;

    // Clear with void color
    ctx.fillStyle = colors.void;
    ctx.fillRect(0, 0, width, height);

    // Draw subtle hex grid pattern
    ctx.save();
    ctx.strokeStyle = 'rgba(13, 13, 31, 0.8)';
    ctx.lineWidth = 0.5;
    const gridSize = 40;
    for (let gx = 0; gx < width; gx += gridSize) {
      for (let gy = 0; gy < height; gy += gridSize * 0.866) {
        const hex = hexagonPath(gx, gy, gridSize * 0.5);
        ctx.stroke(hex);
      }
    }
    ctx.restore();

    const nodeMap = new Map(nodesRef.current.map((n) => [n.id, n]));

    // Draw edges
    for (const edge of simEdges) {
      const src = nodeMap.get(edge.source);
      const tgt = nodeMap.get(edge.target);
      if (src && tgt) {
        drawEdge(ctx, src.x, src.y, tgt.x, tgt.y, STATE_COLORS[edge.state]);
      }
    }

    // Draw nodes
    for (const node of nodesRef.current) {
      drawAgentNode(ctx, node, time);
    }

    // Draw particles
    drawParticles(ctx, particles, nodeMap);

    // Update particles
    for (const p of particles) {
      p.progress += p.speed * 0.016;
      if (p.progress >= 1) p.progress = 0;
    }

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  // Sync nodes when agentNodes changes
  useEffect(() => {
    const newNodes = buildNodes(agentNodes);
    nodes = newNodes;
    nodesRef.current = newNodes;
    simEdges = buildEdges(newNodes);
    edgesMap = new Map(simEdges.map((e) => [e.id, e]));

    particles = newNodes.flatMap((node) => {
      const parentEdge = simEdges.find((e) => e.target === node.id);
      if (!parentEdge) return [];
      return [{
        id: `p-${node.id}`,
        edgeId: parentEdge.id,
        progress: Math.random(),
        speed: 0.08 + Math.random() * 0.04,
        trailLength: 20,
        color: STATE_COLORS[node.state],
        label: undefined,
      }];
    });

    if (!simRef.current && newNodes.length > 0) {
      sim = forceSimulation<SimulationNode>(newNodes)
        .force('charge', forceManyBody().strength(-300))
        .force('link', forceLink<SimulationNode, SimulationEdge>(simEdges).id((d) => d.id).distance(150))
        .force('center', forceCenter(400, 300))
        .force('collide', forceCollide(COLLIDE_RADIUS))
        .alphaDecay(0.02)
        .on('tick', () => {
          nodesRef.current = [...newNodes];
        });
      simRef.current = sim;
    } else if (simRef.current) {
      simRef.current.nodes(newNodes);
      const linkForce = simRef.current.force('link') as ReturnType<typeof forceLink>;
      if (linkForce) {
        (linkForce as any).links(simEdges);
      }
      simRef.current.alpha(0.3).restart();
    }
  }, [agentNodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    });
    ro.observe(canvas);

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}