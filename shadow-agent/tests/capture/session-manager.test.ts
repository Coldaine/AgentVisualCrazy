import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import type {
  CaptureSession,
  CaptureTransport,
  CaptureTransportContext,
  CaptureTransportSubscription
} from '../../src/capture/capture-transport';

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

import { createSessionManager } from '../../src/capture/session-manager';

const tempDirs: string[] = [];

async function waitFor(assertion: () => boolean | Promise<boolean>, timeoutMs = 4_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await assertion()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out after ${timeoutMs}ms`);
}

afterEach(async () => {
  handleMock.mockReset();
  removeHandlerMock.mockReset();

  while (tempDirs.length > 0) {
    await rm(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('createSessionManager', () => {
  it('routes pluggable transport chunks through parser resets and into the live snapshot', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'shadow-session-manager-'));
    tempDirs.push(tempRoot);

    const session: CaptureSession = {
      sessionId: 'transport-session',
      label: 'Live Socket: test',
      source: 'claude-hook',
      path: 'tcp://127.0.0.1:5000',
      transportId: 'socket'
    };

    let subscriptionStopped = false;

    const transport: CaptureTransport = {
      id: 'test-transport',
      kind: 'socket',
      async start(context: CaptureTransportContext): Promise<CaptureTransportSubscription> {
        await context.onSessionStarted(session);
        await context.onChunk({
          session,
          chunk: '{"message":{"role":"assistant","content":"par'
        });
        await context.onSessionReset(session, 'reconnect');
        await context.onChunk({
          session,
          chunk: '{"message":{"role":"assistant","content":"parsed after reset"}}\n'
        });

        return {
          stop() {
            subscriptionStopped = true;
          }
        };
      }
    };

    const manager = createSessionManager(() => null, {
      queuePersistenceRoot: tempRoot,
      transport
    });

    await manager.start();
    await waitFor(async () => {
      const snapshot = await manager.getCurrentSnapshot();
      return snapshot?.state.transcript.some((entry) => entry.text === 'parsed after reset') ?? false;
    });

    const snapshot = await manager.getCurrentSnapshot();
    expect(snapshot?.source.path).toBe('tcp://127.0.0.1:5000');
    expect(snapshot?.state.transcript).toHaveLength(1);
    expect(snapshot?.state.transcript[0]?.text).toBe('parsed after reset');

    manager.stop();
    expect(subscriptionStopped).toBe(true);
  });
});
