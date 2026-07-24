import { describe, expect, it } from 'vitest';
import { buildContextPacket, packContext } from '../../src/inference/context-packager';
import { buildUserMessage } from '../../src/inference/prompt-builder';
import type { DerivedState } from '../../src/shared/schema';
import type { ExhibitArtifact } from '../../src/renderer/exhibits/types';

function state(): DerivedState {
  return {
    sessionId: 'sess',
    title: 'T',
    currentObjective: 'Observe',
    activePhase: 'debugging',
    agentNodes: [],
    timeline: [],
    transcript: [],
    fileAttention: [],
    riskSignals: [],
    nextMoves: [],
    shadowInsights: [],
  };
}

function narrative(id: string, overrides: Partial<ExhibitArtifact> = {}): ExhibitArtifact {
  return {
    id,
    exhibitType: 'activity_narrative',
    title: `Story ${id}`,
    narrative: `Why ${id} matters right now.`,
    relevance: 0.6,
    decayClass: 'medium',
    createdAtEvent: 1,
    status: 'active',
    payload: {
      threads: [{ id: 'plan', label: 'plan pivot' }],
      beats: [
        { at: '08:39', title: 'b1', body: 'x', side: 'top', thread: 'plan' },
        { at: '09:04', title: 'b2', body: 'y', side: 'bottom', thread: 'plan' },
      ],
    },
    ...overrides,
  } as ExhibitArtifact;
}

describe('context packager — THE GALLERY section', () => {
  it('serializes each active exhibit with envelope + one-line payload summary', () => {
    const packet = buildContextPacket(state(), [], {
      gallery: [narrative('a'), narrative('b', { relevance: 0.9 })],
    });
    expect(packet.gallery).toHaveLength(2);
    // Sorted by relevance (b first).
    expect(packet.gallery!.map((g) => g.id)).toEqual(['b', 'a']);
    expect(packet.gallery![0].payloadSummary).toContain('2 beats across threads: plan pivot');
  });

  it('includes retired-this-session ids + reasons', () => {
    const packet = buildContextPacket(state(), [], {
      gallery: [narrative('a')],
      retiredGallery: [{ id: 'old', reason: 'Superseded by the recovery walkthrough.' }],
    });
    expect(packet.retiredGallery).toEqual([{ id: 'old', reason: 'Superseded by the recovery walkthrough.' }]);
  });

  it('caps the gallery at ~15% of the token budget — drops payload summaries when over', () => {
    // Many exhibits with long narratives blow the full-entry budget.
    const big = Array.from({ length: 30 }, (_, i) =>
      narrative(`x${i}`, { narrative: 'A deliberately long interpretive narrative. '.repeat(12) })
    );
    const { packet } = packContext(state(), [], { gallery: big, tokenBudget: 2_000 });
    // Over budget → envelope-only mode: no payload summaries survive.
    expect(packet.gallery!.every((g) => g.payloadSummary === undefined)).toBe(true);
    // And the section itself stays within the 15% cap.
    const cap = Math.floor(2_000 * 0.15);
    const sectionTokens = Math.ceil(
      JSON.stringify({ gallery: packet.gallery, retiredGallery: packet.retiredGallery ?? [] }).length / 4
    );
    expect(sectionTokens).toBeLessThanOrEqual(cap);
  });

  it('prioritizes the most relevant exhibits when pruning to fit', () => {
    const big = Array.from({ length: 40 }, (_, i) =>
      narrative(`x${i}`, { relevance: i / 40, narrative: 'long narrative '.repeat(20) })
    );
    const { packet } = packContext(state(), [], { gallery: big, tokenBudget: 1_500 });
    const ids = packet.gallery!.map((g) => g.id);
    // Whatever survived, the highest-relevance exhibit (x39) must be among them.
    expect(ids).toContain('x39');
    // The lowest-relevance exhibit (x0) must have been pruned first.
    expect(ids).not.toContain('x0');
  });
});

describe('prompt builder — gallery rendering', () => {
  it('renders THE GALLERY and Retired sections in the user message', () => {
    const packet = buildContextPacket(state(), [], {
      gallery: [narrative('a')],
      retiredGallery: [{ id: 'old', reason: 'Cold now.' }],
    });
    const message = buildUserMessage(packet);
    expect(message).toContain('--- THE GALLERY (1) ---');
    expect(message).toContain('[activity_narrative] a "Story a"');
    expect(message).toContain('narrative: Why a matters right now.');
    expect(message).toContain('--- Retired this session (1) ---');
    expect(message).toContain('old: Cold now.');
  });
});
