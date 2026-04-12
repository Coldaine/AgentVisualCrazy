import type { AgentNode } from '../shared/schema';

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
          return a.state === 'active' ? -1 : a.state === 'idle' ? 1 : 0;
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
