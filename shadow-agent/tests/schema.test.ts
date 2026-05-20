/**
 * Schema contract tests — locks in the additive widening for the multi-harness
 * MVP refactor. See docs/plans/plan-multi-harness-mvp.md (PR 2).
 *
 * The changes under test:
 *   - `EventSource` is open (`string`) so new driver registries can register
 *     their own sources without modifying schema.ts.
 *   - `CanonicalEvent` gains optional `harnessId`, `driverVersion`,
 *     `correlationId` for harness identity.
 *   - `AgentNode` gains optional `harnessId` for per-harness palette accents.
 *
 * Backward compatibility: all new fields are optional; existing literal
 * `source` values keep working unchanged.
 */
import { describe, expect, it } from 'vitest';
import {
  KnownEventSources,
  type AgentNode,
  type CanonicalEvent,
  type EventSource,
  type KnownEventSource,
} from '../src/shared/schema';

describe('schema — EventSource widening', () => {
  it('KnownEventSources contains the four ship-tree sources', () => {
    expect(KnownEventSources).toEqual({
      claudeHook: 'claude-hook',
      claudeTranscript: 'claude-transcript',
      replay: 'replay',
      shadowRuntime: 'shadow-runtime',
    });
  });

  it('accepts each KnownEventSource literal', () => {
    const sources: KnownEventSource[] = [
      'claude-hook',
      'claude-transcript',
      'replay',
      'shadow-runtime',
    ];
    for (const s of sources) {
      const event: CanonicalEvent = makeEvent({ source: s });
      expect(event.source).toBe(s);
    }
  });

  it('accepts arbitrary driver source strings (open union)', () => {
    const future: EventSource = 'cursor-hook'; // not yet in KnownEventSources
    const event: CanonicalEvent = makeEvent({ source: future });
    expect(event.source).toBe('cursor-hook');
  });
});

describe('schema — CanonicalEvent harness identity fields', () => {
  it('accepts events without any harness fields (back-compat)', () => {
    const event: CanonicalEvent = makeEvent({});
    expect(event.harnessId).toBeUndefined();
    expect(event.driverVersion).toBeUndefined();
    expect(event.correlationId).toBeUndefined();
  });

  it('accepts events with harness identity fields populated', () => {
    const event: CanonicalEvent = makeEvent({
      harnessId: 'cursor',
      driverVersion: '0.2.1',
      correlationId: 'workspace:/home/user/project',
    });
    expect(event.harnessId).toBe('cursor');
    expect(event.driverVersion).toBe('0.2.1');
    expect(event.correlationId).toBe('workspace:/home/user/project');
  });
});

describe('schema — AgentNode harness identity', () => {
  it('accepts nodes without harnessId (back-compat)', () => {
    const node: AgentNode = {
      id: 'node-1',
      label: 'agent',
      state: 'active',
      toolCount: 0,
    };
    expect(node.harnessId).toBeUndefined();
  });

  it('accepts nodes with harnessId populated', () => {
    const node: AgentNode = {
      id: 'node-1',
      label: 'agent',
      harnessId: 'cursor',
      state: 'active',
      toolCount: 0,
    };
    expect(node.harnessId).toBe('cursor');
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
