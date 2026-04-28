import { useCallback, useEffect, useRef, useState } from 'react';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation
} from 'd3-force';
import type { AgentNode, ShadowInsight } from '../../shared/schema';
import { colors } from '../theme/colors';
import { createParticleEngine } from './particle-engine';
import type { ParticleSceneEdge } from './particle-engine-core';
import {
  createQualityController,
  getQualityProfile,
  sampleQualityController,
  type QualityChangeReason,
  type QualityControllerState,
  type QualityTier,
  type ResourceMetrics
} from './quality';
import {
  COLLIDE_RADIUS,
  NODE_RADIUS,
  RISK_COLORS,
  STATE_COLORS,
  type Particle,
  type RiskLevel,
  type SimulationEdge,
  type SimulationNode
} from './types';

// Map schema AgentNode state -> canvas AgentState.
function mapState(state: AgentNode['state']): SimulationNode['state'] {
  if (state === 'completed') return 'complete';
  if (state === 'active') return 'thinking';
  return 'idle';
}

function buildNodes(agentNodes: AgentNode[], previousNodes: SimulationNode[]): SimulationNode[] {
  const previousById = new Map(previousNodes.map((node) => [node.id, node]));
  return agentNodes.map((node, index) => {
    const previous = previousById.get(node.id);
    return {
      id: node.id,
      label: node.label,
      state: mapState(node.state),
      toolCount: node.toolCount,
      parentId: node.parentId,
      x: previous?.x ?? 240 + index * 12,
      y: previous?.y ?? 180 + index * 10,
      vx: previous?.vx ?? 0,
      vy: previous?.vy ?? 0
    };
  });
}

function buildEdges(nodes: SimulationNode[]): SimulationEdge[] {
  return nodes
    .filter((node) => node.parentId && nodes.some((parent) => parent.id === node.parentId))
    .map((node) => ({
      id: `${node.parentId}-${node.id}`,
      source: node.parentId as string,
      target: node.id,
      state: node.state
    }));
}

function hexagonPath(cx: number, cy: number, radius: number): Path2D {
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

function toRgba(hex: string, alpha: number): string {
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

function getQuadraticControlPoint(sx: number, sy: number, tx: number, ty: number) {
  const midX = (sx + tx) / 2;
  const midY = (sy + ty) / 2;
  const dx = tx - sx;
  const dy = ty - sy;
  return {
    x: midX - dy * 0.2,
    y: midY + dx * 0.2
  };
}

function getQuadraticPoint(sx: number, sy: number, cx: number, cy: number, tx: number, ty: number, t: number) {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * sx + 2 * inverse * t * cx + t * t * tx,
    y: inverse * inverse * sy + 2 * inverse * t * cy + t * t * ty
  };
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, gridStep: number) {
  ctx.save();
  ctx.strokeStyle = 'rgba(13, 13, 31, 0.72)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x < width + gridStep; x += gridStep) {
    for (let y = 0; y < height + gridStep; y += gridStep * 0.866) {
      ctx.stroke(hexagonPath(x, y, gridStep * 0.5));
    }
  }
  ctx.restore();
}

function drawEdge(
  ctx: CanvasRenderingContext2D,
  source: SimulationNode,
  target: SimulationNode,
  color: string,
  edgeWidthScale: number
) {
  const controlPoint = getQuadraticControlPoint(source.x, source.y, target.x, target.y);
  const gradient = ctx.createLinearGradient(source.x, source.y, target.x, target.y);
  gradient.addColorStop(0, toRgba(color, 0.55));
  gradient.addColorStop(1, toRgba(color, 0.12));

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(source.x, source.y);
  ctx.quadraticCurveTo(controlPoint.x, controlPoint.y, target.x, target.y);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 3 * edgeWidthScale;
  ctx.stroke();
  ctx.restore();
}

function drawAgentNode(
  ctx: CanvasRenderingContext2D,
  node: SimulationNode,
  time: number,
  qualityTier: QualityTier
) {
  const color = STATE_COLORS[node.state];
  const profile = getQualityProfile(qualityTier);
  const pulse = node.state === 'thinking' ? Math.sin(time * 0.0035) * 3.5 : 0;
  const radius = NODE_RADIUS + pulse;

  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = (node.state === 'thinking' ? 24 : 12) * profile.glowBlurScale;
  const hexagon = hexagonPath(node.x, node.y, radius);
  ctx.fillStyle = 'rgba(5, 5, 16, 0.92)';
  ctx.fill(hexagon);
  ctx.strokeStyle = color;
  ctx.lineWidth = (node.state === 'thinking' ? 2.6 : 1.6) * profile.edgeWidthScale;
  ctx.stroke(hexagon);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = colors.textPrimary;
  ctx.font = 'bold 11px "Segoe UI Variable Text", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(node.label, node.x, node.y - 4);
  ctx.fillStyle = colors.textSecondary;
  ctx.font = '9px system-ui';
  ctx.fillText(`${node.toolCount} tools`, node.x, node.y + 10);
  ctx.restore();
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  nodesById: Map<string, SimulationNode>,
  edgesById: Map<string, SimulationEdge>,
  qualityTier: QualityTier
) {
  const profile = getQualityProfile(qualityTier);
  if (profile.particleMode === 'disabled') {
    return;
  }

  for (const particle of particles) {
    const edge = edgesById.get(particle.edgeId);
    if (!edge) {
      continue;
    }
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source || !target) {
      continue;
    }

    const controlPoint = getQuadraticControlPoint(source.x, source.y, target.x, target.y);
    const head = getQuadraticPoint(source.x, source.y, controlPoint.x, controlPoint.y, target.x, target.y, particle.progress);
    const tailProgress = Math.max(0, particle.progress - particle.trailLength / 240);
    const tail = getQuadraticPoint(source.x, source.y, controlPoint.x, controlPoint.y, target.x, target.y, tailProgress);
    const alpha = particle.opacity * profile.particleAlphaScale;
    const radius = Math.max(1.25, particle.size * profile.particleSizeScale);
    const gradient = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);

    gradient.addColorStop(0, toRgba(particle.color, 0));
    gradient.addColorStop(1, toRgba(particle.color, alpha));

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(head.x, head.y);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = radius;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(head.x, head.y, radius + 0.75, 0, Math.PI * 2);
    ctx.fillStyle = toRgba(particle.color, Math.min(1, alpha + 0.12));
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 6 * profile.glowBlurScale;
    ctx.fill();
    ctx.restore();
  }
}

function drawRiskVignette(ctx: CanvasRenderingContext2D, width: number, height: number, riskLevel: RiskLevel) {
  if (riskLevel === 'low') {
    return;
  }

  const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height));
  gradient.addColorStop(0, 'transparent');
  gradient.addColorStop(1, toRgba(RISK_COLORS[riskLevel], riskLevel === 'critical' ? 0.2 : 0.13));

  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawShadowNode(ctx: CanvasRenderingContext2D, agentX: number, agentY: number, insight: ShadowInsight, time: number) {
  const x = agentX + 88;
  const y = agentY - 62;
  const pulse = insight.kind === 'risk' ? Math.sin(time * 0.004) * 2.4 : 0;
  const outline = toRgba(colors.stateSubagent, 0.62);

  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(agentX, agentY);
  ctx.lineTo(x, y);
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.shadowColor = outline;
  ctx.shadowBlur = 16;
  const hexagon = hexagonPath(x, y, NODE_RADIUS - 4 + pulse);
  ctx.fillStyle = 'rgba(5, 5, 16, 0.7)';
  ctx.fill(hexagon);
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.stroke(hexagon);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = colors.textPrimary;
  ctx.font = 'bold 13px "Segoe UI Emoji", "Segoe UI Variable Text", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🔮', x, y - 2);
  ctx.restore();
}

function drawPredictionTrail(ctx: CanvasRenderingContext2D, sourceX: number, sourceY: number, targetLabel: string, confidence: number) {
  const targetX = sourceX + 140;
  const targetY = sourceY + 98;
  const controlPoint = {
    x: sourceX + 80,
    y: sourceY + 24
  };

  ctx.save();
  ctx.setLineDash([7, 6]);
  ctx.beginPath();
  ctx.moveTo(sourceX, sourceY);
  ctx.quadraticCurveTo(controlPoint.x, controlPoint.y, targetX, targetY);
  ctx.strokeStyle = toRgba(colors.textPrimary, Math.max(0.28, confidence * 0.55));
  ctx.lineWidth = 1.7;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = colors.textPrimary;
  ctx.font = '10px "Segoe UI Variable Text", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${targetLabel} (${Math.round(confidence * 100)}%)`, targetX + 12, targetY - 2);
  ctx.restore();
}

function readDeviceMemory(): number | undefined {
  if (typeof navigator === 'undefined') {
    return undefined;
  }
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof deviceMemory === 'number' ? deviceMemory : undefined;
}

function readReducedMotionPreference(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function syncCanvasToDisplaySize(canvas: HTMLCanvasElement, profile: QualityControllerState['profile']) {
  const cssWidth = Math.max(1, canvas.clientWidth || canvas.offsetWidth || 1);
  const cssHeight = Math.max(1, canvas.clientHeight || canvas.offsetHeight || 1);
  const devicePixelRatio = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, profile.pixelRatioCap);
  const nextWidth = Math.max(1, Math.round(cssWidth * devicePixelRatio));
  const nextHeight = Math.max(1, Math.round(cssHeight * devicePixelRatio));

  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
  }

  return {
    width: cssWidth,
    height: cssHeight,
    dpr: devicePixelRatio
  };
}

export interface CanvasRendererProps {
  agentNodes: AgentNode[];
  riskLevel?: RiskLevel;
  latestInsight?: ShadowInsight;
}

export default function CanvasRenderer({ agentNodes, riskLevel, latestInsight }: CanvasRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>(0);
  const lastFrameRef = useRef<number | null>(null);
  const nodesRef = useRef<SimulationNode[]>([]);
  const edgesRef = useRef<SimulationEdge[]>([]);
  const edgesByIdRef = useRef<Map<string, SimulationEdge>>(new Map());
  const simulationRef = useRef<Simulation<SimulationNode, SimulationEdge> | null>(null);
  const riskLevelRef = useRef<RiskLevel | undefined>(riskLevel);
  const latestInsightRef = useRef<ShadowInsight | undefined>(latestInsight);
  const qualityStateRef = useRef<QualityControllerState>(
    createQualityController({
      nodeCount: 0,
      edgeCount: 0,
      particleCount: 0,
      pixelCount: 0,
      hardwareConcurrency: typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency,
      deviceMemoryGb: readDeviceMemory(),
      prefersReducedMotion: readReducedMotionPreference()
    })
  );
  const particleEngineRef = useRef(createParticleEngine({ initialTier: qualityStateRef.current.tier }));
  const reducedMotionRef = useRef(readReducedMotionPreference());
  const [runtimeHud, setRuntimeHud] = useState<{
    tier: QualityTier;
    reason: QualityChangeReason;
    particleMode: 'worker' | 'inline';
  }>({
    tier: qualityStateRef.current.tier,
    reason: qualityStateRef.current.lastChangeReason,
    particleMode: particleEngineRef.current.mode
  });

  const collectMetrics = useCallback((particleCount: number): ResourceMetrics => {
    const canvas = canvasRef.current;
    const profile = getQualityProfile(qualityStateRef.current.tier);
    const width = canvas?.clientWidth ?? 1280;
    const height = canvas?.clientHeight ?? 720;
    const dpr = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, profile.pixelRatioCap);

    return {
      nodeCount: nodesRef.current.length,
      edgeCount: edgesRef.current.length,
      particleCount,
      pixelCount: Math.round(width * height * dpr * dpr),
      hardwareConcurrency: typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency,
      deviceMemoryGb: readDeviceMemory(),
      prefersReducedMotion: reducedMotionRef.current
    };
  }, []);

  const applyQualityState = useCallback((nextState: QualityControllerState) => {
    const previousTier = qualityStateRef.current.tier;
    qualityStateRef.current = nextState;
    if (nextState.tier !== previousTier) {
      particleEngineRef.current.syncScene(
        edgesRef.current.map<ParticleSceneEdge>((edge) => ({ id: edge.id, state: edge.state })),
        nextState.tier
      );
      const canvas = canvasRef.current;
      if (canvas) {
        syncCanvasToDisplaySize(canvas, nextState.profile);
      }
      setRuntimeHud({
        tier: nextState.tier,
        reason: nextState.lastChangeReason,
        particleMode: particleEngineRef.current.mode
      });
    }
  }, []);

  const draw = useCallback((time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      animationFrameRef.current = requestAnimationFrame(draw);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      animationFrameRef.current = requestAnimationFrame(draw);
      return;
    }

    const frameDelta = lastFrameRef.current === null ? 16.7 : Math.max(8, Math.min(50, time - lastFrameRef.current));
    lastFrameRef.current = time;

    const particleEngine = particleEngineRef.current;
    particleEngine.step(frameDelta);
    const particleSnapshot = particleEngine.snapshot();
    const nextQualityState = sampleQualityController(
      qualityStateRef.current,
      frameDelta,
      collectMetrics(particleSnapshot.length)
    );
    applyQualityState(nextQualityState);
    const profile = qualityStateRef.current.profile;
    const viewport = syncCanvasToDisplaySize(canvas, profile);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    ctx.fillStyle = colors.void;
    ctx.fillRect(0, 0, viewport.width, viewport.height);

    if (profile.showGrid) {
      drawGrid(ctx, viewport.width, viewport.height, profile.gridStep);
    }

    const nodesById = new Map(nodesRef.current.map((node) => [node.id, node]));
    for (const edge of edgesRef.current) {
      const source = nodesById.get(edge.source);
      const target = nodesById.get(edge.target);
      if (source && target) {
        drawEdge(ctx, source, target, STATE_COLORS[edge.state], profile.edgeWidthScale);
      }
    }

    drawParticles(ctx, particleSnapshot, nodesById, edgesByIdRef.current, profile.tier);

    for (const node of nodesRef.current) {
      drawAgentNode(ctx, node, time, profile.tier);
    }

    if (profile.showRiskVignette && riskLevelRef.current) {
      drawRiskVignette(ctx, viewport.width, viewport.height, riskLevelRef.current);
    }

    if (latestInsightRef.current && nodesRef.current.length > 0) {
      const firstNode = nodesRef.current[0];
      if (profile.showShadowNode) {
        drawShadowNode(ctx, firstNode.x, firstNode.y, latestInsightRef.current, time);
      }
      if (profile.showPredictionTrail) {
        drawPredictionTrail(
          ctx,
          firstNode.x,
          firstNode.y,
          latestInsightRef.current.summary,
          latestInsightRef.current.confidence
        );
      }
    }

    animationFrameRef.current = requestAnimationFrame(draw);
  }, [applyQualityState, collectMetrics]);

  useEffect(() => {
    riskLevelRef.current = riskLevel;
  }, [riskLevel]);

  useEffect(() => {
    latestInsightRef.current = latestInsight;
  }, [latestInsight]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event: MediaQueryListEvent) => {
      reducedMotionRef.current = event.matches;
    };

    reducedMotionRef.current = mediaQuery.matches;
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    const previousNodes = nodesRef.current;
    const nextNodes = buildNodes(agentNodes, previousNodes);
    const nextEdges = buildEdges(nextNodes);
    nodesRef.current = nextNodes;
    edgesRef.current = nextEdges;
    edgesByIdRef.current = new Map(nextEdges.map((edge) => [edge.id, edge]));
    particleEngineRef.current.syncScene(
      nextEdges.map<ParticleSceneEdge>((edge) => ({ id: edge.id, state: edge.state })),
      qualityStateRef.current.tier
    );

    if (nextNodes.length === 0) {
      simulationRef.current?.stop();
      simulationRef.current = null;
      return;
    }

    const canvas = canvasRef.current;
    const width = canvas?.clientWidth ?? 960;
    const height = canvas?.clientHeight ?? 720;

    if (!simulationRef.current) {
      simulationRef.current = forceSimulation<SimulationNode>(nextNodes)
        .force('charge', forceManyBody().strength(-300))
        .force('link', forceLink<SimulationNode, SimulationEdge>(nextEdges).id((node) => node.id).distance(150))
        .force('center', forceCenter(width / 2, height / 2))
        .force('collide', forceCollide(COLLIDE_RADIUS))
        .alphaDecay(0.02)
        .on('tick', () => {
          nodesRef.current = [...nextNodes];
        });
      return;
    }

    simulationRef.current.nodes(nextNodes);
    const linkForce = simulationRef.current.force('link');
    if (linkForce) {
      (linkForce as ReturnType<typeof forceLink<SimulationNode, SimulationEdge>>).links(nextEdges);
    }
    simulationRef.current.alpha(0.35).restart();
  }, [agentNodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    syncCanvasToDisplaySize(canvas, qualityStateRef.current.profile);
    animationFrameRef.current = requestAnimationFrame(draw);

    const resizeObserver = new ResizeObserver(() => {
      const viewport = syncCanvasToDisplaySize(canvas, qualityStateRef.current.profile);
      const simulation = simulationRef.current;
      if (!simulation) {
        return;
      }
      const centerForce = simulation.force('center');
      if (centerForce) {
        (centerForce as ReturnType<typeof forceCenter>).x(viewport.width / 2);
        (centerForce as ReturnType<typeof forceCenter>).y(viewport.height / 2);
      }
    });

    resizeObserver.observe(canvas);

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      resizeObserver.disconnect();
      simulationRef.current?.stop();
      particleEngineRef.current.destroy();
    };
  }, [draw]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          pointerEvents: 'none',
          borderRadius: 999,
          border: '1px solid rgba(102, 204, 255, 0.28)',
          background: 'rgba(5, 5, 16, 0.62)',
          padding: '6px 10px',
          color: colors.textPrimary,
          font: '600 11px/1 "Segoe UI Variable Text", system-ui, sans-serif',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          backdropFilter: 'blur(12px)'
        }}
      >
        Auto {runtimeHud.tier} • {runtimeHud.particleMode}
      </div>
    </div>
  );
}
