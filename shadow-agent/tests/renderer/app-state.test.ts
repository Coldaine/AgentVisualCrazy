/**
 * App state-machine contract tests (issue #22).
 *
 * Tests the pure `appReducer` from app-state.ts without any React
 * or browser environment — satisfies the renderer state-machine
 * acceptance criterion.
 */
import { describe, expect, it } from 'vitest';
import type { SnapshotPayload } from '../../src/shared/schema';
import { appReducer, initialAppState, type AppState } from '../../src/renderer/app-state';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnapshot(overrides: Partial<SnapshotPayload> = {}): SnapshotPayload {
  return {
    source: { kind: 'fixture', label: 'test.jsonl' },
    record: {
      sessionId: 'test-session',
      title: 'Test Session',
      startedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:01:00.000Z',
      source: 'replay',
      eventCount: 5
    },
    state: {
      sessionId: 'test-session',
      title: 'Test Session',
      currentObjective: 'testing',
      activePhase: 'testing',
      agentNodes: [],
      timeline: [],
      transcript: [],
      fileAttention: [],
      riskSignals: [],
      nextMoves: [],
      shadowInsights: []
    },
    events: [],
    privacy: {
      allowRawTranscriptStorage: false,
      allowOffHostInference: false,
      processingMode: 'local-only',
      transcriptHandling: 'sanitized-by-default'
    },
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('appReducer — initial state', () => {
  it('starts with busy=booting, no error, no snapshot', () => {
    const state = initialAppState();
    expect(state.busy).toBe('booting');
    expect(state.error).toBeNull();
    expect(state.snapshot).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Boot flow
// ---------------------------------------------------------------------------

describe('appReducer — boot flow', () => {
  it('BOOT_START sets busy=booting and clears error', () => {
    const prior: AppState = { busy: null, error: 'old error', snapshot: null };
    const next = appReducer(prior, { type: 'BOOT_START' });
    expect(next.busy).toBe('booting');
    expect(next.error).toBeNull();
  });

  it('BOOT_SUCCESS sets snapshot and clears busy', () => {
    const prior: AppState = { busy: 'booting', error: null, snapshot: null };
    const snapshot = makeSnapshot();
    const next = appReducer(prior, { type: 'BOOT_SUCCESS', snapshot });
    expect(next.busy).toBeNull();
    expect(next.snapshot).toBe(snapshot);
    expect(next.error).toBeNull();
  });

  it('BOOT_ERROR clears busy and sets error message', () => {
    const prior: AppState = { busy: 'booting', error: null, snapshot: null };
    const next = appReducer(prior, { type: 'BOOT_ERROR', message: 'fixture failed' });
    expect(next.busy).toBeNull();
    expect(next.error).toBe('fixture failed');
    // snapshot is preserved from before (was null)
    expect(next.snapshot).toBeNull();
  });

  it('LIVE_UPDATE replaces snapshot, clears error, and preserves busy state', () => {
    const priorSnapshot = makeSnapshot({ source: { kind: 'fixture', label: 'fixture.jsonl' } });
    const liveSnapshot = makeSnapshot({ source: { kind: 'transcript', label: 'Live: session-1' } });
    const prior: AppState = { busy: null, error: 'old error', snapshot: priorSnapshot };

    const next = appReducer(prior, { type: 'LIVE_UPDATE', snapshot: liveSnapshot });

    expect(next.busy).toBeNull();
    expect(next.error).toBeNull();
    expect(next.snapshot).toBe(liveSnapshot);
  });
});

// ---------------------------------------------------------------------------
// Load (open replay) flow
// ---------------------------------------------------------------------------

describe('appReducer — load flow', () => {
  it('LOAD_START sets busy=loading and clears error', () => {
    const snapshot = makeSnapshot();
    const prior: AppState = { busy: null, error: 'prev error', snapshot };
    const next = appReducer(prior, { type: 'LOAD_START' });
    expect(next.busy).toBe('loading');
    expect(next.error).toBeNull();
    expect(next.snapshot).toBe(snapshot); // preserved
  });

  it('LOAD_SUCCESS replaces snapshot and clears busy', () => {
    const oldSnapshot = makeSnapshot({ source: { kind: 'fixture', label: 'old.jsonl' } });
    const newSnapshot = makeSnapshot({ source: { kind: 'replay', label: 'new.jsonl' } });
    const prior: AppState = { busy: 'loading', error: null, snapshot: oldSnapshot };
    const next = appReducer(prior, { type: 'LOAD_SUCCESS', snapshot: newSnapshot });
    expect(next.busy).toBeNull();
    expect(next.snapshot).toBe(newSnapshot);
  });

  it('LOAD_CANCELLED clears busy without changing snapshot or error', () => {
    const snapshot = makeSnapshot();
    const prior: AppState = { busy: 'loading', error: null, snapshot };
    const next = appReducer(prior, { type: 'LOAD_CANCELLED' });
    expect(next.busy).toBeNull();
    expect(next.snapshot).toBe(snapshot); // unchanged
    expect(next.error).toBeNull();       // unchanged
  });

  it('LOAD_ERROR clears busy and sets error, preserves snapshot', () => {
    const snapshot = makeSnapshot();
    const prior: AppState = { busy: 'loading', error: null, snapshot };
    const next = appReducer(prior, { type: 'LOAD_ERROR', message: 'parse failed' });
    expect(next.busy).toBeNull();
    expect(next.error).toBe('parse failed');
    expect(next.snapshot).toBe(snapshot); // preserved
  });
});

// ---------------------------------------------------------------------------
// Export flow
// ---------------------------------------------------------------------------

describe('appReducer — export flow', () => {
  it('EXPORT_START sets busy=exporting and clears error', () => {
    const snapshot = makeSnapshot();
    const prior: AppState = { busy: null, error: 'old', snapshot };
    const next = appReducer(prior, { type: 'EXPORT_START' });
    expect(next.busy).toBe('exporting');
    expect(next.error).toBeNull();
    expect(next.snapshot).toBe(snapshot);
  });

  it('EXPORT_SUCCESS clears busy and error', () => {
    const snapshot = makeSnapshot();
    const prior: AppState = { busy: 'exporting', error: null, snapshot };
    const next = appReducer(prior, { type: 'EXPORT_SUCCESS' });
    expect(next.busy).toBeNull();
    expect(next.error).toBeNull();
    expect(next.snapshot).toBe(snapshot); // unchanged
  });

  it('EXPORT_ERROR clears busy and sets error', () => {
    const snapshot = makeSnapshot();
    const prior: AppState = { busy: 'exporting', error: null, snapshot };
    const next = appReducer(prior, { type: 'EXPORT_ERROR', message: 'disk full' });
    expect(next.busy).toBeNull();
    expect(next.error).toBe('disk full');
    expect(next.snapshot).toBe(snapshot); // preserved
  });

  it('PRIVACY_UPDATE_SUCCESS updates snapshot privacy and clears busy', () => {
    const snapshot = makeSnapshot();
    const prior: AppState = { busy: 'privacy', error: null, snapshot };
    const next = appReducer(prior, {
      type: 'PRIVACY_UPDATE_SUCCESS',
      privacy: {
        allowRawTranscriptStorage: true,
        allowOffHostInference: true,
        processingMode: 'off-host-opted-in',
        transcriptHandling: 'sanitized-by-default'
      }
    });

    expect(next.busy).toBeNull();
    expect(next.error).toBeNull();
    expect(next.snapshot?.privacy.processingMode).toBe('off-host-opted-in');
    expect(next.snapshot?.privacy.allowRawTranscriptStorage).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------

describe('appReducer — invariants', () => {
  it('does not mutate the previous state object', () => {
    const prior: AppState = { busy: 'booting', error: null, snapshot: null };
    const frozen = Object.freeze(prior);
    expect(() => appReducer(frozen, { type: 'BOOT_SUCCESS', snapshot: makeSnapshot() })).not.toThrow();
  });

  it('error is cleared by every success action', () => {
    const snapshot = makeSnapshot();
    const withError: AppState = { busy: null, error: 'old error', snapshot: null };

    expect(appReducer(withError, { type: 'BOOT_SUCCESS', snapshot }).error).toBeNull();
    expect(appReducer(withError, { type: 'LOAD_SUCCESS', snapshot }).error).toBeNull();
    expect(appReducer(withError, { type: 'EXPORT_SUCCESS' }).error).toBeNull();
  });

  it('LOAD_CANCELLED does not clear an existing error', () => {
    const prior: AppState = { busy: 'loading', error: 'earlier error', snapshot: null };
    const next = appReducer(prior, { type: 'LOAD_CANCELLED' });
    // LOAD_CANCELLED only clears busy; pre-existing error is preserved
    expect(next.error).toBe('earlier error');
  });
});
