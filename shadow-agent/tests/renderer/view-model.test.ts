import { describe, expect, it } from 'vitest';
import type { AgentNode } from '../../src/shared/schema';
import { getGraphLayoutAdapter } from '../../src/renderer/graph-layout-adapter';
import { buildGraphLayout, formatClock, safeFileName, toLabel } from '../../src/renderer/view-model';

describe('renderer view-model helpers', () => {
  it('falls back to the original value for invalid clock timestamps', () => {
    expect(formatClock('not-a-date')).toBe('not-a-date');
  });

  it('normalizes labels and filenames', () => {
    expect(toLabel('tool_failed')).toBe('Tool Failed');
    expect(safeFileName(' Payment Refactor Session @ 2026! ')).toBe('payment-refactor-session-2026');
  });

  it('builds node layout and parent-child edges deterministically', () => {
    const graphLayoutAdapter = getGraphLayoutAdapter();
    const nodes: AgentNode[] = [
      { id: 'root', label: 'Root', state: 'active', toolCount: 3 },
      { id: 'child', label: 'Child', state: 'idle', toolCount: 1, parentId: 'root' },
      { id: 'leaf', label: 'Leaf', state: 'completed', toolCount: 0, parentId: 'child' }
    ];

    const layout = graphLayoutAdapter.build(nodes);
    const root = layout.nodes.find((node) => node.id === 'root');
    const child = layout.nodes.find((node) => node.id === 'child');
    const leaf = layout.nodes.find((node) => node.id === 'leaf');

    expect(layout.edges).toEqual(
      expect.arrayContaining([
        { from: 'root', to: 'child' },
        { from: 'child', to: 'leaf' }
      ])
    );
    expect(root?.depth).toBe(0);
    expect(child?.depth).toBe(1);
    expect(leaf?.depth).toBe(2);
    expect(layout.width).toBeGreaterThanOrEqual(760);
    expect(layout.height).toBeGreaterThanOrEqual(300);
  });

  it('handles cyclic parent references without recursion overflow', () => {
    const graphLayoutAdapter = getGraphLayoutAdapter();
    const cyclicNodes: AgentNode[] = [
      { id: 'a', label: 'A', state: 'active', toolCount: 1, parentId: 'b' },
      { id: 'b', label: 'B', state: 'idle', toolCount: 1, parentId: 'a' }
    ];

    const layout = graphLayoutAdapter.build(cyclicNodes);
    expect(layout.nodes).toHaveLength(2);
    expect(layout.edges).toEqual(
      expect.arrayContaining([
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' }
      ])
    );
  });

  it('keeps a stable adapter boundary around the current graph implementation', () => {
    const graphLayoutAdapter = getGraphLayoutAdapter();
    const nodes: AgentNode[] = [{ id: 'root', label: 'Root', state: 'active', toolCount: 0 }];

    expect(graphLayoutAdapter.id).toBe('layered-graph-layout');
    expect(graphLayoutAdapter.build(nodes)).toEqual(buildGraphLayout(nodes));
  });
});
