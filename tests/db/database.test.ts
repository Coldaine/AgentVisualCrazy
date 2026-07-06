import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { createDatabase, type ShadowDatabase } from '../../src/db/database';

let dbPath: string;
let cleanupDir: string;
let db: ShadowDatabase;

beforeAll(() => {
  cleanupDir = mkdtempSync(join(tmpdir(), 'shadow-agent-db-test-'));
  dbPath = join(cleanupDir, 'test.sqlite');
  db = createDatabase(dbPath);
});

afterAll(() => {
  db.close();
  rmSync(cleanupDir, { recursive: true, force: true });
});

describe('ShadowDatabase', () => {
  it('creates database file on disk', () => {
    expect(db).toBeDefined();
    expect(db.dbPath).toBe(dbPath);
  });

  it('saves and retrieves a session record', () => {
    const record = db.saveSession({
      sessionId: 'test-session-1',
      title: 'Test Session',
      startedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T01:00:00.000Z',
      source: 'replay',
      eventCount: 0,
    });
    expect(record.sessionId).toBe('test-session-1');

    const retrieved = db.getSession('test-session-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.title).toBe('Test Session');
  });

  it('returns null for missing session', () => {
    const result = db.getSession('nonexistent');
    expect(result).toBeNull();
  });

  it('inserts and retrieves events', () => {
    const events = [
      {
        id: 'evt-1',
        sessionId: 'test-session-1',
        source: 'claude-hook' as const,
        timestamp: '2026-01-01T00:00:00.000Z',
        actor: 'system',
        kind: 'session_started' as const,
        payload: { cwd: '/test' },
      },
      {
        id: 'evt-2',
        sessionId: 'test-session-1',
        source: 'claude-hook' as const,
        timestamp: '2026-01-01T00:05:00.000Z',
        actor: 'user',
        kind: 'message' as const,
        payload: { text: 'Hello' },
      },
    ];
    db.insertEvents(events);
    expect(db.getEventCount('test-session-1')).toBe(2);

    const retrieved = db.getEvents('test-session-1', 0, 10);
    expect(retrieved).toHaveLength(2);
    expect(retrieved[0].id).toBe('evt-1');
    expect(retrieved[1].payload.text).toBe('Hello');
  });

  it('lists sessions sorted by updated_at desc', () => {
    db.saveSession({
      sessionId: 'session-a',
      title: 'A',
      startedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      source: 'replay',
      eventCount: 5,
    });
    db.saveSession({
      sessionId: 'session-b',
      title: 'B',
      startedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-03T00:00:00.000Z',
      source: 'replay',
      eventCount: 10,
    });
    const sessions = db.listSessions(10);
    expect(sessions[0].sessionId).toBe('session-b');
    expect(sessions[0].eventCount).toBe(10);
  });

  it('inserts and retrieves interpretations', () => {
    db.insertInterpretations('test-session-1', [
      { kind: 'objective', source: 'model', confidence: 0.9, scope: 'session', summary: 'Test objective', evidenceEventIds: [] },
      { kind: 'risk', source: 'model', confidence: 0.7, scope: 'session', summary: 'Test risk', evidenceEventIds: [] },
    ]);
    const insights = db.getInterpretations('test-session-1');
    expect(insights).toHaveLength(2);
    expect(insights[0].summary).toBe('Test objective');
  });

  it('manages presentation state', () => {
    const empty = db.getPresentationState('test-session-1');
    expect(empty).toEqual({});

    db.setPresentationState('test-session-1', { focusMap: { node1: 'high' } });
    const state = db.getPresentationState('test-session-1');
    expect(state).toEqual({ focusMap: { node1: 'high' } });
  });

  it('appends and lists mutations', () => {
    db.appendMutation('test-session-1', { mutationType: 'set_focus', targetId: 'node-1', payload: { emphasis: 'high' } });
    db.appendMutation('test-session-1', { mutationType: 'hide_node', targetId: 'node-2', payload: {} });
    const mutations = db.getMutations('test-session-1');
    expect(mutations).toHaveLength(2);
    expect(mutations[0].mutationType).toBe('hide_node');
  });

  it('manages patterns', () => {
    const id = db.insertPattern({
      name: 'Test Pattern',
      origin: 'crafted',
      status: 'active',
      triggerJson: { toolBurstThreshold: 5 },
      visualJson: { viewName: 'timeline' },
      description: 'A test pattern',
    });
    const retrieved = db.getPatternById(id);
    expect(retrieved).not.toBeNull();
    expect((retrieved as Record<string, unknown>).name).toBe('Test Pattern');

    const active = db.getActivePatterns();
    expect(active.length).toBeGreaterThanOrEqual(1);
  });

  it('supports pattern application tracking', () => {
    const id = db.insertPattern({
      name: 'App Test', origin: 'crafted', status: 'active',
      triggerJson: {}, visualJson: {}, description: '',
    });
    db.recordPatternApplication(id, 'test-session-1', 'success');
    const outcome = db.getSeenPatternOutcome(id, 'test-session-1');
    expect(outcome).toBe('success');
  });

  it('deletes sessions and associated data', () => {
    db.saveSession({
      sessionId: 'delete-me', title: 'Delete', startedAt: '', updatedAt: '', source: 'replay', eventCount: 1,
    });
    db.insertEvents([{
      id: 'del-evt',
      sessionId: 'delete-me',
      source: 'replay', timestamp: '2026-01-01T00:00:00.000Z',
      actor: 'system', kind: 'session_started', payload: {},
    }]);
    expect(db.getSession('delete-me')).not.toBeNull();
    db.deleteSession('delete-me');
    expect(db.getSession('delete-me')).toBeNull();
    expect(db.getEventCount('delete-me')).toBe(0);
  });

  it('handles empty event retrieval gracefully', () => {
    expect(db.getEvents('empty-session', 0, 10)).toEqual([]);
    expect(db.getEventCount('empty-session')).toBe(0);
  });
});
