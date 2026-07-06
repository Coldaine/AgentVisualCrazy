import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { createDatabase, type ShadowDatabase } from '../../src/db/database';
import {
  getPresentationState,
  applyMutations,
  resetPresentation,
  defaultPresentationState,
} from '../../src/presentation/presentation-state';

let db: ShadowDatabase;
let cleanupDir: string;

beforeAll(() => {
  cleanupDir = mkdtempSync(join(tmpdir(), 'shadow-agent-pres-test-'));
  db = createDatabase(join(cleanupDir, 'test.sqlite'));
  db.saveSession({
    sessionId: 'pres-session',
    title: 'Pres Test',
    startedAt: '', updatedAt: '',
    source: 'replay', eventCount: 0,
  });
});

afterAll(() => {
  db.close();
  rmSync(cleanupDir, { recursive: true, force: true });
});

describe('PresentationState', () => {
  it('returns default state for unknown session', () => {
    const state = getPresentationState(db, 'unknown');
    expect(state).toEqual(defaultPresentationState());
  });

  it('applies set_focus mutation', () => {
    const state = applyMutations(db, 'pres-session', [
      { type: 'set_focus', targetId: 'node-1', payload: { emphasis: 'high' } },
    ]);
    expect(state.focusMap['node-1']).toBe('high');
  });

  it('applies collapse and expand group mutations', () => {
    let state = applyMutations(db, 'pres-session', [
      { type: 'collapse_group', targetId: 'group-1', payload: {} },
    ]);
    expect(state.collapsedGroups).toContain('group-1');
    expect(state.expandedGroups).not.toContain('group-1');

    state = applyMutations(db, 'pres-session', [
      { type: 'expand_group', targetId: 'group-1', payload: {} },
    ]);
    expect(state.collapsedGroups).not.toContain('group-1');
    expect(state.expandedGroups).toContain('group-1');
  });

  it('applies pin_annotation mutation', () => {
    const state = applyMutations(db, 'pres-session', [
      {
        type: 'pin_annotation',
        targetId: 'ann-1',
        payload: { position: { x: 100, y: 200 }, label: 'Important' },
      },
    ]);
    expect(state.annotations).toHaveLength(1);
    expect(state.annotations[0].id).toBe('ann-1');
    expect(state.annotations[0].position.x).toBe(100);
    expect(state.annotations[0].label).toBe('Important');
  });

  it('applies hide and show node mutations', () => {
    let state = applyMutations(db, 'pres-session', [
      { type: 'hide_node', targetId: 'node-hidden', payload: {} },
    ]);
    expect(state.hiddenNodes).toContain('node-hidden');

    state = applyMutations(db, 'pres-session', [
      { type: 'show_node', targetId: 'node-hidden', payload: {} },
    ]);
    expect(state.hiddenNodes).not.toContain('node-hidden');
  });

  it('applies switch_view mutation', () => {
    const state = applyMutations(db, 'pres-session', [
      { type: 'switch_view', targetId: 'timeline-view', payload: {} },
    ]);
    expect(state.activeView).toBe('timeline-view');
  });

  it('persists mutations to database', () => {
    applyMutations(db, 'pres-session', [
      { type: 'set_focus', targetId: 'persist-node', payload: { emphasis: 'low' } },
    ]);
    const persisted = db.getPresentationState('pres-session');
    expect((persisted as Record<string, unknown>).focusMap).toBeDefined();
  });

  it('reset restores default state', () => {
    applyMutations(db, 'pres-session', [
      { type: 'set_focus', targetId: 'temp', payload: { emphasis: 'high' } },
    ]);
    resetPresentation(db, 'pres-session');
    const state = getPresentationState(db, 'pres-session');
    expect(state).toEqual(defaultPresentationState());
  });

  it('tracks mutations history in database', () => {
    const mutations = db.getMutations('pres-session');
    expect(mutations.length).toBeGreaterThan(0);
    expect(mutations.some((m) => m.mutationType === 'set_focus')).toBe(true);
  });
});
