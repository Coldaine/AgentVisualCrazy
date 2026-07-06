import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { createDatabase, type ShadowDatabase } from '../../src/db/database';
import { createShadowRuntime } from '../../src/shadow/shadow-runtime';
import { getAllTools } from '../../src/shadow/tools/index';
import type { InferenceClient, InferenceRequest, InferenceResult } from '../../src/inference/inference-client';

let db: ShadowDatabase;
let cleanupDir: string;

beforeAll(() => {
  cleanupDir = mkdtempSync(join(tmpdir(), 'shadow-agent-rt-test-'));
  db = createDatabase(join(cleanupDir, 'test.sqlite'));
  db.saveSession({
    sessionId: 'shadow-rt-session',
    title: 'RT Test',
    startedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T01:00:00.000Z',
    source: 'replay', eventCount: 3,
  });
  db.insertEvents([
    { id: 'e1', sessionId: 'shadow-rt-session', source: 'claude-hook', timestamp: '2026-01-01T00:00:00.000Z', actor: 'system', kind: 'session_started', payload: {} },
    { id: 'e2', sessionId: 'shadow-rt-session', source: 'claude-hook', timestamp: '2026-01-01T00:05:00.000Z', actor: 'user', kind: 'message', payload: { text: 'hello' } },
    { id: 'e3', sessionId: 'shadow-rt-session', source: 'claude-hook', timestamp: '2026-01-01T00:10:00.000Z', actor: 'agent', kind: 'tool_started', payload: { toolName: 'read' } },
  ]);
});

afterAll(() => {
  db.close();
  rmSync(cleanupDir, { recursive: true, force: true });
});

function createFakeClient(toolCallsToMake: number): InferenceClient {
  let callCount = 0;
  return {
    id: 'fake-test',
    provider: 'fake' as const,
    async infer(_request: InferenceRequest): Promise<InferenceResult> {
      callCount++;
      if (callCount <= toolCallsToMake) {
        return {
          text: '',
          model: 'fake',
          latencyMs: 0,
          toolCalls: [
            {
              id: `tc-${callCount}`,
              name: 'read_session_continuity',
              arguments: { sessionId: 'shadow-rt-session' },
            },
          ],
        };
      }
      return {
        text: 'Final analysis: The session appears to be in exploration phase.',
        model: 'fake',
        latencyMs: 0,
      };
    },
  };
}

describe('ShadowRuntime', () => {
  it('creates a runtime with correct session ID', () => {
    const client = createFakeClient(0);
    const runtime = createShadowRuntime({ db, sessionId: 'shadow-rt-session', client });
    expect(runtime.getSessionId()).toBe('shadow-rt-session');
  });

  it('runs inference without tool calls and returns text', async () => {
    const client = createFakeClient(0);
    const runtime = createShadowRuntime({ db, sessionId: 'shadow-rt-session', client });
    const result = await runtime.run({
      systemPrompt: 'You are a helpful analyst.',
      userMessage: 'Analyze the current session.',
    });
    expect(result.finalText).toContain('exploration');
    expect(result.toolCallsExecuted).toBe(0);
    expect(result.iterations).toBe(1);
  });

  it('executes tool calls and continues until no more tool calls', async () => {
    const client = createFakeClient(2);
    const runtime = createShadowRuntime({ db, sessionId: 'shadow-rt-session', client });
    const result = await runtime.run({
      systemPrompt: 'You are a helpful analyst.',
      userMessage: 'Analyze the current session. Use tools as needed.',
    });
    expect(result.toolCallsExecuted).toBe(2);
    expect(result.iterations).toBe(3);
    expect(result.finalText).toContain('exploration');
  });

  it('stops at max iterations', async () => {
    const client = {
      id: 'fake-test',
      provider: 'fake' as const,
      async infer(_request: InferenceRequest): Promise<InferenceResult> {
        return {
          text: '',
          model: 'fake',
          latencyMs: 0,
          toolCalls: [
            {
              id: 'tc-loop',
              name: 'read_session_continuity',
              arguments: { sessionId: 'shadow-rt-session' },
            },
          ],
        };
      },
    };
    const runtime = createShadowRuntime({ db, sessionId: 'shadow-rt-session', client });
    const result = await runtime.run({
      systemPrompt: 'You are a helpful analyst.',
      userMessage: 'Keep calling tools.',
    });
    expect(result.iterations).toBe(10);
    expect(result.toolCallsExecuted).toBe(10);
  });
});

describe('Tool Registry', () => {
  it('registers all 6 tools', () => {
    const tools = getAllTools();
    expect(tools).toHaveLength(6);
    const names = tools.map((t) => t.name);
    expect(names).toContain('read_session_continuity');
    expect(names).toContain('read_event_window');
    expect(names).toContain('read_active_patterns');
    expect(names).toContain('write_interpretation');
    expect(names).toContain('write_presentation');
    expect(names).toContain('select_pattern');
  });

  it('each tool has valid parameters schema', () => {
    const tools = getAllTools();
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeDefined();
    }
  });

  it('read_session_continuity returns session data', () => {
    const tool = getAllTools().find((t) => t.name === 'read_session_continuity')!;
    const result = tool.execute(
      { db, sessionId: 'shadow-rt-session' },
      { sessionId: 'shadow-rt-session' },
    );
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.title).toBe('RT Test');
    expect(data.eventCount).toBe(3);
  });

  it('read_event_window returns events', () => {
    const tool = getAllTools().find((t) => t.name === 'read_event_window')!;
    const result = tool.execute(
      { db, sessionId: 'shadow-rt-session' },
      { sessionId: 'shadow-rt-session', limit: 10 },
    );
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect((data.events as Array<unknown>)).toHaveLength(3);
  });

  it('write_interpretation writes to database', () => {
    const tool = getAllTools().find((t) => t.name === 'write_interpretation')!;
    const result = tool.execute(
      { db, sessionId: 'shadow-rt-session' },
      { kind: 'summary', summary: 'Test summary', confidence: 0.85, scope: 'session' },
    );
    expect(result.success).toBe(true);
    const insights = db.getInterpretations('shadow-rt-session');
    expect(insights.some((i) => i.summary === 'Test summary')).toBe(true);
  });

  it('write_presentation writes mutation to database', () => {
    const tool = getAllTools().find((t) => t.name === 'write_presentation')!;
    const result = tool.execute(
      { db, sessionId: 'shadow-rt-session' },
      { type: 'set_focus', targetId: 'node-1', payload: { emphasis: 'high' } },
    );
    expect(result.success).toBe(true);
    const mutations = db.getMutations('shadow-rt-session');
    expect(mutations.some((m) => m.mutationType === 'set_focus' && m.targetId === 'node-1')).toBe(true);
  });

  it('read_active_patterns returns patterns', () => {
    const tool = getAllTools().find((t) => t.name === 'read_active_patterns')!;
    const result = tool.execute({ db, sessionId: 'shadow-rt-session' }, {});
    expect(result.success).toBe(true);
    const data = result.data as Array<unknown>;
    expect(Array.isArray(data)).toBe(true);
  });

  it('select_pattern applies pattern and records it', () => {
    const patId = db.insertPattern({
      name: 'Select Test', origin: 'crafted', status: 'active',
      triggerJson: {}, visualJson: {}, description: '',
    });
    const tool = getAllTools().find((t) => t.name === 'select_pattern')!;
    const result = tool.execute(
      { db, sessionId: 'shadow-rt-session' },
      { patternId: patId },
    );
    expect(result.success).toBe(true);
    const outcome = db.getSeenPatternOutcome(patId, 'shadow-rt-session');
    expect(outcome).toBe('applied');
  });

  it('returns error for unknown session', () => {
    const tool = getAllTools().find((t) => t.name === 'read_session_continuity')!;
    const result = tool.execute({ db, sessionId: 'unknown' }, { sessionId: 'unknown' });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
