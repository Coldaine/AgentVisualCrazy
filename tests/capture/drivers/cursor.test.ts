/**
 * Cursor harness driver + hook-receiver contract tests (multi-harness PR 6).
 */
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cursorDriver,
  cursorToolNameMap,
  createCursorDiscovery,
  normalizeCursorEntry,
} from '../../../src/capture/drivers/cursor';
import { driverRegistry } from '../../../src/capture/drivers';
import { createHookReceiverCaptureTransport } from '../../../src/capture/hook-receiver-transport';
import { createIncrementalParser } from '../../../src/capture/incremental-parser';
import { deriveState } from '../../../src/shared/derive';
import type { CanonicalEvent } from '../../../src/shared/schema';
import type {
  CaptureSession,
  CaptureTransportSubscription
} from '../../../src/capture/capture-transport';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../fixtures/transcripts/cursor-hooks.jsonl'
);

async function waitFor(
  assertion: () => boolean | Promise<boolean>,
  timeoutMs = 4_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await assertion()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

describe('cursorToolNameMap', () => {
  it('maps Cursor tools onto Claude-like names for derive phase/risk', () => {
    expect(cursorToolNameMap('Shell')).toBe('Bash');
    expect(cursorToolNameMap('shell:npm')).toBe('Bash');
    expect(cursorToolNameMap('Write')).toBe('Edit');
    expect(cursorToolNameMap('Delete')).toBe('Edit');
    expect(cursorToolNameMap('Read')).toBe('Read');
    expect(cursorToolNameMap('Grep')).toBe('Read');
    expect(cursorToolNameMap('Task')).toBe('Task');
    expect(cursorToolNameMap('MCP:search')).toBe('search');
    expect(cursorToolNameMap('Custom')).toBe('Custom');
  });

  it('round-trips through derive phase detection (Shell → validation)', () => {
    const events = [
      ...normalizeCursorEntry(
        {
          hook_event_name: 'preToolUse',
          tool_name: 'Shell',
          tool_use_id: 's1',
          tool_input: { command: 'npm test' },
        },
        'sess'
      ),
      ...normalizeCursorEntry(
        {
          hook_event_name: 'postToolUse',
          tool_name: 'Shell',
          tool_use_id: 's1',
          tool_output: 'ok',
        },
        'sess'
      ),
    ];
    const state = deriveState(events);
    expect(state.activePhase).toBe('validation');
  });
});

describe('cursor driver — registry', () => {
  it('is registered for cursor-hook and cursor-agent-trace sources', () => {
    expect(driverRegistry.get('cursor')).toBe(cursorDriver);
    expect(driverRegistry.getForSource('cursor-hook')).toBe(cursorDriver);
    expect(driverRegistry.getForSource('cursor-agent-trace')).toBe(cursorDriver);
  });

  it('keeps claude-code as the default driver', () => {
    expect(driverRegistry.getDefault().id).toBe('claude-code');
  });
});

describe('cursor driver — normalizeEntry', () => {
  const SESSION = 'conv-cursor-1';

  it('stamps harnessId cursor on every event', () => {
    const events = normalizeCursorEntry(
      {
        hook_event_name: 'afterAgentResponse',
        text: 'hello',
        conversation_id: SESSION,
      },
      SESSION
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.harnessId).toBe('cursor');
    expect(events[0]?.source).toBe('cursor-hook');
    expect(events[0]?.kind).toBe('message');
  });

  it('maps preToolUse / postToolUse / failure / afterFileEdit', () => {
    const started = normalizeCursorEntry(
      {
        hook_event_name: 'preToolUse',
        tool_name: 'Read',
        tool_use_id: 't1',
        tool_input: { path: '/repo/a.ts' },
      },
      SESSION
    );
    expect(started[0]?.kind).toBe('tool_started');
    expect(started[0]?.payload).toMatchObject({
      toolName: 'Read',
      toolUseId: 't1',
      args: { path: '/repo/a.ts' },
    });

    const completed = normalizeCursorEntry(
      {
        hook_event_name: 'postToolUse',
        tool_name: 'Read',
        tool_use_id: 't1',
        tool_output: 'ok',
      },
      SESSION
    );
    expect(completed[0]?.kind).toBe('tool_completed');

    const failed = normalizeCursorEntry(
      {
        hook_event_name: 'postToolUseFailure',
        tool_name: 'Shell',
        tool_use_id: 't2',
        error_message: 'boom',
      },
      SESSION
    );
    expect(failed[0]?.kind).toBe('tool_failed');

    const edited = normalizeCursorEntry(
      {
        hook_event_name: 'afterFileEdit',
        file_path: '/repo/a.ts',
        edits: [],
      },
      SESSION
    );
    expect(edited.map((e) => e.kind)).toEqual(['tool_started', 'tool_completed']);
  });

  it('emits subagent lifecycle events with distinct actor ids', () => {
    const spawned = normalizeCursorEntry(
      {
        hook_event_name: 'subagentStart',
        subagent_id: 'sa-1',
        subagent_type: 'explore',
        task: 'look around',
      },
      SESSION
    );
    expect(spawned[0]).toMatchObject({
      kind: 'agent_spawned',
      actor: 'sa-1',
      payload: { agentId: 'sa-1', label: 'explore' },
    });

    const done = normalizeCursorEntry(
      {
        hook_event_name: 'subagentStop',
        subagent_id: 'sa-1',
        subagent_type: 'explore',
        status: 'completed',
        summary: 'done',
      },
      SESSION
    );
    expect(done[0]).toMatchObject({
      kind: 'agent_completed',
      actor: 'sa-1',
      payload: { agentId: 'sa-1' },
    });
  });

  it('keeps concurrent subagents as separate derive agentNodes', () => {
    const events = [
      ...normalizeCursorEntry(
        {
          hook_event_name: 'subagentStart',
          subagent_id: 'sa-a',
          subagent_type: 'explore',
          task: 'a',
        },
        SESSION
      ),
      ...normalizeCursorEntry(
        {
          hook_event_name: 'subagentStart',
          subagent_id: 'sa-b',
          subagent_type: 'generalPurpose',
          task: 'b',
        },
        SESSION
      ),
    ];
    const state = deriveState(events);
    expect(state.agentNodes.map((n) => n.id).sort()).toEqual(['sa-a', 'sa-b']);
  });

  it('skips specialized tool hooks without a stable tool id (avoids double-count)', () => {
    expect(
      normalizeCursorEntry(
        {
          hook_event_name: 'beforeShellExecution',
          command: 'ls',
          cwd: '/repo',
        },
        SESSION
      )
    ).toEqual([]);
    expect(
      normalizeCursorEntry(
        {
          hook_event_name: 'afterShellExecution',
          command: 'ls',
          output: 'ok',
        },
        SESSION
      )
    ).toEqual([]);
  });

  it('accepts specialized tool hooks when tool_use_id is present', () => {
    const shell = normalizeCursorEntry(
      {
        hook_event_name: 'beforeShellExecution',
        tool_use_id: 'shell-1',
        command: 'ls',
        cwd: '/repo',
      },
      SESSION
    );
    expect(shell[0]).toMatchObject({
      kind: 'tool_started',
      payload: {
        toolName: 'Shell',
        toolUseId: 'shell-1',
        args: { command: 'ls', cwd: '/repo' },
      },
    });
  });

  it('returns empty for unknown hook events', () => {
    expect(
      normalizeCursorEntry({ hook_event_name: 'workspaceOpen' }, SESSION)
    ).toEqual([]);
  });

  it('maps beforeSubmitPrompt / sessionEnd / stop', () => {
    const prompt = normalizeCursorEntry(
      { hook_event_name: 'beforeSubmitPrompt', prompt: 'do the thing' },
      SESSION
    );
    expect(prompt[0]).toMatchObject({
      kind: 'message',
      actor: 'user',
      payload: { text: 'do the thing' },
    });

    const ended = normalizeCursorEntry(
      { hook_event_name: 'sessionEnd', reason: 'completed', duration_ms: 9 },
      SESSION
    );
    expect(ended[0]?.kind).toBe('session_ended');

    const idle = normalizeCursorEntry(
      { hook_event_name: 'stop', status: 'completed' },
      SESSION
    );
    expect(idle[0]?.kind).toBe('agent_idle');
  });

  it('accepts agent-trace style entries without hook_event_name', () => {
    const events = normalizeCursorEntry(
      { role: 'assistant', content: 'trace text' },
      SESSION,
      'cursor-agent-trace'
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'message',
      actor: 'assistant',
      source: 'cursor-agent-trace',
      payload: { text: 'trace text' },
    });
  });
});

describe('cursor DiscoveryStrategy', () => {
  it('discovers .agent-trace/traces.jsonl under search roots', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'cursor-discovery-'));
    try {
      const traceDir = path.join(root, '.agent-trace');
      mkdirSync(traceDir, { recursive: true });
      const trace = path.join(traceDir, 'traces.jsonl');
      writeFileSync(trace, '{}\n');
      mkdirSync(path.join(root, '.cursor'), { recursive: true });
      writeFileSync(path.join(root, '.cursor', 'hooks.json'), '{"version":1,"hooks":{}}\n');

      const discovery = createCursorDiscovery({ searchRoots: [root] });
      const sessions = await discovery.discoverSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.source).toBe('cursor-agent-trace');
      expect(sessions[0]?.filePath).toBe(trace);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns empty when no agent-trace files exist', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'cursor-discovery-empty-'));
    try {
      const discovery = createCursorDiscovery({ searchRoots: [root] });
      expect(await discovery.discoverSessions()).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('cursor fixture → derive', () => {
  it('produces agentNodes, transcript, and fileAttention from the hook fixture', () => {
    const lines = readFileSync(FIXTURE, 'utf8').trim().split('\n');
    const events: CanonicalEvent[] = [];
    for (const line of lines) {
      events.push(...normalizeCursorEntry(JSON.parse(line) as Record<string, unknown>, 'conv-cursor-1'));
    }

    expect(events.some((e) => e.kind === 'session_started')).toBe(true);
    expect(events.some((e) => e.kind === 'tool_started')).toBe(true);
    expect(events.every((e) => e.harnessId === 'cursor')).toBe(true);

    const state = deriveState(events);
    expect(state.agentNodes.length).toBeGreaterThan(0);
    expect(state.transcript.length).toBeGreaterThan(0);
    expect(state.fileAttention.some((f) => f.filePath.includes('auth.ts'))).toBe(true);
    expect(state.riskSignals.length).toBeGreaterThan(0);
  });
});

describe('hook-receiver transport', () => {
  const subscriptions: CaptureTransportSubscription[] = [];
  const servers: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    for (const sub of subscriptions.splice(0)) {
      await sub.stop();
    }
    for (const server of servers.splice(0)) {
      await server.close();
    }
  });

  it('accepts POSTed Cursor hooks and feeds JSONL chunks', async () => {
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', () => resolve()));
    const address = probe.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    const port = address.port;
    await new Promise<void>((resolve, reject) =>
      probe.close((error) => (error ? reject(error) : resolve()))
    );

    const sessions: CaptureSession[] = [];
    const events: CanonicalEvent[] = [];
    const parser = createIncrementalParser((entry) => {
      events.push(...cursorDriver.normalizeEntry(entry, 'conv-live', 'cursor-hook'));
    });

    const transport = createHookReceiverCaptureTransport({
      kind: 'hook-receiver',
      host: '127.0.0.1',
      port,
      defaultSource: 'cursor-hook',
    });
    subscriptions.push(
      await transport.start({
        getBackpressure: () => ({
          level: 'normal',
          shouldThrottle: false,
          totalRatio: 0,
          pendingWrites: 0,
        }),
        onSessionStarted: (session) => {
          sessions.push(session);
        },
        onSessionReset: () => undefined,
        onChunk: ({ chunk }) => {
          parser.push(chunk);
        },
      })
    );

    const payload = {
      hook_event_name: 'preToolUse',
      conversation_id: 'conv-live',
      tool_name: 'Write',
      tool_use_id: 'w1',
      tool_input: { path: '/tmp/x.ts' },
    };
    const response = await fetch(`http://127.0.0.1:${port}/hook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});

    await waitFor(() => events.length > 0);
    expect(sessions[0]?.sessionId).toBe('conv-live');
    expect(sessions[0]?.source).toBe('cursor-hook');
    expect(events[0]?.kind).toBe('tool_started');
    expect(events[0]?.harnessId).toBe('cursor');
  });

  it('rejects unauthorized requests when a shared token is configured', async () => {
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', () => resolve()));
    const address = probe.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    const port = address.port;
    await new Promise<void>((resolve, reject) =>
      probe.close((error) => (error ? reject(error) : resolve()))
    );

    const transport = createHookReceiverCaptureTransport({
      kind: 'hook-receiver',
      host: '127.0.0.1',
      port,
      sharedToken: 'secret',
    });
    subscriptions.push(
      await transport.start({
        getBackpressure: () => ({
          level: 'normal',
          shouldThrottle: false,
          totalRatio: 0,
          pendingWrites: 0,
        }),
        onSessionStarted: () => undefined,
        onSessionReset: () => undefined,
        onChunk: () => undefined,
      })
    );

    const denied = await fetch(`http://127.0.0.1:${port}/hook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"hook_event_name":"stop","conversation_id":"x"}',
    });
    expect(denied.status).toBe(401);

    const allowed = await fetch(`http://127.0.0.1:${port}/hook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shadow-token': 'secret',
      },
      body: '{"hook_event_name":"stop","conversation_id":"x"}',
    });
    expect(allowed.status).toBe(200);
  });
});

describe('forward-to-shadow.sh', () => {
  it('is executable and fail-opens when the receiver is down', async () => {
    const script = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../scripts/hooks/forward-to-shadow.sh'
    );
    chmodSync(script, 0o755);
    const { spawnSync } = await import('node:child_process');
    const result = spawnSync(
      script,
      [],
      {
        input: JSON.stringify({
          hook_event_name: 'stop',
          conversation_id: 'offline-test',
        }),
        encoding: 'utf8',
        env: {
          ...process.env,
          SHADOW_HOOK_URL: 'http://127.0.0.1:1/hook',
        },
      }
    );
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('{}');
  });
});
