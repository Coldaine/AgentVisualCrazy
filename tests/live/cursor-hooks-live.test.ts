/**
 * LIVE TEST — real forwarder script → real hook-receiver → cursor normalizer.
 *
 * Closest automated stand-in for "Cursor hooked itself":
 * this cloud/background agent VM does not invoke `.cursor/hooks.json` for our
 * own tool calls (dogfood 2026-07-21: zero invocations), but we CAN drive the
 * exact script Cursor would spawn with Cursor-shaped JSON on stdin.
 *
 * Important: the forwarder is spawned asynchronously. Using spawnSync against
 * an in-process HTTP server deadlocks (event loop blocked → curl waits → 2s
 * timeout → posts=0).
 *
 * Runs from `npm run test:live` (pre-push). No ~/.claude required.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHookReceiverCaptureTransport } from '../../src/capture/hook-receiver-transport';
import { createIncrementalParser } from '../../src/capture/incremental-parser';
import { cursorDriver } from '../../src/capture/drivers/cursor';
import { deriveState } from '../../src/shared/derive';
import type { CanonicalEvent } from '../../src/shared/schema';
import type { CaptureTransportSubscription } from '../../src/capture/capture-transport';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = path.join(ROOT, 'tests/fixtures/transcripts/cursor-hooks.jsonl');
const FORWARDER = path.join(ROOT, 'scripts/hooks/forward-to-shadow.sh');

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

function runForwarder(port: number, body: string): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(FORWARDER, [], {
      env: {
        ...process.env,
        SHADOW_HOOK_URL: `http://127.0.0.1:${port}/hook`,
        SHADOW_HOOK_SOURCE: 'cursor-hook'
      }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(body);
  });
}

async function waitFor(
  assertion: () => boolean,
  timeoutMs = 5_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (assertion()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

describe('LIVE: forwarder → hook-receiver → cursor driver', () => {
  let port = 0;
  let subscription: CaptureTransportSubscription | null = null;
  const events: CanonicalEvent[] = [];
  let posts = 0;

  beforeAll(async () => {
    port = await freePort();
    const parser = createIncrementalParser((entry) => {
      const sessionId =
        (typeof entry.conversation_id === 'string' && entry.conversation_id) ||
        'live-fixture';
      events.push(...cursorDriver.normalizeEntry(entry, sessionId, 'cursor-hook'));
    });

    const transport = createHookReceiverCaptureTransport({
      kind: 'hook-receiver',
      host: '127.0.0.1',
      port,
      defaultSource: 'cursor-hook'
    });
    subscription = await transport.start({
      getBackpressure: () => ({
        level: 'normal',
        shouldThrottle: false,
        totalRatio: 0,
        pendingWrites: 0
      }),
      onSessionStarted: () => undefined,
      onSessionReset: () => undefined,
      onChunk: ({ chunk }) => {
        posts += 1;
        parser.push(chunk);
      }
    });
  });

  afterAll(async () => {
    await subscription?.stop();
  });

  it('ingests every cursor-hooks fixture line through the real shell forwarder', async () => {
    const lines = readFileSync(FIXTURE, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    expect(lines.length).toBeGreaterThan(5);

    for (const line of lines) {
      const result = await runForwarder(port, line);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.trim()).toBe('{}');
    }

    await waitFor(() => posts >= lines.length);
    expect(posts).toBe(lines.length);
    expect(events.length).toBeGreaterThan(posts / 2);
    expect(events.every((event) => event.harnessId === 'cursor')).toBe(true);
    expect(events.some((event) => event.kind === 'session_started')).toBe(true);
    expect(events.some((event) => event.kind === 'tool_started')).toBe(true);
    expect(events.some((event) => event.kind === 'tool_failed')).toBe(true);
    expect(events.some((event) => event.kind === 'agent_spawned')).toBe(true);

    const state = deriveState(events);
    expect(state.transcript.length).toBeGreaterThan(0);
    expect(state.fileAttention.some((file) => file.filePath.includes('auth.ts'))).toBe(true);
    expect(state.agentNodes.length).toBeGreaterThan(0);

    console.log(
      `[live:cursor] OK posts=${posts} events=${events.length} ` +
        `phase=${state.activePhase} files=${state.fileAttention.length} ` +
        `risks=${state.riskSignals.length}`
    );
  });
});
