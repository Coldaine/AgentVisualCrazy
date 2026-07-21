/**
 * Hook-receiver Unix domain socket path.
 */
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createHookReceiverCaptureTransport } from '../../src/capture/hook-receiver-transport';
import type { CaptureTransportSubscription } from '../../src/capture/capture-transport';

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

describe('hook-receiver unix socket', () => {
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

  it('accepts JSON payloads over a Unix domain socket', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'hook-unix-'));
    tmpRoots.push(root);
    const sockPath = path.join(root, 'shadow.sock');
    const chunks: string[] = [];
    const port = await freePort();

    const transport = createHookReceiverCaptureTransport({
      kind: 'hook-receiver',
      host: '127.0.0.1',
      port,
      unixSocketPath: sockPath,
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
        onSessionStarted: () => undefined,
        onSessionReset: () => undefined,
        onChunk: ({ chunk }) => {
          chunks.push(chunk);
        }
      })
    );

    await new Promise<void>((resolve, reject) => {
      const client = net.createConnection(sockPath);
      client.on('connect', () => {
        client.write(
          JSON.stringify({
            hook_event_name: 'stop',
            conversation_id: 'unix-1',
            status: 'completed'
          })
        );
        client.end();
      });
      client.on('error', reject);
      // Don't require a response — the transport may close after handling.
      client.on('close', () => resolve());
    });

    await waitFor(() => chunks.some((c) => c.includes('unix-1')));
    expect(chunks[0]).toContain('"hook_event_name":"stop"');
  });
});
