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
  STATE_COLORS,
  type RiskLevel,
  type SimulationEdge,
  type SimulationNode
} from './types';
import { drawGrid, drawRiskVignette } from './draw-background';
import { drawEdge, drawParticles } from './draw-edges';
import { drawAgentNode, drawShadowNode, drawPredictionTrail } from './draw-nodes';
import { applyBloom, BLOOM_CONFIGS } from './bloom';
import type { BloomConfig } from './bloom';

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
    bloom: boolean;
  }>({
    tier: qualityStateRef.current.tier,
    reason: qualityStateRef.current.lastChangeReason,
    particleMode: particleEngineRef.current.mode,
    bloom: BLOOM_CONFIGS[qualityStateRef.current.tier].enabled
  });

  const getBloomConfig = useCallback((): BloomConfig => {
    return BLOOM_CONFIGS[qualityStateRef.current.tier];
  }, []);

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
        particleMode: particleEngineRef.current.mode,
        bloom: BLOOM_CONFIGS[nextState.tier].enabled
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
      drawGrid(ctx, viewport.width, viewport.height, profile.gridStep, time);
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

    const bloomConfig = getBloomConfig();
    if (bloomConfig.enabled) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      applyBloom(ctx, canvas.width, canvas.height, bloomConfig);
    }

    animationFrameRef.current = requestAnimationFrame(draw);
  }, [applyQualityState, collectMetrics, getBloomConfig]);

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
        Auto {runtimeHud.tier} • {runtimeHud.particleMode}{runtimeHud.bloom ? ' • bloom' : ''}
      </div>
    </div>
  );
}
