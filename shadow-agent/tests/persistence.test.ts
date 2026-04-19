import { readFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
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

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const rootDir = tempRoots.pop();
    if (rootDir) {
      rmSync(rootDir, { recursive: true, force: true });
    }
  }
});

describe('FileReplayStore', () => {
  it('persists canonical events and reloads them from disk', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'shadow-agent-persistence-'));
    tempRoots.push(rootDir);
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
        payload: { text: 'Working through the payment gateway refactor for dev@example.com in D:\\workspace.' }
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
    expect(loaded.events[1].payload).toEqual({
      text: 'Working through the payment gateway refactor for [redacted-email] in [redacted-path]'
    });
    expect(rawEvents.trim().split(/\r?\n/)).toHaveLength(2);
  });

  it('requires explicit opt-in before storing raw transcripts', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'shadow-agent-persistence-'));
    const store = new FileReplayStore(rootDir);

    await expect(
      store.saveSession(
        'raw-session',
        [
          makeEvent({
            id: 'evt-1',
            sessionId: 'raw-session',
            timestamp: '2026-03-26T10:00:00.000Z',
            kind: 'message',
            payload: { text: 'secret sk-abcdefghijklmnop' }
          })
        ],
        'Raw Session',
        { storeRawTranscript: true }
      )
    ).rejects.toThrow(/explicit opt-in/i);
  });

  it('stores raw transcripts when the store is configured with opt-in', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'shadow-agent-persistence-'));
    const store = new FileReplayStore(rootDir, {
      privacy: {
        allowRawTranscriptStorage: true,
        allowOffHostInference: false
      }
    });
    const sessionId = 'raw-opt-in';
    const rawText = 'secret sk-abcdefghijklmnop';

    await store.saveSession(
      sessionId,
      [
        makeEvent({
          id: 'evt-1',
          sessionId,
          timestamp: '2026-03-26T10:00:00.000Z',
          kind: 'message',
          payload: { text: rawText }
        })
      ],
      'Raw Opt In',
      { storeRawTranscript: true }
    );

    const loaded = await store.loadEvents(sessionId);
    expect(loaded[0].payload).toEqual({ text: rawText });
  });

  it('appends events and lists sessions in updated order', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'shadow-agent-persistence-'));
    tempRoots.push(rootDir);
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

  // ── edge / failure cases ──────────────────────────────────────────────────

  it('loadSession throws on a nonexistent session', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'shadow-agent-persistence-'));
    tempRoots.push(rootDir);
    const store = new FileReplayStore(rootDir);
    await expect(store.loadSession('nonexistent-session')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('listSessions returns empty array for a fresh store', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'shadow-agent-persistence-'));
    tempRoots.push(rootDir);
    const store = new FileReplayStore(rootDir);
    const sessions = await store.listSessions();
    expect(sessions).toEqual([]);
  });

  it('loadEvents returns empty array for a session with no events', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'shadow-agent-persistence-'));
    tempRoots.push(rootDir);
    const store = new FileReplayStore(rootDir);
    // Save a session with an explicit empty event list
    await store.saveSession('empty-session', [], 'Empty');
    const events = await store.loadEvents('empty-session');
    expect(events).toEqual([]);
  });

  it('session IDs with special characters are encoded/decoded correctly', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'shadow-agent-persistence-'));
    tempRoots.push(rootDir);
    const store = new FileReplayStore(rootDir);
    const sessionId = 'session/with spaces & special=chars';
    const evt = makeEvent({
      id: 'x-1',
      sessionId,
      timestamp: '2026-01-01T00:00:00.000Z',
      kind: 'session_started',
      actor: 'system'
    });
    await store.saveSession(sessionId, [evt], 'Special');
    const loaded = await store.loadSession(sessionId);
    const sessions = await store.listSessions();
    const listed = sessions.find((session) => session.sessionId === sessionId);

    expect(loaded.record.sessionId).toBe(sessionId);
    expect(loaded.events).toEqual([evt]);
    expect(listed?.sessionId).toBe(sessionId);
  });
});
