/**
 * Tests for the inference engine components.
 * Covers: auth credential loading, context packager, prompt builder,
 * response parser, and inference trigger.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseModelResponse } from '../src/inference/response-parser';
import { buildContextPacket } from '../src/inference/context-packager';
import { buildInferenceRequest } from '../src/inference/prompt-builder';
import { createInferenceTrigger } from '../src/inference/trigger';
import { SHADOW_SYSTEM_PROMPT } from '../src/inference/prompts';
import type { CanonicalEvent, DerivedState } from '../src/shared/schema';

// ── response parser ────────────────────────────────────────────────────────

describe('parseModelResponse', () => {
  it('parses a well-formed JSON response', () => {
    const response = JSON.stringify({
      phase: 'implementation',
      phaseConfidence: 0.85,
      phaseReason: 'Agent is editing TypeScript files.',
      riskLevel: 'low',
      riskSignals: [],
      predictedNextAction: 'Run tests',
      predictedNextConfidence: 0.7,
      observations: ['Agent created 3 files in the last 5 minutes.'],
      attention: { primaryFile: 'src/index.ts', intent: 'Add feature X' },
    });

    const insights = parseModelResponse(response);
    expect(insights.length).toBeGreaterThan(0);

    const phaseInsight = insights.find((i) => i.kind === 'phase');
    expect(phaseInsight).toBeDefined();
    expect(phaseInsight?.confidence).toBeCloseTo(0.85);

    const nextMoveInsight = insights.find((i) => i.kind === 'next_move');
    expect(nextMoveInsight?.summary).toBe('Run tests');

    const objectiveInsight = insights.find((i) => i.kind === 'objective');
    expect(objectiveInsight?.summary).toBe('Add feature X');

    const summaryInsight = insights.find((i) => i.kind === 'summary');
    expect(summaryInsight).toBeDefined();
  });

  it('handles markdown-fenced JSON', () => {
    const response = '```json\n{"phase":"exploration","phaseConfidence":0.6,"riskLevel":"low","riskSignals":[],"predictedNextAction":"","predictedNextConfidence":0.5,"observations":[],"attention":{"primaryFile":null,"intent":""}}\n```';
    const insights = parseModelResponse(response);
    expect(insights.some((i) => i.kind === 'phase')).toBe(true);
  });

  it('returns empty array for malformed JSON', () => {
    const insights = parseModelResponse('not valid json at all');
    expect(insights).toHaveLength(0);
  });

  it('handles missing optional fields gracefully', () => {
    const response = JSON.stringify({ phase: 'idle' });
    // Should not throw, may return partial insights
    expect(() => parseModelResponse(response)).not.toThrow();
  });

  it('clamps confidence to [0, 1]', () => {
    const response = JSON.stringify({
      phase: 'testing',
      phaseConfidence: 1.5, // out of range
      riskLevel: 'low',
      riskSignals: [],
      predictedNextAction: '',
      predictedNextConfidence: -0.3, // negative
      observations: [],
      attention: { primaryFile: null, intent: 'x' },
    });
    const insights = parseModelResponse(response);
    for (const insight of insights) {
      expect(insight.confidence).toBeGreaterThanOrEqual(0);
      expect(insight.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('maps each riskSignal to a risk insight', () => {
    const response = JSON.stringify({
      phase: 'debugging',
      phaseConfidence: 0.6,
      riskLevel: 'medium',
      riskSignals: [
        { signal: 'Repeated tool failures', severity: 'high', confidence: 0.8 },
        { signal: 'Long idle period', severity: 'low', confidence: 0.4 },
      ],
      predictedNextAction: '',
      predictedNextConfidence: 0.5,
      observations: [],
      attention: { primaryFile: null, intent: '' },
    });
    const riskInsights = parseModelResponse(response).filter((i) => i.kind === 'risk');
    expect(riskInsights).toHaveLength(2);
  });
});

// ── context packager ───────────────────────────────────────────────────────

describe('buildContextPacket', () => {
  const makeState = (): DerivedState => ({
    sessionId: 'sess-1',
    title: 'Test session',
    currentObjective: 'Fix bug',
    activePhase: 'debugging',
    agentNodes: [],
    timeline: [],
    transcript: [
      { id: 't1', actor: 'user', text: 'Do the thing', timestamp: '2024-01-01T00:00:00Z' },
    ],
    fileAttention: [{ filePath: 'src/foo.ts', touches: 3 }],
    riskSignals: ['Tool failed twice'],
    nextMoves: ['Run tests'],
    shadowInsights: [],
  });

  const makeEvent = (kind: CanonicalEvent['kind'], ts: string): CanonicalEvent => ({
    id: `e-${ts}`,
    kind,
    timestamp: ts,
    source: 'claude-transcript',
    sessionId: 'sess-1',
    actor: 'assistant',
    payload: {},
  });

  it('builds a packet with correct session metadata', () => {
    const state = makeState();
    const events: CanonicalEvent[] = [
      makeEvent('message', '2024-01-01T00:00:00Z'),
      makeEvent('tool_started', '2024-01-01T00:00:10Z'),
    ];

    const packet = buildContextPacket(state, events);
    expect(packet.sessionId).toBe('sess-1');
    expect(packet.currentPhase).toBe('debugging');
    expect(packet.observedAgent).toBe('claude-code');
    expect(packet.sessionDuration).toBeGreaterThanOrEqual(0);
  });

  it('limits recentEvents to last 30', () => {
    const state = makeState();
    const events = Array.from({ length: 50 }, (_, i) =>
      makeEvent('message', `2024-01-01T00:00:${String(i).padStart(2, '0')}Z`)
    );
    const packet = buildContextPacket(state, events);
    expect(packet.recentEvents.length).toBeLessThanOrEqual(30);
  });

  it('converts riskSignals strings to {signal, severity} objects', () => {
    const state = makeState();
    const packet = buildContextPacket(state, []);
    expect(packet.riskSignals).toHaveLength(1);
    expect(packet.riskSignals[0]).toMatchObject({ signal: 'Tool failed twice', severity: 'medium' });
  });
});

// ── prompt builder ─────────────────────────────────────────────────────────

describe('buildInferenceRequest', () => {
  it('returns systemPrompt matching SHADOW_SYSTEM_PROMPT', () => {
    const state: DerivedState = {
      sessionId: 'x',
      title: 'T',
      currentObjective: '',
      activePhase: 'idle',
      agentNodes: [],
      timeline: [],
      transcript: [],
      fileAttention: [],
      riskSignals: [],
      nextMoves: [],
      shadowInsights: [],
    };
    const packet = buildContextPacket(state, []);
    const request = buildInferenceRequest(packet);
    expect(request.systemPrompt).toBe(SHADOW_SYSTEM_PROMPT);
    expect(typeof request.userMessage).toBe('string');
    expect(request.userMessage.length).toBeGreaterThan(0);
  });

  it('is deterministic — same packet produces same output', () => {
    const state: DerivedState = {
      sessionId: 'y',
      title: 'T',
      currentObjective: 'Build widget',
      activePhase: 'implementation',
      agentNodes: [],
      timeline: [],
      transcript: [],
      fileAttention: [{ filePath: 'src/widget.ts', touches: 2 }],
      riskSignals: [],
      nextMoves: ['Add tests'],
      shadowInsights: [],
    };
    const packet = buildContextPacket(state, []);
    expect(buildInferenceRequest(packet)).toEqual(buildInferenceRequest(packet));
  });
});

// ── inference trigger ──────────────────────────────────────────────────────

describe('createInferenceTrigger', () => {
  const makeEvent = (kind: CanonicalEvent['kind'] = 'message'): CanonicalEvent => ({
    id: Math.random().toString(),
    kind,
    timestamp: new Date().toISOString(),
    source: 'claude-transcript',
    sessionId: 'sess',
    actor: 'assistant',
    payload: {},
  });

  it('fires immediately on tool_failed', () => {
    const cb = vi.fn();
    const trigger = createInferenceTrigger(cb);
    trigger.onEvents([makeEvent('tool_failed')]);
    expect(cb).toHaveBeenCalledTimes(1);
    trigger.stop();
  });

  it('fires immediately on agent_completed', () => {
    const cb = vi.fn();
    const trigger = createInferenceTrigger(cb);
    trigger.onEvents([makeEvent('agent_completed')]);
    expect(cb).toHaveBeenCalledTimes(1);
    trigger.stop();
  });

  it('fires when maxEventsBetween is exceeded', () => {
    const cb = vi.fn();
    const trigger = createInferenceTrigger(cb, { maxEventsBetween: 5, minEventsBetween: 100, timeBetweenMs: 9999999 });
    trigger.onEvents(Array.from({ length: 5 }, () => makeEvent()));
    expect(cb).toHaveBeenCalledTimes(1);
    trigger.stop();
  });

  it('does NOT fire when only minEvents met but time not elapsed', () => {
    const cb = vi.fn();
    const trigger = createInferenceTrigger(cb, {
      minEventsBetween: 2,
      timeBetweenMs: 999999,
      maxEventsBetween: 999,
    });
    trigger.onEvents([makeEvent(), makeEvent()]);
    expect(cb).not.toHaveBeenCalled();
    trigger.stop();
  });

  it('reset clears event count', () => {
    const cb = vi.fn();
    const trigger = createInferenceTrigger(cb, { maxEventsBetween: 3, minEventsBetween: 100, timeBetweenMs: 9999999 });
    trigger.onEvents([makeEvent(), makeEvent()]);
    trigger.reset();
    trigger.onEvents([makeEvent(), makeEvent()]);
    expect(cb).not.toHaveBeenCalled();
    trigger.stop();
  });
});
