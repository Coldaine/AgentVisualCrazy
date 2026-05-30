/**
 * LIVE TEST — runs the REAL read pipeline against a REAL local Claude session.
 *
 * Why this exists: every other test uses synthetic fixtures or mocks. None of
 * them read an actual ~/.claude/projects transcript, which is exactly why the
 * file-attention bug (args nested under payload.args) and the thinking-drop bug
 * survived — the 6-line happy-path fixture has neither at real scale. This test
 * exercises discoverActiveSession -> incremental parser -> claude-code normalizer
 * -> deriveState on whatever real session is newest on this machine.
 *
 * It is NOT in CI (CI has no ~/.claude data). It runs from the pre-push hook
 * (`npm run test:live`) on a developer machine. When no real session exists it
 * SKIPS loudly — a skip means "couldn't run here", never a silent pass.
 */
import { describe, it, beforeAll, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { discoverActiveSession } from '../../src/capture/session-discovery';
import { createIncrementalParser } from '../../src/capture/incremental-parser';
import { normalizeEntry } from '../../src/capture/drivers/claude-code/normalizer';
import { deriveState } from '../../src/shared/derive';
import type { CanonicalEvent } from '../../src/shared/schema';

const CLAUDE_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const FILE_KEYS = ['file_path', 'filePath', 'path'];
const VALID_PHASES = /^(observation|exploration|planning|implementation|validation)$/;

interface Probe {
  filePath: string;
  events: CanonicalEvent[];
  state: ReturnType<typeof deriveState>;
  rawFileToolCount: number;
  rawThinkingCount: number;
}

let probe: Probe | null = null;
let skipReason = '';

beforeAll(async () => {
  if (!existsSync(CLAUDE_PROJECTS)) {
    skipReason = `no ${CLAUDE_PROJECTS} on this machine`;
    return;
  }
  const session = await discoverActiveSession();
  if (!session) {
    skipReason = 'discoverActiveSession() found no real session';
    return;
  }

  const raw = readFileSync(session.filePath, 'utf8');
  const entries: Record<string, unknown>[] = [];
  const parser = createIncrementalParser((e) => entries.push(e));
  parser.push(raw.endsWith('\n') ? raw : raw + '\n');

  const events: CanonicalEvent[] = [];
  for (const entry of entries) {
    events.push(...normalizeEntry(entry, (entry.sessionId as string) ?? session.sessionId));
  }
  const state = deriveState(events, 'live');

  let rawFileToolCount = 0;
  let rawThinkingCount = 0;
  for (const entry of entries) {
    const msg = entry.message as { content?: unknown } | undefined;
    if (!msg || !Array.isArray(msg.content)) continue;
    for (const block of msg.content as Array<Record<string, unknown>>) {
      if (block?.type === 'thinking') rawThinkingCount++;
      if (block?.type === 'tool_use') {
        const input = (block.input ?? {}) as Record<string, unknown>;
        if (FILE_KEYS.some((k) => typeof input[k] === 'string')) rawFileToolCount++;
      }
    }
  }

  probe = { filePath: session.filePath, events, state, rawFileToolCount, rawThinkingCount };
});

describe('LIVE: real Claude session through the read pipeline', () => {
  it('discovers and reads a real session into canonical events', (ctx) => {
    if (!probe) {
      console.log(`[live] SKIP — ${skipReason}`);
      return ctx.skip();
    }
    expect(probe.events.length).toBeGreaterThan(0);
    expect(probe.state.activePhase).toMatch(VALID_PHASES);
  });

  it('surfaces file attention when the session used file-targeting tools', (ctx) => {
    if (!probe) return ctx.skip();
    if (probe.rawFileToolCount === 0) {
      console.log('[live] no file-targeting tool calls in this session — nothing to assert');
      return ctx.skip();
    }
    // Regression guard: the live normalizer nests tool args under payload.args;
    // derive must read them. Before the fix this was permanently [].
    expect(probe.state.fileAttention.length).toBeGreaterThan(0);
  });

  it('captures thinking blocks instead of dropping them', (ctx) => {
    if (!probe) return ctx.skip();
    if (probe.rawThinkingCount === 0) {
      console.log('[live] no thinking blocks in this session — nothing to assert');
      return ctx.skip();
    }
    // Regression guard: the live normalizer had no branch for `thinking` blocks.
    const thinking = probe.events.filter((e) => e.kind === 'message' && e.payload.thinking === true);
    expect(thinking.length).toBeGreaterThan(0);
  });
});
