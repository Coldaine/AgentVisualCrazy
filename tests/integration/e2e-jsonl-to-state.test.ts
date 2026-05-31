/**
 * End-to-end integration gate (PR 4.5).
 *
 * The unit tests below this file in tests/capture/, tests/inference/, etc.
 * each verify ONE layer of the pipeline. This test verifies the layers
 * COMPOSE — proving the same byte-stream that a real Claude Code session
 * writes today flows through the real transport, parser, driver, event
 * buffer (including spill-to-disk + reload), and derive without losing
 * the harness identity stamp.
 *
 * Why this exists (test-grader's "biggest blind spot"):
 *   The whole multi-harness MVP rests on `harnessId` round-tripping from
 *   normalizer → buffer → derive → AgentNode. The unit tests never run
 *   that full pipe. This is the only test that does. If it goes red,
 *   the multi-harness palette accent in PR 7 silently won't work.
 *
 * Previously-logged finding, now FIXED:
 *   - The live normalizer puts file paths under `payload.args.file_path`, but
 *     `derive.ts extractFilePath()` used to only look at `payload.file_path`, so
 *     `fileAttention` was silently empty for live capture. extractFilePath now
 *     also reads `payload.args`, so live capture produces file attention too
 *     (asserted below).
 */
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { CanonicalEvent } from '../../src/shared/schema';
import { deriveState } from '../../src/shared/derive';
import { createEventBuffer, type EventBuffer } from '../../src/capture/event-buffer';
import { createIncrementalParser } from '../../src/capture/incremental-parser';
import { createFileTailCaptureTransport } from '../../src/capture/transcript-watcher';
import { claudeCodeDriver } from '../../src/capture/drivers/claude-code';
import type { CaptureTransportSubscription } from '../../src/capture/capture-transport';

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(TESTS_DIR, '../fixtures/transcripts/happy-path.jsonl');

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

describe('end-to-end: jsonl fixture → real pipeline → DerivedState', () => {
  const tmpRoots: string[] = [];
  const subscriptions: CaptureTransportSubscription[] = [];
  const buffers: EventBuffer[] = [];

  afterEach(async () => {
    for (const sub of subscriptions.splice(0)) {
      try {
        await sub.stop();
      } catch {
        /* ignore */
      }
    }
    for (const buffer of buffers.splice(0)) {
      try {
        await buffer.clear();
      } catch {
        /* ignore */
      }
    }
    for (const root of tmpRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('preserves harnessId through transport → spill → reload → derive', async () => {
    const tmpRoot = mkdtempSync(path.join(tmpdir(), 'shadow-e2e-'));
    tmpRoots.push(tmpRoot);

    const livePath = path.join(tmpRoot, 'live.jsonl');
    copyFileSync(FIXTURE, livePath);

    // memoryCapacity:2 forces 5 of the ~7 events to spill to disk, so the
    // round-trip JSON.stringify → readFile → JSON.parse path is exercised.
    const buffer = createEventBuffer({
      persistenceRoot: path.join(tmpRoot, 'queue'),
      memoryCapacity: 2,
      totalCapacity: 100,
    });
    buffers.push(buffer);
    await buffer.setSession('happy-path-e2e');

    const parser = createIncrementalParser((entry) => {
      const events = claudeCodeDriver.normalizeEntry(
        entry,
        'happy-path-e2e',
        'claude-transcript'
      );
      if (events.length) {
        void buffer.push(events);
      }
    });

    const transport = createFileTailCaptureTransport({
      kind: 'file-tail',
      overridePath: livePath,
      discoveryIntervalMs: 60_000,
    });

    const sub = await transport.start({
      getBackpressure: () => buffer.getBackpressure(),
      onSessionStarted: async () => undefined,
      onSessionReset: async () => undefined,
      onChunk: async ({ chunk }) => parser.push(chunk),
    });
    subscriptions.push(sub);

    // happy-path.jsonl produces session_started + 2 messages + 2 tool_started
    // + 2 tool_completed = 7 events (the user line is consumed as session_started
    // by the normalizer's early-return when cwd is present).
    await waitFor(async () => {
      const all = await buffer.getAll();
      return all.length >= 7;
    });

    const allEvents: CanonicalEvent[] = await buffer.getAll();

    // 1. Pipeline composes — we got events out.
    expect(allEvents.length).toBeGreaterThanOrEqual(7);

    // 2. Harness identity survives the full pipe (including spill+reload).
    //    This is THE assertion this test exists for.
    expect(allEvents.every((e) => e.harnessId === 'claude-code')).toBe(true);

    // 3. Source was set by the driver (not lost during spill).
    expect(allEvents.every((e) => e.source === 'claude-transcript')).toBe(true);

    // 4. Spill actually happened — prove the round-trip path was exercised
    //    by checking buffer metrics, not just the in-memory window.
    const metrics = buffer.getMetrics();
    expect(metrics.spilledDepth).toBeGreaterThan(0);

    // 5. Event kinds match the fixture shape.
    const kinds = allEvents.map((e) => e.kind);
    expect(kinds).toContain('session_started');
    expect(kinds).toContain('message');
    expect(kinds).toContain('tool_started');
    expect(kinds).toContain('tool_completed');

    // 6. Derive runs without crashing on a real pipeline's events.
    const state = deriveState(allEvents);

    // 7. Transcript surfaces the assistant messages.
    expect(state.transcript.length).toBeGreaterThan(0);
    const transcriptText = state.transcript.map((t) => t.text).join('\n');
    expect(transcriptText.toLowerCase()).toContain('logger');

    // 8. Phase detection ran on real tool names.
    expect(state.activePhase).toMatch(/exploration|implementation|idle/);

    // 9. fileAttention is populated from the live normalizer's payload.args.
    //    The fixture's Read targets src/utils.ts and Write targets src/logger.ts
    //    (one touch each; equal touches preserve first-seen order).
    expect(state.fileAttention).toEqual([
      { filePath: 'src/utils.ts', touches: 1 },
      { filePath: 'src/logger.ts', touches: 1 },
    ]);
  });
});
