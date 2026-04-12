import { describe, expect, it } from 'vitest';
import { buildFixtureSnapshot, createSnapshot, detectReplayFormat, inferTitle } from '../../src/electron/session-io';
import type { CanonicalEvent } from '../../src/shared/schema';

function event(overrides: Partial<CanonicalEvent>): CanonicalEvent {
  return {
    id: overrides.id ?? 'evt-1',
    sessionId: overrides.sessionId ?? 'session-1',
    source: overrides.source ?? 'replay',
    timestamp: overrides.timestamp ?? '2026-04-12T10:00:00.000Z',
    actor: overrides.actor ?? 'assistant',
    kind: overrides.kind ?? 'message',
    payload: overrides.payload ?? {}
  };
}

describe('session-io', () => {
  it('detects replay vs transcript input formats', () => {
    expect(detectReplayFormat('{"kind":"tool_started","actor":"assistant"}')).toBe('replay');
    expect(detectReplayFormat('{"sessionId":"abc","message":{"role":"assistant"}}')).toBe('transcript');
    expect(detectReplayFormat('not-json\n{"kind":"message","actor":"assistant"}')).toBe('replay');
    expect(detectReplayFormat('')).toBe('replay');
  });

  it('resolves title precedence correctly', () => {
    const withLabel = [
      event({ kind: 'message', actor: 'user', payload: { text: 'user text' } }),
      event({ id: 'evt-2', kind: 'session_started', payload: { label: 'Session Label' } })
    ];
    expect(inferTitle(withLabel, 'fallback')).toBe('Session Label');

    const withContextTitle = [event({ kind: 'context_snapshot', payload: { title: 'Context Title' } })];
    expect(inferTitle(withContextTitle, 'fallback')).toBe('Context Title');

    const withUserText = [event({ kind: 'message', actor: 'user', payload: { text: 'User Objective' } })];
    expect(inferTitle(withUserText, 'fallback')).toBe('User Objective');
  });

  it('builds snapshots from canonical events and fixture data', () => {
    const snapshot = createSnapshot(
      [
        event({ kind: 'session_started', payload: { label: 'Custom Session' } }),
        event({ id: 'evt-2', kind: 'message', actor: 'user', payload: { text: 'Ship capture pipeline' } }),
        event({ id: 'evt-3', kind: 'tool_started', payload: { toolName: 'Read', file_path: 'src/main.ts' } })
      ],
      { kind: 'replay', label: 'custom-replay' }
    );

    expect(snapshot.record.title).toBe('Custom Session');
    expect(snapshot.state.currentObjective).toBe('Ship capture pipeline');
    expect(snapshot.events).toHaveLength(3);
    expect(snapshot.state.fileAttention.some((file) => file.filePath === 'src/main.ts')).toBe(true);

    const fixture = buildFixtureSnapshot();
    expect(fixture.source.kind).toBe('fixture');
    expect(fixture.events.length).toBeGreaterThan(0);
  });
});
