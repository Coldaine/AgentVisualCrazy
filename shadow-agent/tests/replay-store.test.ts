import { describe, expect, it } from 'vitest';
import { buildSessionRecord, parseReplay, serializeEvents } from '../src/shared/replay-store';
import type { CanonicalEvent } from '../src/shared/schema';

const events: CanonicalEvent[] = [
  {
    id: 'evt-2',
    sessionId: 'session-a',
    source: 'replay',
    timestamp: '2026-03-26T10:05:00.000Z',
    actor: 'agent',
    kind: 'message',
    payload: { text: 'Later event first.' }
  },
  {
    id: 'evt-1',
    sessionId: 'session-a',
    source: 'replay',
    timestamp: '2026-03-26T10:00:00.000Z',
    actor: 'system',
    kind: 'session_started',
    payload: {}
  }
];

describe('replay-store', () => {
  it('round-trips replay JSONL and ignores blank lines', () => {
    const serialized = serializeEvents(events);
    const parsed = parseReplay(`\n${serialized}\n\n`);

    expect(parsed).toEqual(events);
  });

  it('reports replay parse errors with a line number', () => {
    expect(() => parseReplay('{"id":"ok"}\nnot-json')).toThrow(/line 2/i);
  });

  it('builds session records using min and max timestamps instead of event order', () => {
    const record = buildSessionRecord(events, 'Session A');

    expect(record).toMatchObject({
      sessionId: 'session-a',
      title: 'Session A',
      startedAt: '2026-03-26T10:00:00.000Z',
      updatedAt: '2026-03-26T10:05:00.000Z',
      source: 'replay',
      eventCount: 2
    });
  });
});
