import { describe, expect, it } from 'vitest';
import { buildRendererInput, canonicalEventRendererInputAdapter, inferRendererInputTitle } from '../../src/shared/renderer-input-adapter';
import type { CanonicalEvent } from '../../src/shared/schema';

function event(overrides: Partial<CanonicalEvent> = {}): CanonicalEvent {
  return {
    id: overrides.id ?? 'evt-1',
    sessionId: overrides.sessionId ?? 'session-1',
    source: overrides.source ?? 'replay',
    timestamp: overrides.timestamp ?? '2026-04-12T10:00:00.000Z',
    actor: overrides.actor ?? 'assistant',
    kind: overrides.kind ?? 'message',
    payload: overrides.payload ?? {},
    ...overrides
  };
}

describe('canonicalEventRendererInputAdapter', () => {
  it('exposes a stable adapter identity', () => {
    expect(canonicalEventRendererInputAdapter.id).toBe('canonical-event-renderer-input');
  });

  it('prefers session labels and user objectives when inferring the renderer title', () => {
    expect(
      inferRendererInputTitle(
        [
          event({ kind: 'message', actor: 'user', payload: { text: 'Ship the typed adapter contracts' } }),
          event({ id: 'evt-2', kind: 'session_started', payload: { label: 'Typed Adapter Work' } })
        ],
        'fallback'
      )
    ).toBe('Typed Adapter Work');

    expect(
      inferRendererInputTitle(
        [event({ kind: 'message', actor: 'user', payload: { text: 'Ship the typed adapter contracts' } })],
        'fallback'
      )
    ).toBe('Ship the typed adapter contracts');
  });

  it('builds renderer input with derived state and default privacy policy', () => {
    const snapshot = buildRendererInput(
      [
        event({ kind: 'session_started', payload: { label: 'Session Label' } }),
        event({
          id: 'evt-2',
          kind: 'message',
          actor: 'user',
          payload: { text: 'Ship capture pipeline for dev@example.com from D:\\_projects\\AgentVisualCrazy' }
        }),
        event({ id: 'evt-3', kind: 'tool_started', payload: { toolName: 'Read', file_path: 'src/main.ts' } })
      ],
      {
        source: { kind: 'replay', label: 'custom-replay' }
      }
    );

    expect(snapshot.record.title).toBe('Session Label');
    expect(snapshot.state.currentObjective).toBe('Ship capture pipeline for [redacted-email] from [redacted-path]');
    expect(snapshot.state.fileAttention).toEqual([{ filePath: 'src/main.ts', touches: 1 }]);
    expect(snapshot.events[1]?.payload).toEqual({
      text: 'Ship capture pipeline for [redacted-email] from [redacted-path]'
    });
    expect(snapshot.privacy).toEqual({
      allowRawTranscriptStorage: false,
      allowOffHostInference: false,
      processingMode: 'local-only',
      transcriptHandling: 'sanitized-by-default'
    });
  });
});
