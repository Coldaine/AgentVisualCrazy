/**
 * Tests for the event capture pipeline.
 * Covers: incremental parser, event buffer, session discovery, and session manager roundtrip.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createIncrementalParser } from '../src/capture/incremental-parser';
import { createEventBuffer } from '../src/capture/event-buffer';
import type { CanonicalEvent } from '../src/shared/schema';
import { normalizeEntry } from '../src/capture/normalizer';
import { discoverActiveSession } from '../src/capture/session-discovery';
import * as fs from 'node:fs/promises';

// ── incremental parser ─────────────────────────────────────────────────────

describe('createIncrementalParser', () => {
  it('emits complete lines and holds partial tail', () => {
    const received: Record<string, unknown>[] = [];
    const parser = createIncrementalParser((entry) => received.push(entry));

    parser.push('{"type":"message","role":"user"}\n{"type":"tool_use"');
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ type: 'message', role: 'user' });

    parser.push(',"name":"bash"}\n');
    expect(received).toHaveLength(2);
    expect(received[1]).toMatchObject({ type: 'tool_use', name: 'bash' });
  });

  it('handles CRLF line endings', () => {
    const received: Record<string, unknown>[] = [];
    const parser = createIncrementalParser((entry) => received.push(entry));
    parser.push('{"type":"a"}\r\n{"type":"b"}\r\n');
    expect(received).toHaveLength(2);
  });

  it('skips invalid JSON lines without throwing', () => {
    const received: Record<string, unknown>[] = [];
    const parser = createIncrementalParser((entry) => received.push(entry));
    parser.push('not-json\n{"type":"ok"}\n');
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ type: 'ok' });
  });

  it('reset clears buffered partial line', () => {
    const received: Record<string, unknown>[] = [];
    const parser = createIncrementalParser((entry) => received.push(entry));
    parser.push('{"type":"partial"');
    parser.reset();
    parser.push('{"type":"fresh"}\n');
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ type: 'fresh' });
  });
});

// ── normalizer ─────────────────────────────────────────────────────────────

describe('normalizeEntry', () => {
  const SESSION_ID = 'test-session-abc';

  it('maps a message entry to a CanonicalEvent', () => {
    // Claude Code transcript format: role/content nested under entry.message
    const raw = {
      type: 'say',
      timestamp: '2024-01-01T00:00:00.000Z',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'hello' }],
      },
    };
    const events = normalizeEntry(raw, SESSION_ID);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'message',
      source: 'claude-transcript',
      sessionId: SESSION_ID,
    });
  });

  it('maps a tool_use entry', () => {
    const raw = {
      type: 'say',
      timestamp: '2024-01-01T00:00:01.000Z',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', name: 'bash', id: 'tu_1', input: { command: 'ls' } }],
      },
    };
    const events = normalizeEntry(raw, SESSION_ID);
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('tool_started');
  });

  it('maps a tool_result entry', () => {
    const raw = {
      type: 'say',
      timestamp: '2024-01-01T00:00:02.000Z',
      message: {
        role: 'tool',
        content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'output' }],
      },
    };
    const events = normalizeEntry(raw, SESSION_ID);
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('tool_completed');
  });

  it('returns empty array for unknown entry types', () => {
    const raw = { type: 'unknown_type', data: {} };
    expect(normalizeEntry(raw, SESSION_ID)).toHaveLength(0);
  });
});

// ── event buffer ───────────────────────────────────────────────────────────

describe('createEventBuffer', () => {
  const makeEvent = (id: string): CanonicalEvent => ({
    id,
    kind: 'message',
    timestamp: new Date().toISOString(),
    source: 'claude-transcript',
    sessionId: 'sess',
    payload: {},
  });

  it('pushes events and returns them via getAll', () => {
    const buf = createEventBuffer();
    buf.push([makeEvent('a'), makeEvent('b')]);
    expect(buf.getAll()).toHaveLength(2);
    expect(buf.size).toBe(2);
  });

  it('evicts oldest events when capacity is exceeded', () => {
    const buf = createEventBuffer(3);
    buf.push([makeEvent('x'), makeEvent('y'), makeEvent('z')]);
    buf.push([makeEvent('w')]);
    const all = buf.getAll();
    expect(all).toHaveLength(3);
    expect(all[0].id).toBe('y');
    expect(all[2].id).toBe('w');
  });

  it('getRecent returns last n events', () => {
    const buf = createEventBuffer();
    buf.push([makeEvent('1'), makeEvent('2'), makeEvent('3')]);
    const recent = buf.getRecent(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].id).toBe('2');
    expect(recent[1].id).toBe('3');
  });

  it('getSince returns events after a given id', () => {
    const buf = createEventBuffer();
    buf.push([makeEvent('a'), makeEvent('b'), makeEvent('c')]);
    expect(buf.getSince('b')).toHaveLength(1);
    expect(buf.getSince('b')[0].id).toBe('c');
  });

  it('getSince returns all events when id not found', () => {
    const buf = createEventBuffer();
    buf.push([makeEvent('a'), makeEvent('b')]);
    expect(buf.getSince('missing')).toHaveLength(2);
  });

  it('subscribe is notified on push', () => {
    const buf = createEventBuffer();
    const calls: CanonicalEvent[][] = [];
    buf.subscribe((evts) => calls.push(evts));
    buf.push([makeEvent('e1')]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(1);
  });

  it('unsubscribe stops notifications', () => {
    const buf = createEventBuffer();
    const calls: number[] = [];
    const unsub = buf.subscribe(() => calls.push(1));
    buf.push([makeEvent('e1')]);
    unsub();
    buf.push([makeEvent('e2')]);
    expect(calls).toHaveLength(1);
  });

  it('clear empties the buffer', () => {
    const buf = createEventBuffer();
    buf.push([makeEvent('a')]);
    buf.clear();
    expect(buf.size).toBe(0);
    expect(buf.getAll()).toHaveLength(0);
  });
});

// ── session discovery ──────────────────────────────────────────────────────

describe('discoverActiveSession', () => {
  it('returns null when no JSONL files exist in override path', async () => {
    const result = await discoverActiveSession('/nonexistent/path/that/does/not/exist');
    expect(result).toBeNull();
  });
});
