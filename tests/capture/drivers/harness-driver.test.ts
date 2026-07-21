/**
 * HarnessDriverRegistry and claude-code driver contract tests (PR 3).
 *
 * Verifies:
 * - Registry lookup by driver ID and by EventSource string
 * - Default driver fallback when source is unknown
 * - claude-code driver stamps harnessId on every emitted event
 * - claude-code driver handles known block types (text, tool_use, tool_result)
 * - claude-code driver returns empty array for unrecognised entries
 * - Legacy normalizer.ts shim re-exports the same function
 */
import { describe, expect, it } from 'vitest';
import {
  HarnessDriverRegistry,
  type HarnessDriver,
} from '../../../src/capture/drivers/harness-driver';
import { claudeCodeDriver } from '../../../src/capture/drivers/claude-code';
import { driverRegistry } from '../../../src/capture/drivers';
import { normalizeEntry as shimNormalizeEntry } from '../../../src/capture/normalizer';
import type { ParsedEntry } from '../../../src/capture/incremental-parser';

// ---------------------------------------------------------------------------
// HarnessDriverRegistry
// ---------------------------------------------------------------------------

describe('HarnessDriverRegistry', () => {
  it('registers a driver and retrieves it by id', () => {
    const reg = new HarnessDriverRegistry().register(claudeCodeDriver);
    expect(reg.get('claude-code')).toBe(claudeCodeDriver);
  });

  it('resolves driver by known EventSource', () => {
    const reg = new HarnessDriverRegistry().register(claudeCodeDriver);
    expect(reg.getForSource('claude-transcript')).toBe(claudeCodeDriver);
    expect(reg.getForSource('claude-hook')).toBe(claudeCodeDriver);
  });

  it('returns undefined for unregistered EventSource', () => {
    const reg = new HarnessDriverRegistry().register(claudeCodeDriver);
    expect(reg.getForSource('future-unknown-source')).toBeUndefined();
  });

  it('getDefault returns the first registered driver', () => {
    const reg = new HarnessDriverRegistry().register(claudeCodeDriver);
    expect(reg.getDefault()).toBe(claudeCodeDriver);
  });

  it('getDefault throws when registry is empty', () => {
    const reg = new HarnessDriverRegistry();
    expect(() => reg.getDefault()).toThrow('no registered drivers');
  });

  it('registeredIds lists all registered driver IDs', () => {
    const reg = new HarnessDriverRegistry().register(claudeCodeDriver);
    expect(reg.registeredIds).toContain('claude-code');
  });

  it('supports multiple drivers with non-overlapping source sets', () => {
    const fakeDriver: HarnessDriver = {
      id: 'cursor',
      sources: ['cursor-hook'],
      capabilities: {
        emitsSubagentEvents: false,
        fileAttention: 'tool-args',
        riskHeuristics: [],
      },
      normalizeEntry: () => [],
    };
    const reg = new HarnessDriverRegistry()
      .register(claudeCodeDriver)
      .register(fakeDriver);

    expect(reg.getForSource('claude-transcript')).toBe(claudeCodeDriver);
    expect(reg.getForSource('cursor-hook')).toBe(fakeDriver);
  });
});

// ---------------------------------------------------------------------------
// Singleton registry from drivers/index
// ---------------------------------------------------------------------------

describe('singleton driverRegistry', () => {
  it('has claude-code and cursor pre-seeded', () => {
    expect(driverRegistry.get('claude-code')).toBe(claudeCodeDriver);
    expect(driverRegistry.getForSource('claude-transcript')).toBe(claudeCodeDriver);
    expect(driverRegistry.getForSource('claude-hook')).toBe(claudeCodeDriver);
    expect(driverRegistry.getForSource('cursor-hook')?.id).toBe('cursor');
    expect(driverRegistry.getForSource('cursor-agent-trace')?.id).toBe('cursor');
  });

  it('falls back to claude-code for unknown source via getDefault', () => {
    expect(driverRegistry.getForSource('future-harness')).toBeUndefined();
    expect(driverRegistry.getDefault()).toBe(claudeCodeDriver);
  });
});

// ---------------------------------------------------------------------------
// claude-code driver — harnessId stamping
// ---------------------------------------------------------------------------

describe('claude-code driver — harnessId', () => {
  const SESSION = 'sess-1';

  it('stamps harnessId: "claude-code" on session_started events', () => {
    const entry: ParsedEntry = { type: 'session', cwd: '/home/user' };
    const events = claudeCodeDriver.normalizeEntry(entry, SESSION);
    expect(events).toHaveLength(1);
    expect(events[0]?.harnessId).toBe('claude-code');
    expect(events[0]?.kind).toBe('session_started');
  });

  it('stamps harnessId on plain text message events', () => {
    const entry: ParsedEntry = {
      message: { role: 'assistant', content: 'hello' }
    };
    const events = claudeCodeDriver.normalizeEntry(entry, SESSION);
    expect(events).toHaveLength(1);
    expect(events[0]?.harnessId).toBe('claude-code');
    expect(events[0]?.kind).toBe('message');
  });

  it('stamps harnessId on tool_use block events', () => {
    const entry: ParsedEntry = {
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', name: 'Read', id: 'tu-1', input: { file: 'x.ts' } }]
      }
    };
    const events = claudeCodeDriver.normalizeEntry(entry, SESSION);
    expect(events).toHaveLength(1);
    expect(events[0]?.harnessId).toBe('claude-code');
    expect(events[0]?.kind).toBe('tool_started');
  });

  it('stamps harnessId on tool_result block events (success)', () => {
    const entry: ParsedEntry = {
      message: {
        role: 'tool',
        content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: 'ok', is_error: false }]
      }
    };
    const events = claudeCodeDriver.normalizeEntry(entry, SESSION);
    expect(events).toHaveLength(1);
    expect(events[0]?.harnessId).toBe('claude-code');
    expect(events[0]?.kind).toBe('tool_completed');
  });

  it('stamps harnessId on tool_result block events (error)', () => {
    const entry: ParsedEntry = {
      message: {
        role: 'tool',
        content: [{ type: 'tool_result', tool_use_id: 'tu-1', content: 'bang', is_error: true }]
      }
    };
    const events = claudeCodeDriver.normalizeEntry(entry, SESSION);
    expect(events).toHaveLength(1);
    expect(events[0]?.harnessId).toBe('claude-code');
    expect(events[0]?.kind).toBe('tool_failed');
  });

  it('returns empty array for entries without a message and no cwd session', () => {
    const events = claudeCodeDriver.normalizeEntry({ some: 'random' }, SESSION);
    expect(events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// claude-code driver — source propagation
//
// The driver is registered for BOTH 'claude-transcript' and 'claude-hook'.
// session-manager must be able to pass the active CaptureSession.source
// through so hook-delivered events get stamped 'claude-hook' instead of
// being silently mislabelled 'claude-transcript'.
// ---------------------------------------------------------------------------

describe('claude-code driver — source propagation', () => {
  it('defaults source to claude-transcript when no source supplied', () => {
    const entry: ParsedEntry = { type: 'session', cwd: '/tmp' };
    const events = claudeCodeDriver.normalizeEntry(entry, 'sess-default');
    expect(events[0]?.source).toBe('claude-transcript');
  });

  it('stamps the supplied source on every emitted event (claude-hook)', () => {
    const entry: ParsedEntry = {
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'hi' },
          { type: 'tool_use', name: 'Read', id: 'tu-1', input: {} },
        ],
      },
    };
    const events = claudeCodeDriver.normalizeEntry(entry, 'sess-hook', 'claude-hook');
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.source === 'claude-hook')).toBe(true);
  });

  it('honours an arbitrary future EventSource string', () => {
    const entry: ParsedEntry = { type: 'session', cwd: '/x' };
    const events = claudeCodeDriver.normalizeEntry(entry, 'sess-x', 'claude-mcp');
    expect(events[0]?.source).toBe('claude-mcp');
  });
});

// ---------------------------------------------------------------------------
// Legacy shim backward compat
// ---------------------------------------------------------------------------

describe('legacy normalizer.ts shim', () => {
  it('re-exports the same normalizeEntry function as the claude-code driver', () => {
    const entry: ParsedEntry = { type: 'session', cwd: '/tmp' };
    const fromDriver = claudeCodeDriver.normalizeEntry(entry, 'sess-shim');
    const fromShim = shimNormalizeEntry(entry, 'sess-shim');
    // Same shape — IDs will differ (randomUUID) so compare kind + harnessId
    expect(fromShim).toHaveLength(fromDriver.length);
    expect(fromShim[0]?.kind).toBe(fromDriver[0]?.kind);
    expect(fromShim[0]?.harnessId).toBe('claude-code');
  });
});
