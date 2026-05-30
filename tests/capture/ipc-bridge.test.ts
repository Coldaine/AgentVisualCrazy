import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';

const { handleMock, removeHandlerMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
  removeHandlerMock: vi.fn()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: handleMock,
    removeHandler: removeHandlerMock
  }
}));

import { createIpcBridge } from '../../src/capture/ipc-bridge';
import type { EventBuffer } from '../../src/capture/event-buffer';

function fakeBuffer(overrides: Partial<EventBuffer> = {}): EventBuffer {
  return {
    registerConsumer: vi.fn(async () => undefined),
    readPending: vi.fn(async () => ({ events: [], truncated: false })),
    commitCheckpoint: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => {}),
    getSince: vi.fn(async () => []),
    ...overrides
  } as unknown as EventBuffer;
}

function fakeWebContents(): WebContents {
  return {
    send: vi.fn(),
    isDestroyed: () => false
  } as unknown as WebContents;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  handleMock.mockReset();
  removeHandlerMock.mockReset();
});

describe('ipc-bridge dirty refresh (markDirty)', () => {
  it('emits an empty shadow:events batch on a dirty-only flush and never commits a checkpoint', async () => {
    const buffer = fakeBuffer();
    const wc = fakeWebContents();
    const bridge = createIpcBridge({ buffer, getWebContents: () => wc, buildSnapshot: async () => null });
    const cleanup = bridge.start();

    bridge.markDirty();
    await wait(220); // past the 150ms debounce

    expect(wc.send).toHaveBeenCalledWith('shadow:events', []);
    // No events -> must not deref pending.events.at(-1)! / commit a checkpoint.
    expect(buffer.commitCheckpoint).not.toHaveBeenCalled();

    cleanup();
  });

  it('markDirty before start() is a no-op', async () => {
    const buffer = fakeBuffer();
    const wc = fakeWebContents();
    const bridge = createIpcBridge({ buffer, getWebContents: () => wc, buildSnapshot: async () => null });

    bridge.markDirty();
    await wait(220);

    expect(wc.send).not.toHaveBeenCalled();
  });
});
