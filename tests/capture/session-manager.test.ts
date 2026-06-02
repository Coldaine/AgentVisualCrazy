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
import { createTestLogger } from '../../src/shared/logger';

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

    const logger = createTestLogger();
    const manager = createSessionManager(() => null, {
      queuePersistenceRoot: tempRoot,
      transport,
      logger
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
    // The injected logger must capture both manager and buffer events for one traceable session path.
    expect(logger.getRecent()).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: 'session_manager.start_session' }),
      expect.objectContaining({ event: 'buffer.session_set' })
    ]));

    manager.stop();
    expect(subscriptionStopped).toBe(true);
  });

  it('quarantines model insights: setModelInsights replaces heuristic insights; clearing falls back', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'shadow-session-insights-'));
    tempDirs.push(tempRoot);

    const manager = createSessionManager(() => null, { queuePersistenceRoot: tempRoot });

    // No model insights yet -> heuristic-only fallback.
    const before = await manager.getCurrentSnapshot();
    expect(before?.state.shadowInsights.length ?? 0).toBeGreaterThan(0);
    expect(before?.state.shadowInsights.every((insight) => insight.source === 'heuristic')).toBe(true);

    // Model insights present -> model-only (never interleaved with heuristics).
    manager.setModelInsights([
      { kind: 'risk', source: 'model', confidence: 0.9, scope: 'session', summary: 'model: config churn', evidenceEventIds: [] }
    ]);
    const withModel = await manager.getCurrentSnapshot();
    expect(withModel?.state.shadowInsights).toHaveLength(1);
    expect(withModel?.state.shadowInsights[0]?.source).toBe('model');
    expect(withModel?.state.shadowInsights[0]?.summary).toBe('model: config churn');

    // Clearing model insights falls back to heuristics again.
    manager.setModelInsights([]);
    const cleared = await manager.getCurrentSnapshot();
    expect(cleared?.state.shadowInsights.every((insight) => insight.source === 'heuristic')).toBe(true);

    manager.stop();
  });
});
