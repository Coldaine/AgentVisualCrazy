import { describe, expect, it, vi } from 'vitest';
import type { CanonicalEvent, DerivedState } from '../../src/shared/schema';
import type { EventBufferLike } from '../../src/inference/inference-client';

const loadCredentialsMock = vi.hoisted(() => vi.fn().mockResolvedValue({}));

vi.mock('../../src/inference/auth', () => ({
  loadCredentials: loadCredentialsMock
}));

vi.mock('../../src/inference/inference-client-factory', () => ({
  createInferenceClient: vi.fn().mockResolvedValue(null)
}));

import { createInferenceEngine } from '../../src/inference/shadow-inference-engine';

class EmptyEventBuffer implements EventBufferLike {
  async getAll(): Promise<CanonicalEvent[]> {
    return [];
  }

  async getRecent(): Promise<CanonicalEvent[]> {
    return [];
  }

  get size(): number {
    return 0;
  }

  subscribe(): () => void {
    return () => {};
  }
}

function state(): DerivedState {
  return {
    sessionId: 'privacy-session',
    title: 'Privacy',
    currentObjective: 'Protect local transcripts',
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

describe('inference startup privacy gates', () => {
  it('does not load provider credentials while local-only processing is active', async () => {
    const engine = createInferenceEngine({
      buffer: new EmptyEventBuffer(),
      getState: state,
      onInsights: vi.fn(),
      privacy: {
        allowOffHostInference: false,
        allowRawTranscriptStorage: false
      }
    });

    await engine.start();

    expect(loadCredentialsMock).not.toHaveBeenCalled();
    engine.stop();
  });
});
