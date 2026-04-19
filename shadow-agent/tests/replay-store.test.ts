import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildSessionRecord, parseReplay, serializeEvents } from '../src/shared/replay-store';
import type { CanonicalEvent } from '../src/shared/schema';

const FIXTURE_DIR = fileURLToPath(new URL('.', import.meta.url));
const REPLAY_FIXTURES = join(FIXTURE_DIR, 'fixtures/replays');

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
  it('sanitizes replay JSONL by default and ignores blank lines', () => {
    const serialized = serializeEvents(events);
    const parsed = parseReplay(`\n${serialized}\n\n`);

    expect(parsed[0].payload).toEqual({ text: 'Later event first.' });
    expect(parsed[1]).toEqual(events[1]);
  });

  it('preserves raw replay JSONL only when explicitly opted in', () => {
    const sensitiveEvents: CanonicalEvent[] = [
      {
        id: 'evt-sensitive',
        sessionId: 'session-a',
        source: 'replay',
        timestamp: '2026-03-26T10:10:00.000Z',
        actor: 'agent',
        kind: 'message',
        payload: { text: 'Email me at dev@example.com and use sk-abcdefghijklmnop' }
      }
    ];

    const serialized = serializeEvents(sensitiveEvents, { storeRawTranscript: true }, {
      allowRawTranscriptStorage: true,
      allowOffHostInference: false
    });
    const [parsed] = parseReplay(serialized);

    expect(parsed.payload).toEqual(sensitiveEvents[0].payload);
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

  // ── edge cases ─────────────────────────────────────────────────────────────

  it('buildSessionRecord with empty array uses epoch defaults', () => {
    const record = buildSessionRecord([], 'Empty');
    expect(record.sessionId).toBe('unknown');
    expect(record.eventCount).toBe(0);
    // timestamps should be the epoch default
    expect(record.startedAt).toBe(new Date(0).toISOString());
    expect(record.updatedAt).toBe(new Date(0).toISOString());
  });

  it('buildSessionRecord ignores invalid timestamps when computing bounds', () => {
    const badEvents: CanonicalEvent[] = [
      { id: 'e1', sessionId: 's', source: 'replay', timestamp: 'not-a-date', actor: 'system', kind: 'session_started', payload: {} },
      { id: 'e2', sessionId: 's', source: 'replay', timestamp: '2026-01-01T00:00:00.000Z', actor: 'user', kind: 'message', payload: {} },
    ];
    const record = buildSessionRecord(badEvents);
    expect(record.eventCount).toBe(2);
    expect(record.startedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(record.updatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('serializeEvents produces one JSON line per event', () => {
    const lines = serializeEvents(events).split('\n');
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('parseReplay on a single corrupt line throws with line number', () => {
    expect(() => parseReplay('not-json-at-all')).toThrow(/line 1/i);
  });

  it('round-trips the happy-path replay fixture', () => {
    const raw = readFileSync(join(REPLAY_FIXTURES, 'happy-path.replay.jsonl'), 'utf8');
    const parsed = parseReplay(raw);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]?.sessionId).toBe('happy-path');
    const roundTripped = parseReplay(serializeEvents(parsed));
    expect(roundTripped).toEqual(parsed);
  });

  it('parseReplay throws on corrupt-partial fixture (corrupt line)', () => {
    const raw = readFileSync(join(REPLAY_FIXTURES, 'corrupt-partial.replay.jsonl'), 'utf8');
    expect(() => parseReplay(raw)).toThrow(/line\s*3/i);
  });
});
