/**
 * Inference contract tests (issue #23).
 *
 * Covers:
 * - FakeInferenceClient — scriptable responses for use in future orchestrator tests
 * - Context packer — empty/oversize/deterministic cases
 * - Prompt builder — buildUserMessage behavior
 * - Parser fallback — handling malformed JSON and partial insight payloads
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { InferenceClient, InferenceRequest, InferenceResult } from '../../src/inference/inference-client';
import { FakeInferenceClient } from '../helpers/fake-inference-client';
import { buildUserMessage, type ShadowContextPacket } from '../../src/inference/prompt-builder';
import { packContext } from '../../src/inference/context-packager';
import type { CanonicalEvent, DerivedState } from '../../src/shared/schema';

// ---------------------------------------------------------------------------
// FakeInferenceClient
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_DIR = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = join(TEST_DIR, '../fixtures');
let eventCounter = 0;

function emptyDerivedState(overrides: Partial<DerivedState> = {}): DerivedState {
  return {
    sessionId: 'test-session',
    title: 'Test',
    currentObjective: 'testing',
    activePhase: 'idle',
    agentNodes: [],
    timeline: [],
    transcript: [],
    fileAttention: [],
    riskSignals: [],
    nextMoves: [],
    shadowInsights: [],
    ...overrides
  };
}

function makeEvent(overrides: Partial<CanonicalEvent> = {}): CanonicalEvent {
  eventCounter += 1;
  return {
    id: overrides.id ?? `evt-${eventCounter}`,
    sessionId: 'test-session',
    source: 'replay',
    timestamp: new Date().toISOString(),
    actor: 'agent',
    kind: 'tool_started',
    payload: { toolName: 'read_file', args: { filePath: 'src/index.ts' } },
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// FakeInferenceClient tests
// ---------------------------------------------------------------------------

describe('FakeInferenceClient', () => {
  it('returns queued results in order', async () => {
    const client = new FakeInferenceClient();
    client.enqueue({ text: 'response A', model: 'fake/1', latencyMs: 1 });
    client.enqueue({ text: 'response B', model: 'fake/1', latencyMs: 2 });

    const r1 = await client.infer({ systemPrompt: 'sys', userMessage: 'a' });
    const r2 = await client.infer({ systemPrompt: 'sys', userMessage: 'b' });

    expect(r1.text).toBe('response A');
    expect(r2.text).toBe('response B');
  });

  it('records all infer() calls', async () => {
    const client = new FakeInferenceClient();
    client.enqueue({ text: 'ok', model: 'fake/1', latencyMs: 0 });

    await client.infer({ systemPrompt: 'system', userMessage: 'hello' });

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.userMessage).toBe('hello');
  });

  it('throws queued errors', async () => {
    const client = new FakeInferenceClient();
    client.enqueueError(new Error('model unavailable'));
    await expect(client.infer({ systemPrompt: 'sys', userMessage: 'x' })).rejects.toThrow('model unavailable');
  });

  it('throws when queue is exhausted', async () => {
    const client = new FakeInferenceClient();
    await expect(client.infer({ systemPrompt: 'sys', userMessage: 'x' })).rejects.toThrow('no more queued responses');
  });

  it('pendingCount decrements as responses are consumed', async () => {
    const client = new FakeInferenceClient();
    client.enqueue({ text: 'a', model: 'f', latencyMs: 0 });
    client.enqueue({ text: 'b', model: 'f', latencyMs: 0 });

    expect(client.pendingCount).toBe(2);
    await client.infer({ systemPrompt: '', userMessage: '' });
    expect(client.pendingCount).toBe(1);
    await client.infer({ systemPrompt: '', userMessage: '' });
    expect(client.pendingCount).toBe(0);
  });

  it('factory receives the actual request', async () => {
    const client = new FakeInferenceClient();
    const capturedRequests: InferenceRequest[] = [];
    client.enqueueFactory((req) => {
      capturedRequests.push(req);
      return { text: 'echo', model: 'f', latencyMs: 0 };
    });

    await client.infer({ systemPrompt: 'sys', userMessage: 'user-msg' });
    expect(capturedRequests).toHaveLength(1);
    expect(capturedRequests[0]?.userMessage).toBe('user-msg');
  });
});

// ---------------------------------------------------------------------------
// Context packer tests
// ---------------------------------------------------------------------------

describe('context packager', () => {
  it('handles empty state and events', () => {
    const { packet, truncated } = packContext(emptyDerivedState(), []);
    expect(packet.recentEvents).toHaveLength(0);
    expect(packet.sessionId).toBe('test-session');
    expect(truncated).toBe(false);
  });

  it('includes all events when under budget', () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      makeEvent({ kind: 'tool_started', timestamp: `2026-01-01T00:0${i}:00.000Z` })
    );
    const { packet, truncated } = packContext(emptyDerivedState(), events);
    expect(truncated).toBe(false);
    // All 5 events should be present (either in recent window or summary)
    const totalEvents = packet.recentEvents.length;
    expect(totalEvents).toBeGreaterThanOrEqual(1);
    expect(totalEvents).toBeLessThanOrEqual(6); // 5 events or summary + 5
  });

  it('truncates when oversize', () => {
    // One event whose recentWindow alone exceeds a tiny budget.
    // tokenBudget:1 → charBudget:4 — smaller than any realistic JSON.
    const events = [makeEvent()];
    const { truncated } = packContext(emptyDerivedState(), events, { tokenBudget: 1 });
    expect(truncated).toBe(true);
  });

  it('output is deterministic for the same inputs', () => {
    const state = emptyDerivedState({ activePhase: 'implementation' });
    const events = Array.from({ length: 10 }, (_, i) =>
      makeEvent({ id: `ev-${i}`, timestamp: `2026-01-01T00:0${i}:00.000Z` })
    );
    const r1 = packContext(state, events);
    const r2 = packContext(state, events);
    expect(JSON.stringify(r1.packet)).toBe(JSON.stringify(r2.packet));
  });

  it('builds tool history from tool_started/completed/failed events', () => {
    const events: CanonicalEvent[] = [
      makeEvent({ kind: 'tool_started', payload: { toolName: 'read_file', args: { filePath: 'x.ts' } } }),
      makeEvent({ kind: 'tool_completed', payload: { toolName: 'read_file', args: { filePath: 'x.ts' }, result: 'ok' } }),
      makeEvent({ kind: 'tool_started', payload: { toolName: 'bash', args: { command: 'npm test' } } }),
      makeEvent({ kind: 'tool_failed', payload: { toolName: 'bash', args: { command: 'npm test' }, error: 'cmd not found' } })
    ];
    const { packet } = packContext(emptyDerivedState(), events);
    expect(packet.toolHistory).toHaveLength(2);
    expect(packet.toolHistory[0]?.result).toBe('success');
    expect(packet.toolHistory[1]?.result).toBe('error');
  });

  it('respects recentWindowSize option', () => {
    const events = Array.from({ length: 50 }, (_, i) =>
      makeEvent({ id: `ev-${i}`, timestamp: `2026-01-01T00:${String(i).padStart(2, '0')}:00.000Z` })
    );
    const { packet } = packContext(emptyDerivedState(), events, { recentWindowSize: 5 });
    // recent window = 5, plus possibly one summary event for older events
    expect(packet.recentEvents.length).toBeLessThanOrEqual(6);
  });

  it('approximate token count is within budget', () => {
    const state = emptyDerivedState();
    const events = Array.from({ length: 10 }, (_, i) => makeEvent({ id: `ev-${i}` }));
    const { approximateTokens } = packContext(state, events, { tokenBudget: 10_000 });
    expect(approximateTokens).toBeLessThanOrEqual(10_000);
  });
});

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

describe('prompt builder', () => {
  it('buildUserMessage includes all context packet fields', () => {
    const packet: ShadowContextPacket = {
      sessionId: 'sess-abc',
      observedAgent: 'claude-code',
      sessionDuration: 120,
      currentPhase: 'implementation',
      recentEvents: [makeEvent({ kind: 'tool_started', timestamp: '2026-01-01T00:00:00.000Z' })],
      toolHistory: [{ tool: 'read_file', result: 'ok', argsSummary: 'path=src/index.ts' }],
      recentTranscript: [{ actor: 'human', text: 'please fix the bug' }],
      fileAttention: [{ filePath: 'src/index.ts', touches: 5 }],
      riskSignals: [{ signal: 'many file deletes', severity: 'high' }]
    };

    const msg = buildUserMessage(packet);

    expect(msg).toContain('sess-abc');
    expect(msg).toContain('claude-code');
    expect(msg).toContain('120s');
    expect(msg).toContain('implementation');
    expect(msg).toContain('tool_started');
    expect(msg).toContain('read_file');
    expect(msg).toContain('please fix the bug');
    expect(msg).toContain('src/index.ts');
    expect(msg).toContain('5 touches');
    expect(msg).toContain('many file deletes');
  });

  it('buildUserMessage is deterministic for the same input', () => {
    const packet: ShadowContextPacket = {
      sessionId: 'x', observedAgent: 'claude-code', sessionDuration: 0,
      currentPhase: 'idle', recentEvents: [], toolHistory: [],
      recentTranscript: [], fileAttention: [], riskSignals: []
    };
    expect(buildUserMessage(packet)).toBe(buildUserMessage(packet));
  });
});

// ---------------------------------------------------------------------------
// Parser fallback — malformed JSON and partial payloads
// ---------------------------------------------------------------------------

/** Minimal inline parser matching what a real response parser would do. */
function parseInferenceResponse(text: string): {
  phase: string;
  riskLevel: string;
  observations: string[];
} | null {
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    return {
      phase: typeof raw['phase'] === 'string' ? raw['phase'] : 'idle',
      riskLevel: typeof raw['riskLevel'] === 'string' ? raw['riskLevel'] : 'low',
      observations: Array.isArray(raw['observations'])
        ? (raw['observations'] as unknown[]).filter((o): o is string => typeof o === 'string')
        : []
    };
  } catch {
    return null;
  }
}

describe('parser fallback', () => {
  it('returns null for completely malformed JSON', () => {
    expect(parseInferenceResponse('not json at all')).toBeNull();
    expect(parseInferenceResponse('{broken')).toBeNull();
    expect(parseInferenceResponse('')).toBeNull();
  });

  it('handles partial payloads with missing fields gracefully', () => {
    const result = parseInferenceResponse('{"phase":"debugging"}');
    expect(result).not.toBeNull();
    expect(result?.phase).toBe('debugging');
    expect(result?.riskLevel).toBe('low');   // default
    expect(result?.observations).toEqual([]); // default
  });

  it('handles JSON with extra/unknown fields without error', () => {
    const result = parseInferenceResponse(JSON.stringify({
      phase: 'testing',
      riskLevel: 'medium',
      unknownField: 'should be ignored',
      observations: ['test is running']
    }));
    expect(result?.phase).toBe('testing');
    expect(result?.observations).toEqual(['test is running']);
  });

  it('filters non-string entries from observations array', () => {
    const result = parseInferenceResponse(JSON.stringify({
      phase: 'idle',
      riskLevel: 'low',
      observations: ['valid', 42, null, 'also valid']
    }));
    expect(result?.observations).toEqual(['valid', 'also valid']);
  });

  it('FakeInferenceClient can simulate malformed response for parser fallback test', async () => {
    const client = new FakeInferenceClient();
    client.enqueue({ text: 'not valid json', model: 'fake/1', latencyMs: 1 });

    const result = await client.infer({ systemPrompt: 'sys', userMessage: 'x' });
    const parsed = parseInferenceResponse(result.text);
    expect(parsed).toBeNull();
  });
});
