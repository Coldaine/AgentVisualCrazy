/**
 * Auto composite transport: file-tail + hook-receiver.
 */
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAutoCaptureTransport } from '../../src/capture/auto-capture-transport';
import type {
  CaptureSession,
  CaptureTransportSubscription
} from '../../src/capture/capture-transport';

async function waitFor(
  assertion: () => boolean | Promise<boolean>,
  timeoutMs = 4_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await assertion()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', () => resolve()));
  const address = probe.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve()))
  );
  return port;
}

describe('auto capture transport', () => {
  const subscriptions: CaptureTransportSubscription[] = [];
  const tmpRoots: string[] = [];

  afterEach(async () => {
    for (const sub of subscriptions.splice(0)) {
      await sub.stop();
    }
    for (const root of tmpRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('starts file-tail and hook-receiver, forwarding both session sources', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'auto-transport-'));
    tmpRoots.push(root);
    const jsonl = path.join(root, 'claude-live.jsonl');
    writeFileSync(
      jsonl,
      `${JSON.stringify({
        type: 'message',
        message: { role: 'user', content: 'hello from claude' },
        timestamp: '2026-05-20T12:00:00.000Z'
      })}\n`
    );

    const port = await freePort();
    const sessions: CaptureSession[] = [];
    const chunks: string[] = [];

    const transport = createAutoCaptureTransport({
      kind: 'auto',
      overridePath: jsonl,
      hookHost: '127.0.0.1',
      hookPort: port,
      defaultSource: 'cursor-hook'
    });

    subscriptions.push(
      await transport.start({
        getBackpressure: () => ({
          level: 'normal',
          shouldThrottle: false,
          totalRatio: 0,
          pendingWrites: 0
        }),
        onSessionStarted: (session) => {
          sessions.push(session);
        },
        onSessionReset: () => undefined,
        onChunk: ({ chunk }) => {
          chunks.push(chunk);
        }
      })
    );

    await waitFor(() => sessions.some((s) => s.source === 'claude-transcript' || s.path === jsonl));

    const response = await fetch(`http://127.0.0.1:${port}/hook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        hook_event_name: 'afterAgentResponse',
        conversation_id: 'cursor-auto-1',
        text: 'hello from cursor'
      })
    });
    expect(response.status).toBe(200);

    await waitFor(() => sessions.some((s) => s.source === 'cursor-hook'));
    expect(sessions.some((s) => s.sessionId === 'cursor-auto-1')).toBe(true);
    expect(chunks.some((c) => c.includes('hello from cursor'))).toBe(true);
  });

  it('continues with file-tail when the hook port is already bound', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'auto-transport-busy-'));
    tmpRoots.push(root);
    const jsonl = path.join(root, 'only-claude.jsonl');
    writeFileSync(jsonl, '{}\n');

    const port = await freePort();
    const blocker = createServer((_req, res) => res.end('busy'));
    await new Promise<void>((resolve) => blocker.listen(port, '127.0.0.1', () => resolve()));

    try {
      const sessions: CaptureSession[] = [];
      const transport = createAutoCaptureTransport({
        kind: 'auto',
        overridePath: jsonl,
        hookHost: '127.0.0.1',
        hookPort: port
      });

      subscriptions.push(
        await transport.start({
          getBackpressure: () => ({
            level: 'normal',
            shouldThrottle: false,
            totalRatio: 0,
            pendingWrites: 0
          }),
          onSessionStarted: (session) => {
            sessions.push(session);
          },
          onSessionReset: () => undefined,
          onChunk: () => undefined
        })
      );

      await waitFor(() => sessions.length > 0);
      expect(sessions.every((s) => s.transportId === 'file-tail')).toBe(true);
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });
});
