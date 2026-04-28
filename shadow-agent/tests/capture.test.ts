/**
 * Tests for the event capture pipeline.
 * Covers: incremental parser, event buffer, session discovery, and session manager roundtrip.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createIncrementalParser } from '../src/capture/incremental-parser';
import { createEventBuffer } from '../src/capture/event-buffer';
import { computeWatchDelay } from '../src/capture/transcript-watcher';
import type { CanonicalEvent } from '../src/shared/schema';
import { normalizeEntry } from '../src/capture/normalizer';
import { discoverActiveSession } from '../src/capture/session-discovery';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

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
    actor: 'assistant',
    payload: {},
  });

  function makeTempRoot(): string {
    const root = mkdtempSync(join(tmpdir(), 'shadow-agent-queue-'));
    tempRoots.push(root);
    return root;
  }

  it('pushes events and returns them via getAll', async () => {
    const buf = createEventBuffer({ persistenceRoot: makeTempRoot() });
    await buf.push([makeEvent('a'), makeEvent('b')]);
    expect(await buf.getAll()).toHaveLength(2);
    expect(buf.size).toBe(2);
  });

  it('spills oldest events to disk when the in-memory window rolls over', async () => {
    const buf = createEventBuffer({
      memoryCapacity: 2,
      totalCapacity: 5,
      persistenceRoot: makeTempRoot()
    });

    await buf.push([makeEvent('x'), makeEvent('y'), makeEvent('z')]);

    const all = await buf.getAll();
    expect(all).toHaveLength(3);
    expect(all.map((event) => event.id)).toEqual(['x', 'y', 'z']);
    expect(buf.getMetrics().memoryDepth).toBe(2);
    expect(buf.getMetrics().spilledDepth).toBe(1);
  });

  it('drops the oldest spilled events once the total queue capacity is exceeded', async () => {
    const buf = createEventBuffer({
      memoryCapacity: 2,
      totalCapacity: 4,
      persistenceRoot: makeTempRoot()
    });

    await buf.push([makeEvent('1'), makeEvent('2'), makeEvent('3'), makeEvent('4'), makeEvent('5')]);

    const all = await buf.getAll();
    expect(all.map((event) => event.id)).toEqual(['2', '3', '4', '5']);
    expect(buf.getMetrics().totalDepth).toBe(4);
  });

  it('getRecent returns last n events across memory and spill storage', async () => {
    const buf = createEventBuffer({
      memoryCapacity: 2,
      totalCapacity: 5,
      persistenceRoot: makeTempRoot()
    });
    await buf.push([makeEvent('1'), makeEvent('2'), makeEvent('3')]);
    const recent = await buf.getRecent(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].id).toBe('2');
    expect(recent[1].id).toBe('3');
  });

  it('getSince returns events after a given id even when older items spilled to disk', async () => {
    const buf = createEventBuffer({
      memoryCapacity: 2,
      totalCapacity: 5,
      persistenceRoot: makeTempRoot()
    });
    await buf.push([makeEvent('a'), makeEvent('b'), makeEvent('c')]);
    expect(await buf.getSince('b')).toHaveLength(1);
    expect((await buf.getSince('b'))[0].id).toBe('c');
  });

  it('getSince returns all events when id not found', async () => {
    const buf = createEventBuffer({ persistenceRoot: makeTempRoot() });
    await buf.push([makeEvent('a'), makeEvent('b')]);
    expect(await buf.getSince('missing')).toHaveLength(2);
  });

  it('subscribe is notified on push', async () => {
    const buf = createEventBuffer({ persistenceRoot: makeTempRoot() });
    const calls: CanonicalEvent[][] = [];
    buf.subscribe((evts) => calls.push(evts));
    await buf.push([makeEvent('e1')]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(1);
  });

  it('unsubscribe stops notifications', async () => {
    const buf = createEventBuffer({ persistenceRoot: makeTempRoot() });
    const calls: number[] = [];
    const unsub = buf.subscribe(() => calls.push(1));
    await buf.push([makeEvent('e1')]);
    unsub();
    await buf.push([makeEvent('e2')]);
    expect(calls).toHaveLength(1);
  });

  it('tracks consumer checkpoints against spilled data', async () => {
    const buf = createEventBuffer({
      memoryCapacity: 2,
      totalCapacity: 5,
      persistenceRoot: makeTempRoot()
    });
    await buf.push([makeEvent('a'), makeEvent('b'), makeEvent('c')]);
    await buf.registerConsumer('renderer', { startAt: 'earliest' });

    const firstRead = await buf.readPending('renderer');
    expect(firstRead.events.map((event) => event.id)).toEqual(['a', 'b', 'c']);
    expect(firstRead.truncated).toBe(false);

    await buf.commitCheckpoint('renderer', 'b');
    await buf.push([makeEvent('d'), makeEvent('e')]);

    const secondRead = await buf.readPending('renderer');
    expect(secondRead.events.map((event) => event.id)).toEqual(['c', 'd', 'e']);
    expect(buf.getMetrics().consumers[0]?.lag).toBe(3);
  });

  it('reports high backpressure as the queue fills', async () => {
    const buf = createEventBuffer({
      memoryCapacity: 2,
      totalCapacity: 4,
      persistenceRoot: makeTempRoot()
    });
    await buf.push([makeEvent('a'), makeEvent('b'), makeEvent('c')]);
    expect(buf.getBackpressure().level).toBe('high');

    await buf.push([makeEvent('d')]);
    expect(buf.getBackpressure().level).toBe('critical');
    expect(buf.getBackpressure().shouldThrottle).toBe(true);
  });

  it('clear empties the queue and resets stored checkpoints', async () => {
    const buf = createEventBuffer({ persistenceRoot: makeTempRoot() });
    await buf.push([makeEvent('a')]);
    await buf.registerConsumer('renderer', { startAt: 'earliest' });
    await buf.clear();
    expect(buf.size).toBe(0);
    expect(await buf.getAll()).toHaveLength(0);
    expect(buf.getMetrics().consumers[0]?.lastOffset).toBe(-1);
  });
});

// ── adapter backpressure ───────────────────────────────────────────────────

describe('computeWatchDelay', () => {
  it('keeps the base delay when pressure is normal or missing', () => {
    expect(computeWatchDelay(100)).toBe(100);
    expect(
      computeWatchDelay(100, {
        level: 'normal',
        shouldThrottle: false,
        totalRatio: 0.2,
        pendingWrites: 0
      })
    ).toBe(100);
  });

  it('increases debounce as backpressure rises', () => {
    expect(
      computeWatchDelay(100, {
        level: 'high',
        shouldThrottle: true,
        totalRatio: 0.8,
        pendingWrites: 2
      })
    ).toBe(250);

    expect(
      computeWatchDelay(100, {
        level: 'critical',
        shouldThrottle: true,
        totalRatio: 1,
        pendingWrites: 4
      })
    ).toBe(500);
  });
});

// ── session discovery ──────────────────────────────────────────────────────

describe('discoverActiveSession', () => {
  it('returns null when no JSONL files exist in override path', async () => {
    const result = await discoverActiveSession('/nonexistent/path/that/does/not/exist');
    expect(result).toBeNull();
  });
});
