import type { ShadowDatabase } from '../db/database';

export interface PresentationMutation {
  type: string;
  targetId: string;
  payload?: Record<string, unknown>;
}

export interface PresentationState {
  focusMap: Record<string, string>;
  collapsedGroups: string[];
  expandedGroups: string[];
  hiddenNodes: string[];
  annotations: Array<{
    id: string;
    position: { x: number; y: number };
    label: string;
  }>;
  activeView: string | null;
}

export function defaultPresentationState(): PresentationState {
  return {
    focusMap: {},
    collapsedGroups: [],
    expandedGroups: [],
    hiddenNodes: [],
    annotations: [],
    activeView: null,
  };
}

export function getPresentationState(
  db: ShadowDatabase,
  sessionId: string,
): PresentationState {
  const raw = db.getPresentationState(sessionId);
  if (Object.keys(raw).length === 0) return defaultPresentationState();
  return { ...defaultPresentationState(), ...raw } as PresentationState;
}

export function applyMutations(
  db: ShadowDatabase,
  sessionId: string,
  mutations: unknown[],
): PresentationState {
  const state = getPresentationState(db, sessionId);
  for (const mut of mutations) {
    const m = mut as PresentationMutation;
    switch (m.type) {
      case 'set_focus':
        state.focusMap[m.targetId] = (m.payload?.emphasis as string) ?? 'medium';
        break;
      case 'collapse_group': {
        const idx = state.expandedGroups.indexOf(m.targetId);
        if (idx >= 0) state.expandedGroups.splice(idx, 1);
        if (!state.collapsedGroups.includes(m.targetId)) {
          state.collapsedGroups.push(m.targetId);
        }
        break;
      }
      case 'expand_group': {
        const idx = state.collapsedGroups.indexOf(m.targetId);
        if (idx >= 0) state.collapsedGroups.splice(idx, 1);
        if (!state.expandedGroups.includes(m.targetId)) {
          state.expandedGroups.push(m.targetId);
        }
        break;
      }
      case 'pin_annotation':
        state.annotations.push({
          id: m.targetId,
          position: (m.payload?.position ?? { x: 0, y: 0 }) as { x: number; y: number },
          label: (m.payload?.label as string) ?? '',
        });
        break;
      case 'hide_node':
        if (!state.hiddenNodes.includes(m.targetId)) {
          state.hiddenNodes.push(m.targetId);
        }
        break;
      case 'show_node': {
        const hideIdx = state.hiddenNodes.indexOf(m.targetId);
        if (hideIdx >= 0) state.hiddenNodes.splice(hideIdx, 1);
        break;
      }
      case 'switch_view':
        state.activeView = m.targetId;
        break;
    }
    db.appendMutation(sessionId, {
      mutationType: m.type,
      targetId: m.targetId,
      payload: m.payload ?? {},
    });
  }
  db.setPresentationState(sessionId, state as unknown as Record<string, unknown>);
  return state;
}

export function resetPresentation(db: ShadowDatabase, sessionId: string): void {
  db.setPresentationState(sessionId, {});
}
