import { readFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { FileReplayStore } from '../src/persistence';
import type { CanonicalEvent } from '../src/shared/schema';

function makeEvent(
  overrides: Partial<CanonicalEvent> & Pick<CanonicalEvent, 'id' | 'sessionId' | 'timestamp' | 'kind'>
): CanonicalEvent {
  return {
    source: 'claude-hook',
    actor: 'agent',
    payload: {},
    ...overrides
  };
}

describe('FileReplayStore', () => {
  it('persists canonical events and reloads them from disk', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'shadow-agent-persistence-'));
    const store = new FileReplayStore(rootDir);
    const sessionId = 'payment-refactor';
    const events = [
      makeEvent({
        id: 'evt-1',
        sessionId,
        timestamp: '2026-03-26T10:00:00.000Z',
        kind: 'session_started',
        actor: 'system',
        payload: { cwd: 'D:/workspace' }
      }),
      makeEvent({
        id: 'evt-2',
        sessionId,
        timestamp: '2026-03-26T10:05:00.000Z',
        kind: 'message',
        payload: { text: 'Working through the payment gateway refactor.' }
      })
    ];

    const record = await store.saveSession(sessionId, events, 'Payment refactor');
    const loaded = await store.loadSession(sessionId);
    const rawEvents = await readFile(join(rootDir, 'sessions', encodeURIComponent(sessionId), 'events.jsonl'), 'utf8');

    expect(record).toMatchObject({
      sessionId,
      title: 'Payment refactor',
      startedAt: '2026-03-26T10:00:00.000Z',
      updatedAt: '2026-03-26T10:05:00.000Z',
      eventCount: 2
    });
    expect(loaded.record).toEqual(record);
    expect(loaded.events).toEqual(events);
    expect(rawEvents.trim().split(/\r?\n/)).toHaveLength(2);
  });

  it('appends events and lists sessions in updated order', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'shadow-agent-persistence-'));
    const store = new FileReplayStore(rootDir);

    await store.saveSession('session-a', [
      makeEvent({
        id: 'a-1',
        sessionId: 'session-a',
        timestamp: '2026-03-26T09:00:00.000Z',
        kind: 'session_started',
        actor: 'system'
      })
    ], 'Session A');

    await store.appendEvent('session-a', makeEvent({
      id: 'a-2',
      sessionId: 'session-a',
      timestamp: '2026-03-26T09:15:00.000Z',
      kind: 'tool_completed',
      payload: { toolName: 'Read' }
    }));

    await store.saveSession('session-b', [
      makeEvent({
        id: 'b-1',
        sessionId: 'session-b',
        timestamp: '2026-03-26T11:00:00.000Z',
        kind: 'session_started',
        actor: 'system'
      })
    ], 'Session B');

    const sessions = await store.listSessions();
    const sessionA = sessions.find((session) => session.sessionId === 'session-a');
    const sessionB = sessions.find((session) => session.sessionId === 'session-b');
    const sessionAEvents = await store.loadEvents('session-a');

    expect(sessionAEvents).toHaveLength(2);
    expect(sessionA?.eventCount).toBe(2);
    expect(sessionB?.eventCount).toBe(1);
    expect(sessions[0].sessionId).toBe('session-b');
    expect(sessions[1].sessionId).toBe('session-a');
  });
});
