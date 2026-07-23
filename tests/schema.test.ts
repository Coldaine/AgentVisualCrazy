import { describe, expect, it } from 'vitest';
import { deriveState } from '../src/shared/derive';
import { parseReplay, serializeEvents } from '../src/shared/replay-store';
import { KnownEventSources, type CanonicalEvent } from '../src/shared/schema';

describe('schema runtime contracts', () => {
  it('exports the shipped source literals as unique runtime strings', () => {
    // schema.ts has no runtime validator, so this file only tests exported values and round trips.
    expect(KnownEventSources).toEqual({
      claudeHook: 'claude-hook',
      claudeTranscript: 'claude-transcript',
      codexRollout: 'codex-rollout',
      replay: 'replay',
      shadowRuntime: 'shadow-runtime',
    });
    expect(new Set(Object.values(KnownEventSources)).size).toBe(Object.keys(KnownEventSources).length);
  });

  it('replay serialization preserves open source strings and harness identity fields', () => {
    const events = [
      makeEvent({
        id: 'known-source',
        source: KnownEventSources.claudeTranscript,
      }),
      makeEvent({
        id: 'future-source',
        source: 'cursor-hook',
        harnessId: 'cursor',
        driverVersion: '0.2.1',
        correlationId: 'workspace:/repo',
      }),
    ];

    // The runtime contract is that persistence does not discard future harness metadata.
    const parsed = parseReplay(serializeEvents(events));
    expect(parsed.map((event) => event.source)).toEqual(['claude-transcript', 'cursor-hook']);
    expect(parsed[1]).toMatchObject({
      harnessId: 'cursor',
      driverVersion: '0.2.1',
      correlationId: 'workspace:/repo',
    });
  });

  it('deriveState carries harness identity from tool events onto renderer agent nodes', () => {
    const events = [
      makeEvent({
        kind: 'tool_started',
        actor: 'cursor-agent',
        source: 'cursor-hook',
        harnessId: 'cursor',
        payload: { toolName: 'read_file', args: { filePath: 'src/index.ts' } },
      }),
    ];

    // Renderer coloring depends on this runtime propagation, not on TypeScript accepting a field.
    expect(deriveState(events).agentNodes[0]).toMatchObject({
      id: 'cursor-agent',
      harnessId: 'cursor',
      toolCount: 1,
    });
  });
});

function makeEvent(overrides: Partial<CanonicalEvent>): CanonicalEvent {
  return {
    id: 'ev-1',
    sessionId: 'sess-1',
    source: 'claude-transcript',
    timestamp: '2026-05-20T00:00:00.000Z',
    actor: 'system',
    kind: 'message',
    payload: {},
    ...overrides,
  };
}
