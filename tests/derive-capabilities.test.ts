/**
 * Capability-driven derive contract tests (PR 5).
 *
 * Verifies that derive.ts dispatches behavior through HarnessDriverRegistry
 * rather than hardcoded branches. These tests mock the registry so they can
 * inject fake drivers with controlled capabilities without polluting the
 * singleton or requiring an unregister API.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { CanonicalEvent } from '../src/shared/schema';
import type { HarnessCapabilities, HarnessDriver } from '../src/capture/drivers/harness-driver';

// Hoist the mock setup so the registry stub exists before derive.ts imports it.
const { mockRegistry } = vi.hoisted(() => {
  return {
    mockRegistry: {
      drivers: new Map<string, HarnessDriver>(),
      sources: new Map<string, HarnessDriver>(),
      defaultDriverId: null as string | null,
      get(id: string) {
        return this.drivers.get(id);
      },
      getForSource(source: string) {
        return this.sources.get(source);
      },
      getDefault() {
        const driver = this.defaultDriverId ? this.drivers.get(this.defaultDriverId) : undefined;
        if (!driver) throw new Error('mock registry empty');
        return driver;
      },
      register(driver: HarnessDriver) {
        this.drivers.set(driver.id, driver);
        for (const source of driver.sources) this.sources.set(String(source), driver);
        if (this.defaultDriverId === null) this.defaultDriverId = driver.id;
        return this;
      },
      reset() {
        this.drivers.clear();
        this.sources.clear();
        this.defaultDriverId = null;
      },
    },
  };
});

vi.mock('../src/capture/drivers', () => ({
  driverRegistry: mockRegistry,
}));

// Import after the mock is in place.
const { deriveState } = await import('../src/shared/derive');

function makeCaps(overrides: Partial<HarnessCapabilities> = {}): HarnessCapabilities {
  return {
    emitsSubagentEvents: false,
    fileAttention: 'tool-args',
    riskHeuristics: [],
    ...overrides,
  };
}

function makeDriver(id: string, caps: HarnessCapabilities, sources: string[] = [`${id}-source`]): HarnessDriver {
  return {
    id,
    sources,
    capabilities: caps,
    normalizeEntry: () => [],
  };
}

let eventCounter = 0;
function makeEvent(overrides: Partial<CanonicalEvent>): CanonicalEvent {
  eventCounter += 1;
  return {
    id: `e-${eventCounter}`,
    sessionId: 'sess',
    source: 'replay',
    timestamp: `2026-01-01T00:00:${String(eventCounter).padStart(2, '0')}.000Z`,
    actor: 'assistant',
    kind: 'tool_started',
    payload: {},
    ...overrides,
  };
}

beforeEach(() => {
  mockRegistry.reset();
  eventCounter = 0;
});

// ---------------------------------------------------------------------------
// riskHeuristics gating
// ---------------------------------------------------------------------------

describe('derive — riskHeuristics gating', () => {
  it('emits no risk signals when the driver declares an empty heuristics list', () => {
    mockRegistry.register(makeDriver('quiet', makeCaps({ riskHeuristics: [] })));
    const events = [
      makeEvent({ harnessId: 'quiet', kind: 'tool_failed', payload: { toolName: 'Bash' } }),
      makeEvent({ harnessId: 'quiet', kind: 'tool_failed', payload: { toolName: 'Bash' } }),
    ];
    expect(deriveState(events).riskSignals).toEqual([]);
  });

  it('runs only the checks whose IDs the driver declares', () => {
    // Driver supports tool_failures but not shell_churn.
    mockRegistry.register(makeDriver('failures-only', makeCaps({
      riskHeuristics: ['tool_failures'],
    })));
    const events = [
      makeEvent({ harnessId: 'failures-only', kind: 'tool_failed', payload: { toolName: 'Bash' } }),
      ...Array.from({ length: 6 }, () =>
        makeEvent({ harnessId: 'failures-only', kind: 'tool_started', payload: { toolName: 'Bash' } })
      ),
    ];
    const risks = deriveState(events).riskSignals;
    expect(risks.some((r) => r.includes('failed tool call'))).toBe(true);
    // shell_churn (>=4 bash) would have fired in the legacy code, but the
    // driver doesn't claim that heuristic, so it must not appear.
    expect(risks.some((r) => r.toLowerCase().includes('churn'))).toBe(false);
  });

  it('unions heuristic IDs across multiple harnesses in one event batch', () => {
    mockRegistry.register(makeDriver('a', makeCaps({ riskHeuristics: ['tool_failures'] })));
    mockRegistry.register(makeDriver('b', makeCaps({ riskHeuristics: ['shell_churn'] })));
    const events = [
      makeEvent({ harnessId: 'a', kind: 'tool_failed', payload: { toolName: 'Read' } }),
      ...Array.from({ length: 4 }, () =>
        makeEvent({ harnessId: 'b', kind: 'tool_started', payload: { toolName: 'Bash' } })
      ),
    ];
    const risks = deriveState(events).riskSignals;
    expect(risks.some((r) => r.includes('failed tool call'))).toBe(true);
    expect(risks.some((r) => r.toLowerCase().includes('churn'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// toolNameMap
// ---------------------------------------------------------------------------

describe('derive — toolNameMap', () => {
  it('rewrites tool names before phase detection sees them', () => {
    // A driver whose Edit tool is named 'apply_patch' (Codex flavour).
    mockRegistry.register(makeDriver('codex', makeCaps({
      toolNameMap: (name) => (name === 'apply_patch' ? 'edit' : name),
    })));
    const events = [
      makeEvent({ harnessId: 'codex', kind: 'tool_started', payload: { toolName: 'apply_patch' } }),
    ];
    expect(deriveState(events).activePhase).toBe('implementation');
  });

  it('rewrites tool names before risk-heuristic shell_churn sees them', () => {
    // A driver whose shell tool is 'execute_command' — without mapping, the
    // shell_churn check (matches "bash") would never fire.
    mockRegistry.register(makeDriver('codex', makeCaps({
      riskHeuristics: ['shell_churn'],
      toolNameMap: (name) => (name === 'execute_command' ? 'bash' : name),
    })));
    const events = Array.from({ length: 4 }, () =>
      makeEvent({ harnessId: 'codex', kind: 'tool_started', payload: { toolName: 'execute_command' } })
    );
    expect(deriveState(events).riskSignals.some((r) => r.toLowerCase().includes('churn'))).toBe(true);
  });

  it('absence of toolNameMap leaves tool names lowercased only', () => {
    mockRegistry.register(makeDriver('plain', makeCaps()));
    const events = [
      makeEvent({ harnessId: 'plain', kind: 'tool_started', payload: { toolName: 'Write' } }),
    ];
    // 'write' triggers implementation; no rewriting required.
    expect(deriveState(events).activePhase).toBe('implementation');
  });
});

// ---------------------------------------------------------------------------
// fileAttention strategy
// ---------------------------------------------------------------------------

describe('derive — fileAttention strategy', () => {
  it("tool-args strategy extracts filePath from tool payload", () => {
    mockRegistry.register(makeDriver('claude-code', makeCaps({ fileAttention: 'tool-args' })));
    const events = [
      makeEvent({ harnessId: 'claude-code', kind: 'tool_started', payload: { toolName: 'Edit', filePath: 'src/x.ts' } }),
      makeEvent({ harnessId: 'claude-code', kind: 'tool_started', payload: { toolName: 'Read', file_path: 'src/y.ts' } }),
    ];
    const paths = deriveState(events).fileAttention.map((f) => f.filePath).sort();
    expect(paths).toEqual(['src/x.ts', 'src/y.ts']);
  });

  it("non-'tool-args' strategies do not extract from tool payloads", () => {
    // 'inferred-from-text' has no in-tree implementation; derive.ts must not
    // silently fall back to tool-args extraction or the capability flag
    // becomes meaningless.
    mockRegistry.register(makeDriver('aider-like', makeCaps({ fileAttention: 'inferred-from-text' })));
    const events = [
      makeEvent({ harnessId: 'aider-like', kind: 'tool_started', payload: { toolName: 'Edit', filePath: 'src/x.ts' } }),
    ];
    expect(deriveState(events).fileAttention).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// harnessId propagation onto AgentNode
// ---------------------------------------------------------------------------

describe('derive — harnessId on AgentNode', () => {
  it('stamps harnessId onto agent nodes derived from tool events', () => {
    mockRegistry.register(makeDriver('claude-code', makeCaps()));
    const events = [
      makeEvent({
        harnessId: 'claude-code',
        kind: 'tool_started',
        actor: 'assistant',
        payload: { toolName: 'Read', filePath: 'x.ts' },
      }),
    ];
    const nodes = deriveState(events).agentNodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.harnessId).toBe('claude-code');
  });

  it('stamps harnessId onto agent nodes derived from agent_spawned events', () => {
    mockRegistry.register(makeDriver('claude-code', makeCaps({ emitsSubagentEvents: true })));
    const events = [
      makeEvent({
        harnessId: 'claude-code',
        kind: 'agent_spawned',
        actor: 'subagent-1',
        payload: { label: 'Researcher' },
      }),
    ];
    const nodes = deriveState(events).agentNodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.harnessId).toBe('claude-code');
    expect(nodes[0]?.label).toBe('Researcher');
  });
});

// ---------------------------------------------------------------------------
// Fallback when no driver matches
// ---------------------------------------------------------------------------

describe('derive — capability fallback', () => {
  it('uses the registry default when an event has no matching harnessId or source', () => {
    mockRegistry.register(makeDriver('claude-code', makeCaps({
      riskHeuristics: ['tool_failures'],
    })));
    // Event has no harnessId, source 'replay' is not registered — must
    // fall back to the default driver (claude-code) and pick up its
    // riskHeuristics.
    const events = [
      makeEvent({ kind: 'tool_failed', payload: { toolName: 'Read' } }),
    ];
    expect(deriveState(events).riskSignals.some((r) => r.includes('failed tool call'))).toBe(true);
  });

  it('uses the static fallback heuristics when the registry is empty', () => {
    // Registry empty: derive must still emit risk signals using the
    // hardcoded fallback list so legacy fixtures keep working.
    const events = [
      makeEvent({ kind: 'tool_failed', payload: { toolName: 'Read' } }),
    ];
    expect(deriveState(events).riskSignals.some((r) => r.includes('failed tool call'))).toBe(true);
  });
});
