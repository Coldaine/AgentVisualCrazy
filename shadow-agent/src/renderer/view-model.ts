import type { AgentNode, ShadowInsight } from '../shared/schema';
import type { RiskLevel } from './canvas/types';

export interface GraphLayoutNode extends AgentNode {
  depth: number;
  x: number;
  y: number;
}

export interface GraphLayout {
  nodes: GraphLayoutNode[];
  edges: Array<{ from: string; to: string }>;
  width: number;
  height: number;
}

export function formatClock(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.valueOf())) {
    return timestamp;
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function toLabel(value: string): string {
  return value
    .split(/[_-]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function safeFileName(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'shadow-agent'
  );
}

export function buildGraphLayout(agentNodes: AgentNode[]): GraphLayout {
  const sorted = [...agentNodes].sort((a, b) => a.label.localeCompare(b.label));
  const map = new Map(sorted.map((node) => [node.id, node]));
  const depthCache = new Map<string, number>();
  const visiting = new Set<string>();
  const stateRank: Record<AgentNode['state'], number> = {
    active: 0,
    idle: 1,
    completed: 2
  };

  const getDepth = (node: AgentNode): number => {
    const cached = depthCache.get(node.id);
    if (cached !== undefined) {
      return cached;
    }
    if (visiting.has(node.id)) {
      return 0;
    }

    visiting.add(node.id);
    const parent = node.parentId ? map.get(node.parentId) : undefined;
    const depth = parent ? getDepth(parent) + 1 : 0;
    visiting.delete(node.id);
    depthCache.set(node.id, depth);
    return depth;
  };

  const levelMap = new Map<number, AgentNode[]>();
  for (const node of sorted) {
    const depth = getDepth(node);
    const level = levelMap.get(depth) ?? [];
    level.push(node);
    levelMap.set(depth, level);
  }

  const depthEntries = [...levelMap.entries()].sort(([left], [right]) => left - right);
  const nodes: GraphLayoutNode[] = [];
  const xSpacing = 260;
  const ySpacing = 118;
  const maxDepth = depthEntries.reduce((max, [depth]) => Math.max(max, depth), 0);
  const maxCount = depthEntries.reduce((max, [, level]) => Math.max(max, level.length), 0);

  depthEntries.forEach(([depth, level]) => {
    level
      .sort((a, b) => {
        if (a.state !== b.state) {
          return (stateRank[a.state] ?? 99) - (stateRank[b.state] ?? 99);
        }
        return b.toolCount - a.toolCount || a.label.localeCompare(b.label);
      })
      .forEach((node, index) => {
        nodes.push({
          ...node,
          depth,
          x: 40 + depth * xSpacing,
          y: 40 + index * ySpacing
        });
      });
  });

  const edges = nodes
    .filter((node) => node.parentId && map.has(node.parentId))
    .map((node) => ({ from: node.parentId as string, to: node.id }));

  return {
    nodes,
    edges,
    width: Math.max(760, 80 + (maxDepth + 1) * xSpacing),
    height: Math.max(300, 120 + Math.max(1, maxCount) * ySpacing)
  };
}

// Lower rank = higher priority for the single insight the canvas surfaces.
const MODEL_INSIGHT_PRIORITY: Record<string, number> = {
  risk: 0,
  next_move: 1,
  phase: 2,
  objective: 3,
  summary: 4
};

/**
 * Selects the single insight the holographic canvas should surface as its
 * shadow node. Only MODEL-sourced insights are eligible — heuristic insights
 * are never rendered as model cognition (quarantine). Returns undefined when no
 * model insight exists, in which case the canvas draws no shadow node.
 */
export function pickPrimaryModelInsight(insights: ShadowInsight[]): ShadowInsight | undefined {
  const modelInsights = insights.filter((insight) => insight.source === 'model');
  if (modelInsights.length === 0) {
    return undefined;
  }
  return [...modelInsights].sort((a, b) => {
    const rankA = MODEL_INSIGHT_PRIORITY[a.kind] ?? 99;
    const rankB = MODEL_INSIGHT_PRIORITY[b.kind] ?? 99;
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return b.confidence - a.confidence;
  })[0];
}

/**
 * Maps the derived risk-signal list to a coarse RiskLevel for the canvas
 * vignette. Heuristic by signal count; the model's own riskLevel can refine
 * this later once richer risk payloads are wired through.
 */
export function deriveRiskLevel(riskSignals: string[]): RiskLevel {
  const count = riskSignals.length;
  if (count >= 4) return 'critical';
  if (count >= 2) return 'high';
  if (count === 1) return 'medium';
  return 'low';
}
