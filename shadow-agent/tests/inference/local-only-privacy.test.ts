import { describe, expect, it, vi } from 'vitest';
import type { CanonicalEvent, DerivedState } from '../../src/shared/schema';
import type { EventBufferLike } from '../../src/inference/inference-client';

const { loadCredentialsMock, createInferenceClientMock } = vi.hoisted(() => ({
  loadCredentialsMock: vi.fn(async () => undefined),
  createInferenceClientMock: vi.fn(async () => null)
}));

vi.mock('../../src/inference/auth', () => ({
  loadCredentials: loadCredentialsMock
}));

vi.mock('../../src/inference/inference-client-factory', () => ({
  createInferenceClient: createInferenceClientMock
}));

function derivedState(): DerivedState {
  return {
    sessionId: 'local-only-session',
    title: 'Local only',
    currentObjective: 'Observe locally',
    activePhase: 'observation',
    agentNodes: [],
    timeline: [],
    transcript: [],
    fileAttention: [],
    riskSignals: [],
    nextMoves: [],
    shadowInsights: []
  };
}

class FakeEventBuffer implements EventBufferLike {
  private readonly events: CanonicalEvent[] = [];

  async getAll(): Promise<CanonicalEvent[]> {
    return this.events;
  }

  async getRecent(): Promise<CanonicalEvent[]> {
    return this.events;
  }

  subscribe(): () => void {
    return () => undefined;
  }

  get size(): number {
    return this.events.length;
  }
}

describe('createInferenceEngine local-only privacy gate', () => {
  it('does not load credentials or create remote clients when off-host inference is disabled', async () => {
    const { createInferenceEngine } = await import('../../src/inference/shadow-inference-engine');
    const engine = createInferenceEngine({
      buffer: new FakeEventBuffer(),
      getState: derivedState,
      onInsights: vi.fn(),
      privacy: {
        allowOffHostInference: false,
        allowRawTranscriptStorage: false
      }
    });

    await engine.start();

    expect(loadCredentialsMock).not.toHaveBeenCalled();
    expect(createInferenceClientMock).not.toHaveBeenCalled();
    engine.stop();
  });
});
