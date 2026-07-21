/**
 * File-tail preserves DriverDiscoveredSession.source (and overrideSource)
 * so non-Claude JSONL is not mis-stamped as claude-transcript.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFileTailCaptureTransport } from '../../src/capture/transcript-watcher';
import { createCursorDiscovery } from '../../src/capture/drivers/cursor';
import { HarnessDriverRegistry } from '../../src/capture/drivers/harness-driver';
import { discoverActiveSession } from '../../src/capture/session-discovery';
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

describe('file-tail source attribution', () => {
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

  it('honors overrideSource for non-Claude JSONL override paths', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'file-tail-override-source-'));
    tmpRoots.push(root);
    const traceDir = path.join(root, '.agent-trace');
    mkdirSync(traceDir, { recursive: true });
    const trace = path.join(traceDir, 'traces.jsonl');
    writeFileSync(
      trace,
      `${JSON.stringify({
        role: 'assistant',
        content: 'trace line',
        timestamp: '2026-05-20T12:00:00.000Z'
      })}\n`
    );

    const sessions: CaptureSession[] = [];
    const transport = createFileTailCaptureTransport({
      kind: 'file-tail',
      overridePath: trace,
      overrideSource: 'cursor-agent-trace'
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
    expect(sessions[0]?.source).toBe('cursor-agent-trace');
    expect(sessions[0]?.path).toBe(trace);
  });

  it('dispatcher + cursor discovery return cursor-agent-trace for .agent-trace files', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'file-tail-discovery-source-'));
    tmpRoots.push(root);
    const traceDir = path.join(root, '.agent-trace');
    mkdirSync(traceDir, { recursive: true });
    const trace = path.join(traceDir, 'traces.jsonl');
    writeFileSync(trace, '{}\n');

    const discovered = await discoverActiveSession(undefined, {
      registry: new HarnessDriverRegistry().register({
        id: 'cursor',
        sources: ['cursor-agent-trace'],
        capabilities: {
          emitsSubagentEvents: true,
          fileAttention: 'tool-args',
          riskHeuristics: []
        },
        normalizeEntry: () => [],
        discovery: createCursorDiscovery({ searchRoots: [root] })
      })
    });

    expect(discovered).toMatchObject({
      filePath: trace,
      source: 'cursor-agent-trace'
    });
  });
});
