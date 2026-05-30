import type { AgentNode } from '../shared/schema';
import { buildGraphLayout, type GraphLayout } from './view-model';

export interface GraphLayoutAdapter {
  readonly id: string;
  build(agentNodes: AgentNode[]): GraphLayout;
}

const layeredGraphLayoutAdapter: GraphLayoutAdapter = {
  id: 'layered-graph-layout',
  build: buildGraphLayout
};

export function getGraphLayoutAdapter(): GraphLayoutAdapter {
  return layeredGraphLayoutAdapter;
}
