/**
 * Tests for the event capture pipeline.
 * Covers: incremental parser, normalizer, event buffer, session discovery,
 * session manager roundtrip, IpcBridge lifecycle, and backpressure compute.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { CanonicalEvent } from '../../src/shared/schema';
import type { EventQueueCheckpoint } from '../../src/shared/schema';

// ── Electron mock — must be hoisted before any import that pulls in 'electron' ──

const { handleMock, removeHandlerMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
  removeHandlerMock: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: handleMock,
    removeHandler: removeHandlerMock,
  },
}));

// ── Module imports ─────────────────────────────────────────────────────────

import { createIncrementalParser } from '../../src/capture/incremental-parser';
import { createEventBuffer } from '../../src/capture/event-buffer';
import { computeWatchDelay } from '../../src/capture/transcript-watcher';
import { normalizeEntry } from '../../src/capture/normalizer';
import { discoverActiveSession } from '../../src/capture/session-discovery';
import { createIpcBridge } from '../../src/capture/ipc-bridge';
import type { EventBuffer, EventSubscriber } from '../../src/capture/event-buffer';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── Shared test helpers ────────────────────────────────────────────────────

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

function makeCanonicalEvent(id: string): CanonicalEvent {
  return {
    id,
    kind: 'message',
    timestamp: '2026-04-20T00:00:00.000Z',
    source: 'claude-transcript',
    sessionId: 'test-session',
    actor: 'assistant',
    payload: {},
  };
}

function makeCheckpoint(consumerId: string): EventQueueCheckpoint {
  return { consumerId, lastOffset: -1, updatedAt: '2026-04-20T00:00:00.000Z' };
}

function makeMockBuffer(overrides: Partial<EventBuffer> = {}): EventBuffer {
  const defaultSubscribeReturn = vi.fn();
  return {
    setSession: vi.fn().mockResolvedValue(undefined),
    push: vi.fn().mockResolvedValue({ accepted: 0, spilled: 0, dropped: 0, metrics: {}, backpressure: {} }),
    getRecent: vi.fn().mockResolvedValue([]),
    getAll: vi.fn().mockResolvedValue([]),
    getSince: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn().mockReturnValue(defaultSubscribeReturn),
    registerConsumer: vi.fn().mockResolvedValue(makeCheckpoint('renderer-ipc')),
    readPending: vi.fn().mockResolvedValue({
      consumerId: 'renderer-ipc',
      events: [],
      checkpoint: makeCheckpoint('renderer-ipc'),
      hasMore: false,
      truncated: false,
    }),
    commitCheckpoint: vi.fn().mockResolvedValue(makeCheckpoint('renderer-ipc')),
    clear: vi.fn().mockResolvedValue(undefined),
    getMetrics: vi.fn().mockReturnValue({
      memoryDepth: 0, spilledDepth: 0, totalDepth: 0,
      memoryCapacity: 2000, totalCapacity: 10000, pendingWrites: 0,
      subscriberCount: 0, oldestOffset: null, newestOffset: null,
      consumers: [], backpressure: { level: 'normal', shouldThrottle: false, totalRatio: 0, pendingWrites: 0 }
    }),
    getBackpressure: vi.fn().mockReturnValue({ level: 'normal', shouldThrottle: false, totalRatio: 0, pendingWrites: 0 }),
    get size() { return 0; },
    ...overrides,
  } as unknown as EventBuffer;
}

function getIpcHandler(channel: string): (...args: unknown[]) => Promise<unknown> {
  const call = handleMock.mock.calls.find(([ch]) => ch === channel);
  if (!call) throw new Error(`No IPC handler registered for '${channel}'`);
  return call[1] as (...args: unknown[]) => Promise<unknown>;
}

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'shadow-agent-queue-'));
  tempRoots.push(root);
  return root;
}

// ── Incremental parser ─────────────────────────────────────────────────────

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

  it('empty string chunk is a no-op: no entries emitted', () => {
    const received: Record<string, unknown>[] = [];
    const parser = createIncrementalParser((entry) => received.push(entry));

    parser.push('');

    expect(received).toHaveLength(0);
  });

  it('whitespace-only lines between valid JSON are silently skipped', () => {
    const received: Record<string, unknown>[] = [];
    const parser = createIncrementalParser((entry) => received.push(entry));

    parser.push('   \n{"type":"ok"}\n');

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ type: 'ok' });
  });

  it('multiple complete JSON lines in a single push are all emitted', () => {
    const received: Record<string, unknown>[] = [];
    const parser = createIncrementalParser((entry) => received.push(entry));

    parser.push('{"a":1}\n{"b":2}\n{"c":3}\n');

    expect(received).toHaveLength(3);
    expect(received[0]).toMatchObject({ a: 1 });
    expect(received[1]).toMatchObject({ b: 2 });
    expect(received[2]).toMatchObject({ c: 3 });
  });
});

// ── Normalizer ─────────────────────────────────────────────────────────────

describe('normalizeEntry', () => {
  const SESSION_ID = 'test-session-abc';
  const TS = '2026-04-20T10:00:00.000Z';

  it('maps a message entry to a CanonicalEvent', () => {
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

  it('is_error:true tool_result maps to tool_failed kind', () => {
    const raw = {
      type: 'say',
      timestamp: TS,
      message: {
        role: 'tool',
        content: [{
          type: 'tool_result',
          tool_use_id: 'tu-err',
          content: 'Permission denied',
          is_error: true,
        }],
      },
    };

    const events = normalizeEntry(raw, SESSION_ID);

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('tool_failed');
    expect(events[0]?.payload).toMatchObject({ toolUseId: 'tu-err', error: 'Permission denied' });
  });

  it('tool_started payload contains toolName and toolUseId', () => {
    const raw = {
      type: 'say',
      timestamp: TS,
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', name: 'read_file', id: 'tu-42', input: { file_path: 'src/index.ts' } }],
      },
    };

    const events = normalizeEntry(raw, SESSION_ID);

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('tool_started');
    expect(events[0]?.payload).toMatchObject({
      toolName: 'read_file',
      toolUseId: 'tu-42',
      args: { file_path: 'src/index.ts' },
    });
  });

  it('message.content as string produces a single message event', () => {
    const raw = {
      type: 'say',
      timestamp: TS,
      message: {
        role: 'assistant',
        content: 'This is a plain string response.',
      },
    };

    const events = normalizeEntry(raw, SESSION_ID);

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('message');
    expect(events[0]?.payload).toMatchObject({ text: 'This is a plain string response.' });
    expect(events[0]?.actor).toBe('assistant');
  });

  it('session entry (type="session") maps to session_started with cwd', () => {
    const raw = {
      type: 'session',
      timestamp: TS,
      cwd: '/workspace/my-project',
    };

    const events = normalizeEntry(raw, SESSION_ID);

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('session_started');
    expect(events[0]?.actor).toBe('system');
    expect(events[0]?.payload).toMatchObject({ cwd: '/workspace/my-project' });
  });

  it('content array with multiple blocks produces one event per block', () => {
    const raw = {
      type: 'say',
      timestamp: TS,
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Running command now.' },
          { type: 'tool_use', name: 'bash', id: 'tu-multi', input: { command: 'ls -la' } },
        ],
      },
    };

    const events = normalizeEntry(raw, SESSION_ID);

    expect(events).toHaveLength(2);
    expect(events[0]?.kind).toBe('message');
    expect(events[1]?.kind).toBe('tool_started');
  });
});

// ── Event buffer ───────────────────────────────────────────────────────────

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

  it('sanitizes transcript content before spilling events to disk', async () => {
    const root = makeTempRoot();
    const buf = createEventBuffer({
      memoryCapacity: 1,
      totalCapacity: 4,
      persistenceRoot: root
    });

    await buf.push([
      {
        ...makeEvent('secret'),
        payload: { text: 'Email dev@example.com from D:\\_projects\\AgentVisualCrazy\\secret.txt' }
      },
      makeEvent('next')
    ]);

    const spill = await readFile(join(root, 'default', 'spill.jsonl'), 'utf8');
    expect(spill).toContain('[redacted-email]');
    expect(spill).toContain('[redacted-path]');
    expect(spill).not.toContain('dev@example.com');
    expect(spill).not.toContain('D:\\_projects\\AgentVisualCrazy\\secret.txt');
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

// ── Adapter backpressure ───────────────────────────────────────────────────

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

// ── Session discovery ──────────────────────────────────────────────────────

describe('discoverActiveSession', () => {
  it('returns null when no JSONL files exist in override path', async () => {
    const result = await discoverActiveSession('/nonexistent/path/that/does/not/exist');
    expect(result).toBeNull();
  });
});

// ── IpcBridge ──────────────────────────────────────────────────────────────

describe('createIpcBridge', () => {
  beforeEach(() => {
    handleMock.mockReset();
    removeHandlerMock.mockReset();
  });

  it('calls buffer.subscribe to wire up push notifications', () => {
    const buffer = makeMockBuffer();
    const bridge = createIpcBridge({ buffer, getWebContents: () => null, buildSnapshot: vi.fn() });

    bridge.start();

    expect(buffer.subscribe).toHaveBeenCalledOnce();
  });

  it('calls the unsubscribe function returned by buffer.subscribe on cleanup', () => {
    const unsubscribeFn = vi.fn();
    const buffer = makeMockBuffer({
      subscribe: vi.fn().mockReturnValue(unsubscribeFn),
    });
    const bridge = createIpcBridge({ buffer, getWebContents: () => null, buildSnapshot: vi.fn() });

    const cleanup = bridge.start();
    cleanup();

    expect(unsubscribeFn).toHaveBeenCalledOnce();
  });

  it('removes old IPC handlers before registering new ones', () => {
    const buffer = makeMockBuffer();
    const bridge = createIpcBridge({ buffer, getWebContents: () => null, buildSnapshot: vi.fn() });

    bridge.start();

    expect(removeHandlerMock).toHaveBeenCalledWith('shadow:snapshot');
    expect(removeHandlerMock).toHaveBeenCalledWith('shadow:events-since');

    const removeOrder = removeHandlerMock.mock.invocationCallOrder;
    const handleOrder = handleMock.mock.invocationCallOrder;
    expect(removeOrder[0]).toBeLessThan(handleOrder[0]);
  });

  it('shadow:snapshot handler calls buildSnapshot and returns its result', async () => {
    const expected = { source: { kind: 'fixture', label: 'test' }, events: [] };
    const buildSnapshot = vi.fn().mockResolvedValue(expected);
    const buffer = makeMockBuffer();

    const bridge = createIpcBridge({ buffer, getWebContents: () => null, buildSnapshot });
    bridge.start();

    const handler = getIpcHandler('shadow:snapshot');
    const result = await handler();

    expect(buildSnapshot).toHaveBeenCalledOnce();
    expect(result).toBe(expected);
  });

  it('shadow:events-since handler delegates to buffer.getSince and returns its result', async () => {
    const events = [makeCanonicalEvent('a'), makeCanonicalEvent('b')];
    const buffer = makeMockBuffer({
      getSince: vi.fn().mockResolvedValue(events),
    });

    const bridge = createIpcBridge({ buffer, getWebContents: () => null, buildSnapshot: vi.fn() });
    bridge.start();

    const handler = getIpcHandler('shadow:events-since');
    const result = await handler({} /* _event */, 'evt-a');

    expect(buffer.getSince).toHaveBeenCalledWith('evt-a');
    expect(result).toEqual(events);
  });

  it('cleanup removes both IPC handlers from ipcMain', () => {
    const buffer = makeMockBuffer();
    const bridge = createIpcBridge({ buffer, getWebContents: () => null, buildSnapshot: vi.fn() });

    const cleanup = bridge.start();
    removeHandlerMock.mockReset();
    cleanup();

    expect(removeHandlerMock).toHaveBeenCalledWith('shadow:snapshot');
    expect(removeHandlerMock).toHaveBeenCalledWith('shadow:events-since');
  });

  it('debounces rapid push callbacks: 5 rapid signals → single wc.send call', async () => {
    vi.useFakeTimers();

    const sendMock = vi.fn();
    const mockWebContents = { send: sendMock, isDestroyed: () => false };

    let subscriberCallback: EventSubscriber | null = null;
    const buffer = makeMockBuffer({
      subscribe: vi.fn().mockImplementation((cb: EventSubscriber) => {
        subscriberCallback = cb;
        return vi.fn();
      }),
      readPending: vi.fn().mockResolvedValue({
        consumerId: 'renderer-ipc',
        events: [makeCanonicalEvent('e1')],
        checkpoint: makeCheckpoint('renderer-ipc'),
        hasMore: false,
        truncated: false,
      }),
    });

    const bridge = createIpcBridge({
      buffer,
      getWebContents: () => mockWebContents as unknown as Electron.WebContents,
      buildSnapshot: vi.fn(),
    });
    bridge.start();

    expect(subscriberCallback).not.toBeNull();

    const metrics = {} as never;
    for (let i = 0; i < 5; i++) subscriberCallback!([], metrics);

    expect(sendMock).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();

    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock).toHaveBeenCalledWith('shadow:events', expect.any(Array));

    vi.useRealTimers();
  });
});
