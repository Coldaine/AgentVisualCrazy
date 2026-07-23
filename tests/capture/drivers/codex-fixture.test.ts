/**
 * Codex driver fixture integration test (PR-2, plan-codex-replay.md D1).
 *
 * Streams the real PR-1 fixture (rollout-2026-07-23-homelab-coordinator.jsonl,
 * 3,677 lines) through createIncrementalParser + normalizeEntry and asserts
 * aggregate expectations derived from the fixture's format profile
 * (rollout-2026-07-23-homelab-coordinator.ground-truth.md) and the raw
 * type/payload.type counts verified against the fixture directly:
 *
 *   session_meta 1, response_item/reasoning 821, custom_tool_call(_output) 636
 *   each, function_call(_output) 110 each, task_started 15, task_complete 14,
 *   turn_aborted 1, event_msg/user_message 17.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createIncrementalParser } from '../../../src/capture/incremental-parser';
import { normalizeEntry } from '../../../src/capture/drivers/codex/normalizer';
import type { CanonicalEvent } from '../../../src/shared/schema';

const TEST_DIR = fileURLToPath(new URL('.', import.meta.url));
const FIXTURE_PATH = join(
  TEST_DIR,
  '../../fixtures/transcripts/codex/rollout-2026-07-23-homelab-coordinator.jsonl'
);
const SESSION_ID = '019f8ee7-e51f-7ed1-b650-b7fb11ffecda';

function normalizeFixture(): CanonicalEvent[] {
  const raw = readFileSync(FIXTURE_PATH, 'utf8');
  const events: CanonicalEvent[] = [];
  const parser = createIncrementalParser((entry) => {
    events.push(...normalizeEntry(entry, SESSION_ID));
  });
  parser.push(raw);
  return events;
}

describe('codex driver — fixture integration', () => {
  const events = normalizeFixture();

  it('produces a non-trivial event stream', () => {
    expect(events.length).toBeGreaterThan(1000);
  });

  it('stamps harnessId: "codex" on every event', () => {
    expect(events.every((e) => e.harnessId === 'codex')).toBe(true);
  });

  it('stamps driverVersion: "0.1.0" on every event', () => {
    expect(events.every((e) => e.driverVersion === '0.1.0')).toBe(true);
  });

  it('emits exactly 1 session_started event', () => {
    expect(events.filter((e) => e.kind === 'session_started')).toHaveLength(1);
  });

  it('the session_started event carries session_meta fields', () => {
    const started = events.find((e) => e.kind === 'session_started');
    expect(started?.payload).toMatchObject({
      originator: 'codex-tui',
      cliVersion: '0.145.0',
      modelProvider: 'openai',
    });
    expect(typeof started?.payload.cwd).toBe('string');
  });

  it('emits at least 17 user-actor messages (event_msg/user_message count)', () => {
    const userMessages = events.filter((e) => e.kind === 'message' && e.actor === 'user');
    expect(userMessages.length).toBeGreaterThanOrEqual(17);
  });

  it('emits 821 thinking messages (one per response_item/reasoning)', () => {
    const thinking = events.filter((e) => e.kind === 'message' && e.payload.thinking === true);
    expect(thinking).toHaveLength(821);
  });

  it('emits tool_started for every custom_tool_call and function_call (636 + 110)', () => {
    const started = events.filter((e) => e.kind === 'tool_started');
    expect(started).toHaveLength(636 + 110);
  });

  it('emits agent_spawned 15 times (task_started) and agent_completed 14 times (task_complete)', () => {
    expect(events.filter((e) => e.kind === 'agent_spawned')).toHaveLength(15);
    expect(events.filter((e) => e.kind === 'agent_completed')).toHaveLength(14);
  });

  it('emits exactly 1 agent_idle event with payload.aborted:true (the one turn_aborted)', () => {
    const idle = events.filter((e) => e.kind === 'agent_idle');
    expect(idle).toHaveLength(1);
    expect(idle[0]?.payload.aborted).toBe(true);
  });

  it('emits tool_completed/tool_failed for every _output/_end tool encoding', () => {
    // custom_tool_call_output(636) + function_call_output(110) +
    // patch_apply_end(34) + mcp_tool_call_end(35) + web_search_end(14)
    const completedOrFailed = events.filter(
      (e) => e.kind === 'tool_completed' || e.kind === 'tool_failed'
    );
    expect(completedOrFailed).toHaveLength(636 + 110 + 34 + 35 + 14);
  });

  it('rate-limits token_count to roughly 1 in 10 (770 raw lines)', () => {
    const snapshots = events.filter(
      (e) => e.kind === 'context_snapshot' && e.payload.compacted === undefined
    );
    // 770 / 10 == 77 exactly, given the deterministic every-10th sampler.
    expect(snapshots).toHaveLength(77);
  });

  it('emits context_snapshot for every context_compacted + top-level compacted (6 + 6)', () => {
    const compacted = events.filter(
      (e) => e.kind === 'context_snapshot' && e.payload.compacted === true
    );
    expect(compacted).toHaveLength(12);
  });

  it('preserves the single thread_goal_updated as a system message (not dropped)', () => {
    const goalUpdates = events.filter((e) => e.payload.goalUpdate === true);
    expect(goalUpdates).toHaveLength(1);
    expect(goalUpdates[0]?.actor).toBe('system');
    expect(goalUpdates[0]?.kind).toBe('message');
  });

  it('deduplicates the 17 user_message/response_item mirror pairs (no double-count)', () => {
    // response_item/message maps both role:user (54) and role:developer (5,
    // "injected user intent" per D1) to actor 'user' -> 59 response_item
    // user-actor messages. 17 of the role:user ones have a mirrored
    // event_msg/user_message; deduping means we see 59 total, not 59 + 17.
    const userMessages = events.filter((e) => e.kind === 'message' && e.actor === 'user');
    expect(userMessages).toHaveLength(59);
  });

  it('produces an identical ID sequence when the fixture is normalized twice', () => {
    const firstRun = normalizeFixture().map((e) => e.id);
    const secondRun = normalizeFixture().map((e) => e.id);
    expect(firstRun).toEqual(secondRun);
    expect(firstRun.length).toBe(events.length);
  });

  it('every event ID is unique within a single run', () => {
    const ids = events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
