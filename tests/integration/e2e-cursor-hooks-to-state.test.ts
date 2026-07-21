/**
 * End-to-end: Cursor hook fixture → driver → buffer → derive.
 *
 * Companion to e2e-jsonl-to-state.test.ts (Claude). Proves the second harness
 * round-trips harnessId and produces glanceable DerivedState fields.
 */
import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { createEventBuffer, type EventBuffer } from '../../src/capture/event-buffer';
import { createIncrementalParser } from '../../src/capture/incremental-parser';
import { cursorDriver } from '../../src/capture/drivers/cursor';
import { deriveState } from '../../src/shared/derive';

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/transcripts/cursor-hooks.jsonl'
);

describe('end-to-end: cursor hooks fixture → derive', () => {
  const buffers: EventBuffer[] = [];
  const tmpRoots: string[] = [];

  afterEach(async () => {
    for (const buffer of buffers.splice(0)) {
      await buffer.clear();
    }
    for (const root of tmpRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('preserves cursor harnessId and yields file attention + transcript', async () => {
    const tmpRoot = mkdtempSync(path.join(tmpdir(), 'shadow-cursor-e2e-'));
    tmpRoots.push(tmpRoot);

    const buffer = createEventBuffer({
      persistenceRoot: tmpRoot,
      memoryCapacity: 200,
      totalCapacity: 500,
    });
    buffers.push(buffer);
    await buffer.setSession('conv-cursor-1');

    const parser = createIncrementalParser((entry) => {
      const events = cursorDriver.normalizeEntry(entry, 'conv-cursor-1', 'cursor-hook');
      if (events.length > 0) {
        void buffer.push(events);
      }
    });

    parser.push(readFileSync(FIXTURE, 'utf8'));
    // Allow async pushes to settle.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const events = await buffer.getAll();
    expect(events.length).toBeGreaterThan(5);
    expect(events.every((event) => event.harnessId === 'cursor')).toBe(true);
    expect(events.every((event) => event.source === 'cursor-hook')).toBe(true);

    const state = deriveState(events);
    expect(state.transcript.some((row) => row.text.includes('Auth middleware'))).toBe(true);
    expect(state.fileAttention.some((file) => file.filePath.includes('auth.ts'))).toBe(true);
    expect(state.agentNodes.length).toBeGreaterThan(0);
  });
});
