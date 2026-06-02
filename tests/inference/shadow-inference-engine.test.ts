import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInferenceEngine } from '../../src/inference/shadow-inference-engine';
import type { CanonicalEvent, DerivedState, EventQueueCheckpoint } from '../../src/shared/schema';
import type { ShadowInsight } from '../../src/shared/schema';
import type { EventBufferLike } from '../../src/inference/inference-client';
import { FakeInferenceClient } from '../helpers/fake-inference-client';
import { createTestLogger } from '../../src/shared/logger';

const FIXTURES = join(fileURLToPath(new URL('.', import.meta.url)), '../fixtures/replays');

function derivedState(overrides: Partial<DerivedState> = {}): DerivedState {
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
    ...overrides,
  };
}

function makeEvent(id: string, kind: CanonicalEvent['kind'] = 'message'): CanonicalEvent {
  return {
    id,
    sessionId: 'test-session',
    source: 'replay',
    timestamp: '2026-01-01T00:00:00.000Z',
    actor: 'assistant',
    kind,
    payload: {},
  };
}

function validResponse(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    phase: 'implementation',
    phaseConfidence: 0.85,
    riskLevel: 'low',
    riskSignals: [],
    predictedNextAction: 'Run tests',
    predictedNextConfidence: 0.7,
    observations: ['Agent created 3 files'],
    attention: { primaryFile: 'src/index.ts', intent: 'Add feature' },
    ...overrides,
  });
}

/**
 * Non-checkpoint event buffer: subscribers are called directly on push().
 */
class FakeEventBuffer implements EventBufferLike {
  protected _events: CanonicalEvent[] = [];
  private subscribers = new Set<(events: CanonicalEvent[]) => void>();

  async getAll(): Promise<CanonicalEvent[]> {
    return [...this._events];
  }

  async getRecent(n: number): Promise<CanonicalEvent[]> {
    return this._events.slice(-n);
  }

  get size(): number {
    return this._events.length;
  }

  subscribe(cb: (events: CanonicalEvent[]) => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  push(...events: CanonicalEvent[]): void {
    this._events.push(...events);
    for (const sub of this.subscribers) {
      sub(events);
    }
  }
}

/**
 * Checkpoint-capable event buffer: events are read via readPending().
 */
class FakeCheckpointBuffer extends FakeEventBuffer {
  consumerId?: string;
  lastOffset = -11;

  async registerConsumer(
    consumerId: string,
    _options?: { startAt?: 'latest' | 'earliest' }
  ): Promise<EventQueueCheckpoint> {
    this.consumerId = consumerId;
    return { consumerId, lastOffset: -1, updatedAt: new Date().toISOString() };
  }

  async readPending(
    consumerId: string,
    _limit?: number
  ): Promise<{
    consumerId: string;
    events: CanonicalEvent[];
    checkpoint: EventQueueCheckpoint;
    hasMore: boolean;
    truncated: boolean;
  }> {
    return {
      consumerId,
      events: this._events,
      checkpoint: { consumerId, lastOffset: this.lastOffset, updatedAt: new Date().toISOString() },
      hasMore: false,
      truncated: false,
    };
  }

  async commitCheckpoint(consumerId: string, eventId: string): Promise<EventQueueCheckpoint> {
    const idx = this._events.findIndex((e) => e.id === eventId);
    this.lastOffset = idx >= 0 ? idx : this.lastOffset;
    return { consumerId, lastOffset: this.lastOffset, updatedAt: new Date().toISOString() };
  }
}

describe('createInferenceEngine — orchestrator integration', () => {
  let client: FakeInferenceClient;

  beforeEach(() => {
    client = new FakeInferenceClient();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('triggers inference on tool_failed event and delivers insights', async () => {
    const onInsights = vi.fn();
    const buffer = new FakeEventBuffer();
    client.enqueue({
      text: validResponse(),
      model: 'fake/1',
      latencyMs: 5,
    });

    const engine = createInferenceEngine({
      buffer,
      getState: async () => derivedState({ activePhase: 'debugging' }),
      onInsights,
      client,
    });

    await engine.start();
    buffer.push(makeEvent('e1', 'message'), makeEvent('e2', 'tool_failed'));

    await vi.waitFor(() => {
      expect(client.calls.length).toBe(1);
    });

    expect(onInsights).toHaveBeenCalledOnce();
    const insights: ShadowInsight[] = onInsights.mock.calls[0]?.[0] ?? [];
    expect(insights.length).toBeGreaterThan(0);
    expect(insights.some((i) => i.kind === 'phase')).toBe(true);
    expect(insights.some((i) => i.kind === 'next_move')).toBe(true);
    engine.stop();
  });

  it('routes engine, trigger, and parser logs through an injected logger', async () => {
    const logger = createTestLogger();
    const onInsights = vi.fn();
    const buffer = new FakeEventBuffer();
    client.enqueue({
      text: 'not json at all',
      model: 'fake/1',
      latencyMs: 5,
    });

    const engineOptions = {
      buffer,
      getState: async () => derivedState({ activePhase: 'debugging' }),
      onInsights,
      client,
      logger,
    };
    const engine = createInferenceEngine(engineOptions);

    await engine.start();
    buffer.push(makeEvent('e1', 'tool_failed'));

    await vi.waitFor(() => {
      expect(client.calls.length).toBe(1);
    });
    engine.stop();

    expect(onInsights).not.toHaveBeenCalled();
    const eventNames = logger.getRecent(100).map((entry) => entry.event);
    expect(eventNames).toEqual(expect.arrayContaining([
      'engine.started',
      'trigger.fired',
      'engine.run_start',
      'response_parser.json_parse_failed',
      'engine.run_done',
      'engine.stopped',
    ]));
  });

  it('propagates inference errors gracefully and allows subsequent runs', async () => {
    const onInsights = vi.fn();
    const buffer = new FakeEventBuffer();
    client.enqueueError(new Error('Network failure'));
    client.enqueue({
      text: validResponse(),
      model: 'fake/1',
      latencyMs: 5,
    });

    const engine = createInferenceEngine({
      buffer,
      getState: async () => derivedState(),
      onInsights,
      client,
    });

    await engine.start();

    // First event triggers inference that fails
    buffer.push(makeEvent('e1', 'tool_failed'));
    await vi.waitFor(() => {
      expect(client.calls.length).toBe(1);
    });
    // No insights delivered on error
    expect(onInsights).not.toHaveBeenCalled();

    // Second event should run inference again
    buffer.push(makeEvent('e2', 'tool_failed'));
    await vi.waitFor(() => {
      expect(client.calls.length).toBe(2);
    });
    expect(onInsights).toHaveBeenCalledOnce();
    engine.stop();
  });

  it('does not run concurrent inferences (coalesce)', async () => {
    const onInsights = vi.fn();
    const buffer = new FakeEventBuffer();
    let resolveInference: (() => void) | null = null;
    const inferencePromise = new Promise<void>((resolve) => {
      resolveInference = resolve;
    });

    // First call blocks on inferencePromise
    client.enqueueFactory(async () => {
      await inferencePromise;
      return { text: validResponse(), model: 'fake/1', latencyMs: 5 };
    });
    // Second call (coalesced after first completes) returns immediately
    client.enqueue({
      text: validResponse(),
      model: 'fake/1',
      latencyMs: 5,
    });

    const engine = createInferenceEngine({
      buffer,
      getState: async () => derivedState(),
      onInsights,
      client,
    });

    await engine.start();

    // First trigger
    buffer.push(makeEvent('e1', 'tool_failed'));
    await vi.waitFor(() => {
      expect(client.calls.length).toBe(1);
    });

    // Second trigger while first is in-flight — should be queued
    buffer.push(makeEvent('e2', 'tool_failed'));
    // Client should still only have 1 call
    expect(client.calls.length).toBe(1);

    // Resolve first inference
    resolveInference!();
    await vi.waitFor(() => {
      expect(client.calls.length).toBe(2);
    });

    expect(onInsights).toHaveBeenCalledTimes(2);
    engine.stop();
  });

  it('uses frozen fixture events from replay fixtures', async () => {
    const fixturePath = join(FIXTURES, 'happy-path.replay.jsonl');
    const raw = readFileSync(fixturePath, 'utf8');
    const events: CanonicalEvent[] = raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CanonicalEvent);

    expect(events.length).toBeGreaterThan(0);

    const onInsights = vi.fn();
    const buffer = new FakeEventBuffer();
    client.enqueue({
      text: validResponse(),
      model: 'fake/1',
      latencyMs: 5,
    });

    const engine = createInferenceEngine({
      buffer,
      getState: async () => derivedState({ sessionId: 'happy-path' }),
      onInsights,
      client,
    });

    await engine.start();
    // Push fixture events; fire a tool_failed to trigger inference immediately
    buffer.push(...events);
    buffer.push(makeEvent('trigger-evt', 'tool_failed'));

    await vi.waitFor(() => {
      expect(client.calls.length).toBe(1);
    });
    expect(onInsights).toHaveBeenCalled();
    engine.stop();
  });

  it('uses checkpoint-based buffer when available', async () => {
    const onInsights = vi.fn();
    const buffer = new FakeCheckpointBuffer();
    client.enqueue({
      text: validResponse(),
      model: 'fake/1',
      latencyMs: 5,
    });

    const engine = createInferenceEngine({
      buffer,
      getState: async () => derivedState(),
      onInsights,
      client,
    });

    await engine.start();

    // Verify consumer was registered
    expect(buffer.consumerId).toBe('inference-trigger');

    // Push events and verify inference fires
    buffer.push(makeEvent('e1', 'message'), makeEvent('e2', 'tool_failed'));

    await vi.waitFor(() => {
      expect(client.calls.length).toBe(1);
    });
    expect(onInsights).toHaveBeenCalled();
    engine.stop();
  });
});
