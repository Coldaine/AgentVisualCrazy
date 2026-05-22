import { describe, it, expect } from 'vitest';
import { harnessDriverRegistry } from '../../src/capture/drivers';
import { claudeCodeDriver } from '../../src/capture/drivers/claude-code';
import type { HarnessDriver } from '../../src/capture/drivers/harness-driver';
import { deriveState } from '../../src/shared/derive';
import type { CanonicalEvent } from '../../src/shared/schema';
import { parseReplay } from '../../src/shared/replay-store';
import fs from 'node:fs';
import path from 'node:path';

describe('HarnessDriverRegistry', () => {
  it('seeds claude-code as the default driver', () => {
    const driver = harnessDriverRegistry.getDefault();
    expect(driver.id).toBe('claude-code');
    expect(driver.displayName).toBe('Claude Code');
  });

  it('returns undefined for an unknown harness', () => {
    expect(harnessDriverRegistry.get('nonexistent')).toBeUndefined();
  });

  it('lists all registered drivers', () => {
    const drivers = harnessDriverRegistry.list();
    expect(drivers.length).toBeGreaterThanOrEqual(1);
    expect(drivers.some((d) => d.id === 'claude-code')).toBe(true);
  });

  it('allows registering a new driver', () => {
    const fakeDriver: HarnessDriver = {
      id: 'test-harness',
      displayName: 'Test Harness',
      eventSource: 'replay',
      capabilities: {
        supportsSubagents: false,
        supportsThinking: false,
        supportsPermissions: false,
        transportKinds: ['file-tail']
      },
      discovery: { discoverActiveSession: async () => null },
      adapter: { parseEntry: () => [] },
      normalizer: {
        extractTimestamp: () => new Date().toISOString(),
        detectSessionStart: () => false
      }
    };

    harnessDriverRegistry.register(fakeDriver);
    expect(harnessDriverRegistry.get('test-harness')).toBe(fakeDriver);
  });
});

describe('Claude Code HarnessDriver', () => {
  it('has correct capabilities', () => {
    expect(claudeCodeDriver.capabilities).toEqual({
      supportsSubagents: true,
      supportsThinking: true,
      supportsPermissions: true,
      transportKinds: ['file-tail']
    });
  });

  it('has correct id and eventSource', () => {
    expect(claudeCodeDriver.id).toBe('claude-code');
    expect(claudeCodeDriver.eventSource).toBe('claude-transcript');
  });
});

describe('v1 replay fixture compatibility', () => {
  it('produces identical DerivedState from a v1 fixture (no harnessId)', () => {
    const fixturePath = path.resolve(
      __dirname,
      '../fixtures/replays/happy-path.replay.jsonl'
    );
    const raw = fs.readFileSync(fixturePath, 'utf8');
    const events = parseReplay(raw);

    // Simulate what v2 does: inject harnessId for events missing it
    const v2Events: CanonicalEvent[] = events.map((event) => ({
      ...event,
      harnessId: event.harnessId ?? 'claude-code'
    }));

    const v1State = deriveState(events, 'Happy Path');
    const v2State = deriveState(v2Events, 'Happy Path');

    // DerivedState should be identical regardless of harnessId
    expect(v2State.sessionId).toBe(v1State.sessionId);
    expect(v2State.activePhase).toBe(v1State.activePhase);
    expect(v2State.agentNodes).toEqual(v1State.agentNodes);
    expect(v2State.riskSignals).toEqual(v1State.riskSignals);
    expect(v2State.nextMoves).toEqual(v1State.nextMoves);
  });

  it('claude-code adapter parses a simple message entry', () => {
    const entry = {
      type: 'user',
      timestamp: '2026-04-01T10:00:00.000Z',
      message: {
        role: 'user',
        content: 'Hello, world'
      }
    };

    const events = claudeCodeDriver.adapter.parseEntry(entry, 'test-session', 'claude-code');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'message',
      actor: 'user',
      harnessId: 'claude-code',
      source: 'claude-transcript',
      sessionId: 'test-session'
    });
  });

  it('claude-code adapter parses a tool_use entry', () => {
    const entry = {
      type: 'assistant',
      timestamp: '2026-04-01T10:00:00.000Z',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            name: 'Read',
            id: 'toolu_01',
            input: { file_path: 'src/utils.ts' }
          }
        ]
      }
    };

    const events = claudeCodeDriver.adapter.parseEntry(entry, 'test-session', 'claude-code');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'tool_started',
      actor: 'assistant',
      harnessId: 'claude-code'
    });
    expect(events[0].payload).toMatchObject({
      toolName: 'Read',
      toolUseId: 'toolu_01'
    });
  });
});
