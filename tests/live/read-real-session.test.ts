/**
 * LIVE TEST — runs the REAL read pipeline against whatever real session the
 * generic multi-driver discovery dispatcher finds newest on this machine
 * (Claude Code, Codex, or any other in-tree driver).
 *
 * Why this exists: every other test uses synthetic fixtures or mocks. None of
 * them read an actual local transcript, which is exactly why the
 * file-attention bug (args nested under payload.args) and the thinking-drop bug
 * survived — the 6-line happy-path fixture has neither at real scale. This test
 * exercises discoverActiveSession -> incremental parser -> the driver matching
 * the discovered session's source -> deriveState on whatever real session is
 * newest on this machine.
 *
 * Driver-aware by design (mirrors session-manager.ts's
 * `driverRegistry.getForSource(session.source) ?? driverRegistry.getDefault()`):
 * discoverActiveSession() dispatches across every registered driver's
 * DiscoveryStrategy, so the newest real session on a given machine may not be
 * a Claude Code one. Hardcoding the claude-code normalizer here would silently
 * feed a non-Claude entry shape through the wrong parser and fail with a
 * misleading "0 events" rather than actually exercising that harness's driver.
 *
 * It is NOT in CI (CI has no real session data). It runs from the pre-push
 * hook (`npm run test:live`) on a developer machine. When no real session
 * exists it SKIPS loudly — a skip means "couldn't run here", never a silent
 * pass.
 */
import { describe, it, beforeAll, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { discoverActiveSession } from '../../src/capture/session-discovery';
import { createIncrementalParser } from '../../src/capture/incremental-parser';
import { driverRegistry } from '../../src/capture/drivers';
import { deriveState } from '../../src/shared/derive';
import type { CanonicalEvent } from '../../src/shared/schema';

const FILE_KEYS = ['file_path', 'filePath', 'path'];
const VALID_PHASES = /^(observation|exploration|planning|implementation|validation)$/;

interface Probe {
  filePath: string;
  events: CanonicalEvent[];
  state: ReturnType<typeof deriveState>;
  rawFileToolCount: number;
  rawThinkingCount: number;
  harnessId: string;
}

let probe: Probe | null = null;
let skipReason = '';

beforeAll(async () => {
  const session = await discoverActiveSession();
  if (!session) {
    skipReason = 'discoverActiveSession() found no real session (no ~/.claude/projects, ~/.codex/sessions, etc. on this machine)';
    return;
  }

  // Driver-aware: discoverActiveSession() dispatches across every registered
  // driver, so route the discovered session's entries through the driver
  // that actually owns its source rather than assuming Claude Code.
  const driver = driverRegistry.getForSource(session.source) ?? driverRegistry.getDefault();

  const raw = readFileSync(session.filePath, 'utf8');
  const entries: Record<string, unknown>[] = [];
  const parser = createIncrementalParser((e) => entries.push(e));
  parser.push(raw.endsWith('\n') ? raw : raw + '\n');

  const events: CanonicalEvent[] = [];
  for (const entry of entries) {
    // Real JSONL is untrusted: only trust a string sessionId, else fall back.
    const entrySessionId = typeof entry.sessionId === 'string' ? entry.sessionId : session.sessionId;
    events.push(...driver.normalizeEntry(entry, entrySessionId, session.source));
  }
  const state = deriveState(events, 'live');

  // These two raw scans check Claude Code's specific on-disk shape
  // (message.content block array) — the historical bugs they guard against
  // were Claude-only. On a non-Claude session (e.g. Codex) neither pattern
  // matches, both counts land on 0, and the corresponding tests below skip
  // gracefully rather than asserting something meaningless for that harness.
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

  probe = {
    filePath: session.filePath,
    events,
    state,
    rawFileToolCount,
    rawThinkingCount,
    harnessId: driver.id,
  };
});

describe('LIVE: real session through the read pipeline', () => {
  it('discovers and reads a real session into canonical events', (ctx) => {
    if (!probe) {
      console.log(`[live] SKIP — ${skipReason}`);
      return ctx.skip();
    }
    console.log(`[live] discovered a ${probe.harnessId} session: ${probe.filePath}`);
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
