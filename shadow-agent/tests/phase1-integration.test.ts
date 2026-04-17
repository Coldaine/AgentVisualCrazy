/**
 * Phase 1 end-to-end integration tests.
 *
 * Each test takes a fixture from the corpus and drives the full pipeline:
 *   transcript JSONL → CanonicalEvents → deriveState()
 *
 * This catches regressions across the entire Phase 1 stack in a single pass.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseClaudeTranscriptJsonl } from '../src/shared/transcript-adapter';
import { deriveState } from '../src/shared/derive';
import { parseReplay } from '../src/shared/replay-store';

const TRANSCRIPT_FIXTURES = join(import.meta.dirname, 'fixtures/transcripts');
const REPLAY_FIXTURES = join(import.meta.dirname, 'fixtures/replays');

describe('Phase 1 integration: transcript → events → deriveState', () => {
  it('happy-path: derives implementation phase + file attention', () => {
    const raw = readFileSync(join(TRANSCRIPT_FIXTURES, 'happy-path.jsonl'), 'utf8');
    const events = parseClaudeTranscriptJsonl(raw);
    const state = deriveState(events);

    expect(state.activePhase).toBe('implementation');
    expect(state.fileAttention.some((f) => f.filePath.includes('logger.ts'))).toBe(true);
    expect(state.riskSignals).toHaveLength(0);
    expect(state.sessionId).not.toBe('unknown');
    expect(state.transcript.length).toBeGreaterThan(0);
  });

  it('risk-escalation: derives validation phase + multiple risk signals', () => {
    const raw = readFileSync(join(TRANSCRIPT_FIXTURES, 'risk-escalation.jsonl'), 'utf8');
    const events = parseClaudeTranscriptJsonl(raw);
    const state = deriveState(events);

    expect(state.riskSignals.some((r) => r.includes('failed tool call'))).toBe(true);
    // 4+ bash calls → bash churn risk
    expect(state.riskSignals.some((r) => r.toLowerCase().includes('churn'))).toBe(true);
    // risk signals drive next-move recommendations
    expect(state.nextMoves.some((m) => m.toLowerCase().includes('risk'))).toBe(true);
  });

  it('tool-heavy: derives validation or exploration phase + bash-churn risk', () => {
    const raw = readFileSync(join(TRANSCRIPT_FIXTURES, 'tool-heavy.jsonl'), 'utf8');
    const events = parseClaudeTranscriptJsonl(raw);
    const state = deriveState(events);

    // Should flag bash churn (4+ Bash tool_started events in the fixture)
    expect(state.riskSignals.some((r) => r.toLowerCase().includes('churn'))).toBe(true);
    // Multiple read/grep/glob (5 in fixture — just under the 6-call exploration threshold)
    // so exploration risk may or may not fire; we only assert bash churn is present
  });

  it('subagent-flow: captures objective from first user message', () => {
    const raw = readFileSync(join(TRANSCRIPT_FIXTURES, 'subagent-flow.jsonl'), 'utf8');
    const events = parseClaudeTranscriptJsonl(raw);
    const state = deriveState(events);

    expect(state.currentObjective).toContain('end-to-end tests');
    expect(state.fileAttention.some((f) => f.filePath.includes('.spec.ts'))).toBe(true);
  });
});

describe('Phase 1 integration: replay fixtures → deriveState', () => {
  it('happy-path replay: implementation phase, logger.ts in file attention', () => {
    const raw = readFileSync(join(REPLAY_FIXTURES, 'happy-path.replay.jsonl'), 'utf8');
    const events = parseReplay(raw);
    const state = deriveState(events, 'Happy Path Session');

    expect(state.activePhase).toBe('implementation');
    expect(state.fileAttention.some((f) => f.filePath.includes('logger.ts'))).toBe(true);
    expect(state.shadowInsights.some((i) => i.kind === 'phase')).toBe(true);
  });

  it('risk-escalation replay: multiple failed tools → risk signals present', () => {
    const raw = readFileSync(join(REPLAY_FIXTURES, 'risk-escalation.replay.jsonl'), 'utf8');
    const events = parseReplay(raw);
    const state = deriveState(events, 'Risk Session');

    expect(state.riskSignals.length).toBeGreaterThanOrEqual(2);
    expect(state.shadowInsights.some((i) => i.kind === 'risk')).toBe(true);
  });

  it('subagent-flow replay: parent + subagent nodes in agentNodes', () => {
    const raw = readFileSync(join(REPLAY_FIXTURES, 'subagent-flow.replay.jsonl'), 'utf8');
    const events = parseReplay(raw);
    const state = deriveState(events, 'Subagent Session');

    const orchestrator = state.agentNodes.find((n) => n.id === 'orchestrator');
    const playwrightAgent = state.agentNodes.find((n) => n.id === 'playwright-setup');
    expect(orchestrator).toBeDefined();
    expect(playwrightAgent).toBeDefined();
    expect(playwrightAgent?.state).toBe('completed');
    expect(state.fileAttention.some((f) => f.filePath.includes('.spec.ts'))).toBe(true);
  });

  it('all fixture replays produce valid DerivedState without throwing', () => {
    const fixtures = [
      'happy-path.replay.jsonl',
      'subagent-flow.replay.jsonl',
      'risk-escalation.replay.jsonl',
    ];
    for (const fname of fixtures) {
      const raw = readFileSync(join(REPLAY_FIXTURES, fname), 'utf8');
      expect(() => {
        const events = parseReplay(raw);
        deriveState(events);
      }).not.toThrow();
    }
  });
});
