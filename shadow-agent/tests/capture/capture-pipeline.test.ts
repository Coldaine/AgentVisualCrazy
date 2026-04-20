/**
 * Phase 2 capture pipeline tests.
 *
 * Expands coverage beyond tests/capture.test.ts (which covers the basic
 * happy paths). Focuses on:
 *   - IpcBridge lifecycle, IPC handler wiring, and debounce behaviour.
 *   - Normalizer: is_error → tool_failed, toolName payload, string content,
 *     session entry, and multi-block entries.
 *   - IncrementalParser: empty chunk no-op, whitespace-only line skipped.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanonicalEvent } from '../../src/shared/schema';
import type { EventBuffer, EventSubscriber } from '../../src/capture/event-buffer';
import type { EventQueueCheckpoint } from '../../src/shared/schema';

// ---------------------------------------------------------------------------
// Electron mock — must be hoisted before any import that pulls in 'electron'
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Module imports (after mock hoisting)
// ---------------------------------------------------------------------------
import { createIpcBridge } from '../../src/capture/ipc-bridge';
import { normalizeEntry } from '../../src/capture/normalizer';
import { createIncrementalParser } from '../../src/capture/incremental-parser';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

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
  const defaultSubscribeReturn = vi.fn(); // unsubscribe no-op
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

/** Extract the callback registered with ipcMain.handle for a given channel. */
function getIpcHandler(channel: string): (...args: unknown[]) => Promise<unknown> {
  const call = handleMock.mock.calls.find(([ch]) => ch === channel);
  if (!call) throw new Error(`No IPC handler registered for '${channel}'`);
  return call[1] as (...args: unknown[]) => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// IpcBridge
// ---------------------------------------------------------------------------

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

    // removeHandler must precede handle for each channel
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
    removeHandlerMock.mockReset(); // ignore calls from start()
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

    // Simulate 5 rapid pushes — each fires the subscribe callback
    const metrics = {} as never;
    for (let i = 0; i < 5; i++) subscriberCallback!([], metrics);

    // Debounce is still pending — no send yet
    expect(sendMock).not.toHaveBeenCalled();

    // Advance past the 150ms debounce and drain all async microtasks
    await vi.runAllTimersAsync();

    // Exactly one send despite 5 rapid fires
    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock).toHaveBeenCalledWith('shadow:events', expect.any(Array));

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// Normalizer extensions
// ---------------------------------------------------------------------------

describe('normalizeEntry — extended coverage', () => {
  const SESSION = 'sess-ext';
  const TS = '2026-04-20T10:00:00.000Z';

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

    const events = normalizeEntry(raw, SESSION);

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

    const events = normalizeEntry(raw, SESSION);

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

    const events = normalizeEntry(raw, SESSION);

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

    const events = normalizeEntry(raw, SESSION);

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

    const events = normalizeEntry(raw, SESSION);

    expect(events).toHaveLength(2);
    expect(events[0]?.kind).toBe('message');
    expect(events[1]?.kind).toBe('tool_started');
  });
});

// ---------------------------------------------------------------------------
// IncrementalParser extensions
// ---------------------------------------------------------------------------

describe('createIncrementalParser — extended coverage', () => {
  it('empty string chunk is a no-op: no entries emitted', () => {
    const received: Record<string, unknown>[] = [];
    const parser = createIncrementalParser((entry) => received.push(entry));

    parser.push('');

    expect(received).toHaveLength(0);
  });

  it('whitespace-only lines between valid JSON are silently skipped', () => {
    const received: Record<string, unknown>[] = [];
    const parser = createIncrementalParser((entry) => received.push(entry));

    // Line with only spaces, then a valid JSON line
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
