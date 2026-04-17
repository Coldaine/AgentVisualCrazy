import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveState } from '../src/shared/derive';
import { paymentRefactorSession } from '../src/shared/fixtures/payment-refactor-session';
import { parseReplay } from '../src/shared/replay-store';
import type { CanonicalEvent } from '../src/shared/schema';

const REPLAY_FIXTURES = join(import.meta.dirname, 'fixtures/replays');

function makeEvent(
  kind: CanonicalEvent['kind'],
  overrides: Partial<CanonicalEvent> = {}
): CanonicalEvent {
  return {
    id: Math.random().toString(36).slice(2),
    sessionId: 'test-session',
    source: 'replay',
    timestamp: new Date().toISOString(),
    actor: 'assistant',
    kind,
    payload: {},
    ...overrides,
  };
}

describe('deriveState', () => {
  it('extracts phase, file attention, and next moves from replay events', () => {
    const state = deriveState(paymentRefactorSession, 'payment-refactor-session');

    expect(state.activePhase).toBe('implementation');
    expect(state.fileAttention.some((file) => file.filePath === 'src/services/payment-gateway.ts')).toBe(true);
    expect(state.nextMoves.length).toBeGreaterThan(0);
    expect(state.shadowInsights.some((insight) => insight.kind === 'phase')).toBe(true);
  });

  it('surfaces risk signals when tool failures occur', () => {
    const state = deriveState(paymentRefactorSession, 'payment-refactor-session');
    expect(state.riskSignals.some((risk) => risk.includes('failed tool call'))).toBe(true);
  });

  // ── empty / minimal state ─────────────────────────────────────────────────

  it('handles empty event array gracefully', () => {
    const state = deriveState([]);
    expect(state.sessionId).toBe('unknown');
    expect(state.activePhase).toBe('observation');
    expect(state.agentNodes).toHaveLength(0);
    expect(state.fileAttention).toHaveLength(0);
    expect(state.riskSignals).toHaveLength(0);
    expect(state.nextMoves.length).toBeGreaterThan(0);
  });

  it('uses custom title as initial objective', () => {
    const state = deriveState([], 'My Session Title');
    expect(state.title).toBe('My Session Title');
    expect(state.currentObjective).toBe('My Session Title');
  });

  it('captures first user message as currentObjective', () => {
    const events: CanonicalEvent[] = [
      makeEvent('session_started', { actor: 'system' }),
      makeEvent('message', { actor: 'user', payload: { text: 'Build the feature.' } }),
      makeEvent('message', { actor: 'assistant', payload: { text: 'OK.' } }),
    ];
    const state = deriveState(events, 'default title');
    expect(state.currentObjective).toBe('Build the feature.');
  });

  // ── phase detection priority ──────────────────────────────────────────────

  it('detects implementation phase when Write/Edit tools are used', () => {
    const events = [
      makeEvent('tool_started', { payload: { toolName: 'Write' } }),
      makeEvent('tool_started', { payload: { toolName: 'Read' } }),
    ];
    expect(deriveState(events).activePhase).toBe('implementation');
  });

  it('detects planning phase from TodoRead or Plan tools (not TodoWrite which contains "write")', () => {
    // 'TodoWrite' lowercased contains 'write' → implementation wins over planning
    // Use a pure plan-style name that doesn't trigger the write/edit check
    const events = [makeEvent('tool_started', { payload: { toolName: 'PlanCreate' } })];
    expect(deriveState(events).activePhase).toBe('planning');
  });

  it('detects validation phase from Bash tools (no write/plan tools)', () => {
    const events = [makeEvent('tool_started', { payload: { toolName: 'Bash' } })];
    expect(deriveState(events).activePhase).toBe('validation');
  });

  it('detects exploration phase from Read/Grep/Glob (no higher-priority tools)', () => {
    const events = [
      makeEvent('tool_started', { payload: { toolName: 'Grep' } }),
      makeEvent('tool_started', { payload: { toolName: 'Glob' } }),
    ];
    expect(deriveState(events).activePhase).toBe('exploration');
  });

  it('implementation > planning > validation > exploration precedence', () => {
    // All tool types present — Write should win
    const events = [
      makeEvent('tool_started', { payload: { toolName: 'Edit' } }),
      makeEvent('tool_started', { payload: { toolName: 'TodoWrite' } }),
      makeEvent('tool_started', { payload: { toolName: 'Bash' } }),
      makeEvent('tool_started', { payload: { toolName: 'Read' } }),
    ];
    expect(deriveState(events).activePhase).toBe('implementation');
  });

  // ── risk signals ──────────────────────────────────────────────────────────

  it('surfaces bash-churn risk when ≥4 bash calls', () => {
    const events = Array.from({ length: 4 }, () =>
      makeEvent('tool_started', { payload: { toolName: 'Bash' } })
    );
    const state = deriveState(events);
    expect(state.riskSignals.some((r) => r.toLowerCase().includes('churn'))).toBe(true);
  });

  it('does not flag bash churn for 3 bash calls', () => {
    const events = Array.from({ length: 3 }, () =>
      makeEvent('tool_started', { payload: { toolName: 'Bash' } })
    );
    const state = deriveState(events);
    expect(state.riskSignals.some((r) => r.toLowerCase().includes('churn'))).toBe(false);
  });

  it('surfaces exploration-volume risk when ≥6 read/grep/glob calls', () => {
    const tools = ['Read', 'Grep', 'Glob', 'Read', 'Grep', 'Glob'];
    const events = tools.map((t) => makeEvent('tool_started', { payload: { toolName: t } }));
    const state = deriveState(events);
    expect(state.riskSignals.some((r) => r.toLowerCase().includes('exploration'))).toBe(true);
  });

  // ── file attention ────────────────────────────────────────────────────────

  it('counts file attention using filePath payload key', () => {
    const events = [
      makeEvent('tool_started', { payload: { toolName: 'Read', filePath: 'src/foo.ts' } }),
      makeEvent('tool_completed', { payload: { toolName: 'Read', filePath: 'src/foo.ts' } }),
    ];
    const state = deriveState(events);
    const foo = state.fileAttention.find((f) => f.filePath === 'src/foo.ts');
    expect(foo?.touches).toBe(2);
  });

  it('counts file attention using file_path payload key', () => {
    const events = [
      makeEvent('tool_started', { payload: { toolName: 'Read', file_path: 'src/bar.ts' } }),
    ];
    const foo = deriveState(events).fileAttention.find((f) => f.filePath === 'src/bar.ts');
    expect(foo?.touches).toBe(1);
  });

  it('counts file attention using path payload key', () => {
    const events = [
      makeEvent('tool_started', { payload: { toolName: 'Read', path: 'src/baz.ts' } }),
    ];
    const foo = deriveState(events).fileAttention.find((f) => f.filePath === 'src/baz.ts');
    expect(foo?.touches).toBe(1);
  });

  it('sorts file attention descending by touch count', () => {
    const events = [
      makeEvent('tool_started', { payload: { toolName: 'Read', filePath: 'once.ts' } }),
      makeEvent('tool_started', { payload: { toolName: 'Read', filePath: 'thrice.ts' } }),
      makeEvent('tool_started', { payload: { toolName: 'Read', filePath: 'thrice.ts' } }),
      makeEvent('tool_started', { payload: { toolName: 'Read', filePath: 'thrice.ts' } }),
    ];
    const fa = deriveState(events).fileAttention;
    expect(fa[0]?.filePath).toBe('thrice.ts');
    expect(fa[1]?.filePath).toBe('once.ts');
  });

  // ── agent nodes ───────────────────────────────────────────────────────────

  it('tracks agent state transitions spawned→idle→completed', () => {
    const events = [
      makeEvent('agent_spawned', { actor: 'orchestrator', payload: { label: 'orchestrator' } }),
      makeEvent('agent_idle', { actor: 'orchestrator', payload: { label: 'orchestrator' } }),
      makeEvent('agent_completed', { actor: 'orchestrator', payload: { label: 'orchestrator' } }),
    ];
    const state = deriveState(events);
    const node = state.agentNodes.find((n) => n.id === 'orchestrator');
    expect(node?.state).toBe('completed');
  });

  it('increments toolCount when an agent uses tools', () => {
    const events = [
      makeEvent('agent_spawned', { actor: 'agent-1', payload: { label: 'agent-1' } }),
      makeEvent('tool_started', { actor: 'agent-1', payload: { toolName: 'Read' } }),
      makeEvent('tool_completed', { actor: 'agent-1', payload: { toolName: 'Read' } }),
    ];
    const node = deriveState(events).agentNodes.find((n) => n.id === 'agent-1');
    expect(node?.toolCount).toBe(2);
  });

  // ── fixture-based ─────────────────────────────────────────────────────────

  it('derives implementation phase from happy-path replay fixture', () => {
    const raw = readFileSync(join(REPLAY_FIXTURES, 'happy-path.replay.jsonl'), 'utf8');
    const events = parseReplay(raw);
    const state = deriveState(events);
    expect(state.activePhase).toBe('implementation');
    expect(state.fileAttention.some((f) => f.filePath === 'src/logger.ts')).toBe(true);
  });

  it('derives risk signals from risk-escalation replay fixture', () => {
    const raw = readFileSync(join(REPLAY_FIXTURES, 'risk-escalation.replay.jsonl'), 'utf8');
    const events = parseReplay(raw);
    const state = deriveState(events);
    expect(state.riskSignals.some((r) => r.includes('failed tool call'))).toBe(true);
    expect(state.riskSignals.some((r) => r.toLowerCase().includes('churn'))).toBe(true);
  });

  it('tracks parent/subagent nodes from subagent-flow replay fixture', () => {
    const raw = readFileSync(join(REPLAY_FIXTURES, 'subagent-flow.replay.jsonl'), 'utf8');
    const events = parseReplay(raw);
    const state = deriveState(events);
    expect(state.agentNodes.some((n) => n.id === 'orchestrator')).toBe(true);
    expect(state.agentNodes.some((n) => n.id === 'playwright-setup')).toBe(true);
  });
});
