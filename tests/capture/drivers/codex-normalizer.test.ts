/**
 * Codex driver normalizer unit tests (PR-2, plan-codex-replay.md D1).
 *
 * Hand-written entries for each row of the D1 mapping table. The fixture
 * integration test (codex-fixture.test.ts) covers volume/aggregate
 * assertions against the real corpus; this file covers per-shape
 * correctness and edge cases (fail paths, dedupe, sampling).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { codexDriver } from '../../../src/capture/drivers/codex';
import { normalizeEntry } from '../../../src/capture/drivers/codex/normalizer';
import type { ParsedEntry } from '../../../src/capture/incremental-parser';

// Each test gets its own sessionId so per-session normalizer state
// (entry-index counter, token_count sampler, user-message dedupe watermark)
// never leaks across tests.
let sessionCounter = 0;
function freshSessionId(): string {
  sessionCounter += 1;
  return `sess-${sessionCounter}`;
}

describe('codex driver — harness identity', () => {
  it('is registered under id "codex" for source "codex-rollout"', () => {
    expect(codexDriver.id).toBe('codex');
    expect(codexDriver.sources).toContain('codex-rollout');
  });

  it('stamps harnessId: "codex" and driverVersion: "0.1.0" on every event', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:00.000Z',
      type: 'session_meta',
      payload: { session_id: 'abc', cwd: '/tmp', originator: 'codex-tui', cli_version: '0.145.0', model_provider: 'openai' },
    };
    const events = codexDriver.normalizeEntry(entry, freshSessionId());
    expect(events).toHaveLength(1);
    expect(events[0]?.harnessId).toBe('codex');
    expect(events[0]?.driverVersion).toBe('0.1.0');
  });
});

describe('codex driver — session_meta', () => {
  it('maps to session_started with cwd/originator/cliVersion/modelProvider', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:00.000Z',
      type: 'session_meta',
      payload: {
        session_id: 'abc',
        cwd: 'C:\\_projects\\coldaine-homelab',
        originator: 'codex-tui',
        cli_version: '0.145.0',
        model_provider: 'openai',
      },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('session_started');
    expect(events[0]?.actor).toBe('system');
    expect(events[0]?.payload).toEqual({
      cwd: 'C:\\_projects\\coldaine-homelab',
      originator: 'codex-tui',
      cliVersion: '0.145.0',
      modelProvider: 'openai',
    });
  });
});

describe('codex driver — response_item/message', () => {
  it('maps role=user to actor "user"', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:01.000Z',
      type: 'response_item',
      payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'do the thing' }] },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('message');
    expect(events[0]?.actor).toBe('user');
    expect(events[0]?.payload.text).toBe('do the thing');
  });

  it('maps role=developer to actor "user" (injected user intent)', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:01.000Z',
      type: 'response_item',
      payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'memory notes' }] },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events).toHaveLength(1);
    expect(events[0]?.actor).toBe('user');
  });

  it('maps role=assistant to actor "agent"', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:02.000Z',
      type: 'response_item',
      payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'On it.' }] },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events).toHaveLength(1);
    expect(events[0]?.actor).toBe('agent');
    expect(events[0]?.payload.text).toBe('On it.');
  });

  it('concatenates multiple content blocks', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:02.000Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'output_text', text: 'part one' },
          { type: 'output_text', text: 'part two' },
        ],
      },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events[0]?.payload.text).toBe('part one\npart two');
  });
});

describe('codex driver — reasoning', () => {
  it('maps to actor "agent" message with thinking:true', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:03.000Z',
      type: 'response_item',
      payload: { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'gAAA...' },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('message');
    expect(events[0]?.actor).toBe('agent');
    expect(events[0]?.payload.thinking).toBe(true);
  });

  it('joins a non-empty summary array into payload.summary', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:03.000Z',
      type: 'response_item',
      payload: { type: 'reasoning', summary: ['Step one', 'Step two'] },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events[0]?.payload.summary).toBe('Step one\nStep two');
  });
});

describe('codex driver — custom_tool_call / custom_tool_call_output', () => {
  it('maps custom_tool_call to tool_started with raw (non-JSON) args', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:04.000Z',
      type: 'response_item',
      payload: { type: 'custom_tool_call', id: 'ctc_1', call_id: 'call_abc', name: 'exec', input: 'const r = 1;' },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('tool_started');
    expect(events[0]?.payload).toMatchObject({ toolName: 'exec', toolUseId: 'call_abc', args: 'const r = 1;' });
  });

  it('maps a successful custom_tool_call_output to tool_completed', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:05.000Z',
      type: 'response_item',
      payload: {
        type: 'custom_tool_call_output',
        call_id: 'call_abc',
        output: [
          { type: 'input_text', text: 'Script completed\nWall time 0.1 seconds\nOutput:\n' },
          { type: 'input_text', text: 'Exit code: 0\nWall time: 0.1 seconds\nOutput:\nhello' },
        ],
      },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('tool_completed');
    expect(events[0]?.payload.toolUseId).toBe('call_abc');
    expect(events[0]?.payload.error).toBeUndefined();
  });

  it('maps a failed custom_tool_call_output ("Script failed") to tool_failed', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:05.000Z',
      type: 'response_item',
      payload: {
        type: 'custom_tool_call_output',
        call_id: 'call_abc',
        output: [
          { type: 'input_text', text: 'Script failed\nWall time 0.1 seconds\nOutput:\n' },
          { type: 'input_text', text: 'Script error:\nSyntaxError: bad' },
        ],
      },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('tool_failed');
    expect(typeof events[0]?.payload.error).toBe('string');
  });

  it('maps a nonzero exit code without a "Script failed" prefix to tool_failed', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:05.000Z',
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'call_xyz',
        output: [{ type: 'input_text', text: 'Exit code: 124\nOutput:\ntimed out' }],
      },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events[0]?.kind).toBe('tool_failed');
  });
});

describe('codex driver — function_call / function_call_output', () => {
  it('maps function_call to tool_started with JSON-parsed args', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:06.000Z',
      type: 'response_item',
      payload: {
        type: 'function_call',
        id: 'fc_1',
        call_id: 'call_wait',
        name: 'wait',
        arguments: '{"cell_id":"21","yield_time_ms":10000}',
      },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('tool_started');
    expect(events[0]?.payload.args).toEqual({ cell_id: '21', yield_time_ms: 10000 });
    // 'wait' is the coordinator-idle signature (D1) — flagged, not dropped.
    expect(events[0]?.payload.coordinatorIdle).toBe(true);
  });

  it('falls back to raw string args when arguments is not valid JSON', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:06.000Z',
      type: 'response_item',
      payload: { type: 'function_call', call_id: 'call_bad', name: 'weird', arguments: 'not json' },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events[0]?.payload.args).toBe('not json');
    expect(events[0]?.payload.coordinatorIdle).toBeUndefined();
  });

  it('maps function_call_output success (plain string, no failure markers) to tool_completed', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:07.000Z',
      type: 'response_item',
      payload: { type: 'function_call_output', call_id: 'call_wait', output: 'Script running with cell ID 21\n' },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events[0]?.kind).toBe('tool_completed');
  });
});

describe('codex driver — patch_apply_end', () => {
  it('maps success:true to tool_completed toolName apply_patch', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:08.000Z',
      type: 'event_msg',
      payload: {
        type: 'patch_apply_end',
        call_id: 'exec-1',
        stdout: 'Success. Updated the following files:\nM foo.md\n',
        stderr: '',
        success: true,
      },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('tool_completed');
    expect(events[0]?.payload.toolName).toBe('apply_patch');
    expect(events[0]?.payload.error).toBeUndefined();
  });

  // Explicit fail-path coverage (design doc calls this out; not present in
  // the PR-1 fixture, whose 34 patch_apply_end lines are all successes).
  it('maps success:false to tool_failed with stderr as the error', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:08.000Z',
      type: 'event_msg',
      payload: {
        type: 'patch_apply_end',
        call_id: 'exec-2',
        stdout: '',
        stderr: 'error: patch failed to apply cleanly',
        success: false,
      },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('tool_failed');
    expect(events[0]?.payload.toolName).toBe('apply_patch');
    expect(events[0]?.payload.error).toBe('error: patch failed to apply cleanly');
  });
});

describe('codex driver — mcp_tool_call_end', () => {
  it('maps result.Ok to tool_completed with a server:tool toolName', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:09.000Z',
      type: 'event_msg',
      payload: {
        type: 'mcp_tool_call_end',
        call_id: 'exec-3',
        invocation: { server: 'node_repl', tool: 'js', arguments: {} },
        result: { Ok: { content: [{ type: 'text', text: 'ok' }], isError: false } },
      },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('tool_completed');
    expect(events[0]?.payload.toolName).toBe('node_repl:js');
  });

  it('maps result.Ok with isError:true to tool_failed', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:09.000Z',
      type: 'event_msg',
      payload: {
        type: 'mcp_tool_call_end',
        call_id: 'exec-4',
        invocation: { server: 'node_repl', tool: 'js' },
        result: { Ok: { content: [], isError: true } },
      },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events[0]?.kind).toBe('tool_failed');
  });

  it('maps result.Err to tool_failed', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:09.000Z',
      type: 'event_msg',
      payload: {
        type: 'mcp_tool_call_end',
        call_id: 'exec-5',
        invocation: { server: 'node_repl', tool: 'js' },
        result: { Err: 'connection refused' },
      },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events[0]?.kind).toBe('tool_failed');
  });
});

describe('codex driver — web_search_end', () => {
  it('maps to tool_completed toolName web_search with query payload', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:10.000Z',
      type: 'event_msg',
      payload: { type: 'web_search_end', call_id: 'exec-6', query: 'shipwright build strategy' },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('tool_completed');
    expect(events[0]?.payload).toMatchObject({ toolName: 'web_search', query: 'shipwright build strategy' });
  });
});

describe('codex driver — task lifecycle', () => {
  it('maps task_started to agent_spawned', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:11.000Z',
      type: 'event_msg',
      payload: { type: 'task_started', turn_id: 'turn-1', model_context_window: 258400 },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('agent_spawned');
    expect(events[0]?.payload.turnId).toBe('turn-1');
  });

  it('maps task_complete to agent_completed', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:12.000Z',
      type: 'event_msg',
      payload: { type: 'task_complete', turn_id: 'turn-1', last_agent_message: 'Done.' },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('agent_completed');
    expect(events[0]?.payload.lastMessage).toBe('Done.');
  });

  it('maps turn_aborted to agent_idle with payload.aborted:true', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:13.000Z',
      type: 'event_msg',
      payload: { type: 'turn_aborted', turn_id: 'turn-1', reason: 'interrupted' },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('agent_idle');
    expect(events[0]?.payload.aborted).toBe(true);
  });
});

describe('codex driver — token_count rate limiting', () => {
  it('emits roughly 1 in 10 token_count lines as context_snapshot, deterministically', () => {
    const sessionId = freshSessionId();
    const makeTokenCount = (i: number): ParsedEntry => ({
      timestamp: `2026-07-23T12:01:${String(i).padStart(2, '0')}.000Z`,
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: { total_token_usage: { total_tokens: i * 100 }, model_context_window: 258400 },
      },
    });

    let emitted = 0;
    for (let i = 0; i < 30; i++) {
      const events = normalizeEntry(makeTokenCount(i), sessionId);
      if (events.length > 0) {
        emitted += 1;
        expect(events[0]?.kind).toBe('context_snapshot');
      }
    }
    // 30 lines at 1-in-10 -> exactly 3 emissions (indices 0, 10, 20).
    expect(emitted).toBe(3);
  });
});

describe('codex driver — context_compacted / compacted', () => {
  it('maps event_msg/context_compacted to context_snapshot payload {compacted:true}', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:14.000Z',
      type: 'event_msg',
      payload: { type: 'context_compacted' },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('context_snapshot');
    expect(events[0]?.payload).toEqual({ compacted: true });
  });

  it('maps top-level type:"compacted" to context_snapshot payload {compacted:true}', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:14.000Z',
      type: 'compacted',
      payload: { message: '', replacement_history: [{ huge: 'blob' }] },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('context_snapshot');
    expect(events[0]?.payload).toEqual({ compacted: true });
  });
});

describe('codex driver — thread_goal_updated', () => {
  it('maps to actor "system" message, preserved (not dropped)', () => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T15:20:43.493Z',
      type: 'event_msg',
      payload: {
        type: 'thread_goal_updated',
        threadId: 'thread-1',
        goal: { objective: 'continue until the pg18 databases have been fully recovered' },
      },
    };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('message');
    expect(events[0]?.actor).toBe('system');
    expect(events[0]?.payload).toMatchObject({
      goalUpdate: true,
      objective: 'continue until the pg18 databases have been fully recovered',
    });
  });
});

describe('codex driver — dropped entry types (v1)', () => {
  it.each(['turn_context', 'world_state'])('drops top-level type %s', (type) => {
    const entry: ParsedEntry = { timestamp: '2026-07-23T12:00:15.000Z', type, payload: {} };
    expect(normalizeEntry(entry, freshSessionId())).toHaveLength(0);
  });

  it.each(['thread_settings_applied', 'item_completed'])('drops event_msg/%s', (payloadType) => {
    const entry: ParsedEntry = {
      timestamp: '2026-07-23T12:00:15.000Z',
      type: 'event_msg',
      payload: { type: payloadType },
    };
    expect(normalizeEntry(entry, freshSessionId())).toHaveLength(0);
  });

  it('drops unrecognized entries entirely', () => {
    const entry: ParsedEntry = { timestamp: '2026-07-23T12:00:16.000Z', type: 'something_new', payload: {} };
    expect(normalizeEntry(entry, freshSessionId())).toHaveLength(0);
  });
});

describe('codex driver — user-message dedupe', () => {
  it('keeps a single message when event_msg/user_message mirrors the preceding response_item/message', () => {
    const sessionId = freshSessionId();
    const text = 'Implement the plan.';

    const responseItemEntry: ParsedEntry = {
      timestamp: '2026-07-23T12:16:39.254Z',
      type: 'response_item',
      payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
    };
    const eventMsgEntry: ParsedEntry = {
      timestamp: '2026-07-23T12:16:39.254Z',
      type: 'event_msg',
      payload: { type: 'user_message', message: text },
    };

    const firstEvents = normalizeEntry(responseItemEntry, sessionId);
    const secondEvents = normalizeEntry(eventMsgEntry, sessionId);

    expect(firstEvents).toHaveLength(1);
    expect(firstEvents[0]?.actor).toBe('user');
    // The mirrored event_msg is skipped — exactly one message total.
    expect(secondEvents).toHaveLength(0);
  });

  it('does not dedupe an event_msg/user_message with different text', () => {
    const sessionId = freshSessionId();
    const responseItemEntry: ParsedEntry = {
      timestamp: '2026-07-23T12:16:39.254Z',
      type: 'response_item',
      payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'first turn' }] },
    };
    const unrelatedEventMsg: ParsedEntry = {
      timestamp: '2026-07-23T12:20:00.000Z',
      type: 'event_msg',
      payload: { type: 'user_message', message: 'a different later turn' },
    };

    normalizeEntry(responseItemEntry, sessionId);
    const events = normalizeEntry(unrelatedEventMsg, sessionId);
    expect(events).toHaveLength(1);
    expect(events[0]?.payload.text).toBe('a different later turn');
  });

  it('does not dedupe response_item/message role=developer against event_msg/user_message', () => {
    const sessionId = freshSessionId();
    const text = 'same text coincidence';
    const developerEntry: ParsedEntry = {
      timestamp: '2026-07-23T12:16:39.254Z',
      type: 'response_item',
      payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text }] },
    };
    const userMessageEntry: ParsedEntry = {
      timestamp: '2026-07-23T12:16:40.000Z',
      type: 'event_msg',
      payload: { type: 'user_message', message: text },
    };

    normalizeEntry(developerEntry, sessionId);
    const events = normalizeEntry(userMessageEntry, sessionId);
    // Developer-role messages never set the dedupe watermark, so this
    // user_message is treated as a genuine new turn, not a mirror.
    expect(events).toHaveLength(1);
  });
});

describe('codex driver — deterministic IDs', () => {
  it('produces identical ID sequences across two independent normalizations of the same entries', () => {
    const entries: ParsedEntry[] = [
      { timestamp: 't0', type: 'session_meta', payload: { cwd: '/x' } },
      {
        timestamp: 't1',
        type: 'response_item',
        payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
      },
      { timestamp: 't2', type: 'event_msg', payload: { type: 'task_started', turn_id: 'turn-1' } },
    ];

    const sessionId = 'deterministic-session';

    const run = () => entries.flatMap((entry) => normalizeEntry(entry, sessionId));
    const first = run().map((e) => e.id);
    const second = run().map((e) => e.id);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
  });
});

describe('codex driver — source propagation', () => {
  beforeEach(() => {
    // no-op: each test uses freshSessionId(), no shared state to reset
  });

  it('defaults source to codex-rollout', () => {
    const entry: ParsedEntry = { timestamp: 't0', type: 'session_meta', payload: {} };
    const events = normalizeEntry(entry, freshSessionId());
    expect(events[0]?.source).toBe('codex-rollout');
  });

  it('honors an explicit source override', () => {
    const entry: ParsedEntry = { timestamp: 't0', type: 'session_meta', payload: {} };
    const events = normalizeEntry(entry, freshSessionId(), 'replay');
    expect(events[0]?.source).toBe('replay');
  });
});
