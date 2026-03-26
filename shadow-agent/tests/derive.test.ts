import { describe, expect, it } from 'vitest';
import { deriveState } from '../src/shared/derive';
import { paymentRefactorSession } from '../src/shared/fixtures/payment-refactor-session';

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
});
