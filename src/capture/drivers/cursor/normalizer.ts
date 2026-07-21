/**
 * Normalizes Cursor hook (and optional agent-trace) JSON entries into
 * CanonicalEvents.
 *
 * Cursor command hooks deliver a flat JSON object on stdin with
 * `hook_event_name` plus event-specific fields (see
 * https://cursor.com/docs/hooks). The hook-receiver transport forwards each
 * POST body as one JSONL line; this normalizer maps those lines into the
 * same CanonicalEvent kinds Claude Code produces so derive/renderer stay
 * harness-agnostic.
 */
import { randomUUID } from 'node:crypto';
import type { CanonicalEvent, EventKind, EventSource } from '../../../shared/schema';
import type { ParsedEntry } from '../../incremental-parser';
import { createLogger } from '../../../shared/logger';

const logger = createLogger({ minLevel: 'info' });

const HARNESS_ID = 'cursor' as const;
const DEFAULT_SOURCE: EventSource = 'cursor-hook';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function extractTimestamp(entry: ParsedEntry): string {
  const ts = entry.timestamp ?? entry.created_at;
  if (typeof ts === 'string') return ts;
  if (typeof ts === 'number' && Number.isFinite(ts)) {
    return new Date(ts).toISOString();
  }
  return new Date().toISOString();
}

function eventName(entry: ParsedEntry): string {
  const raw =
    entry.hook_event_name ??
    entry.hookEventName ??
    entry.type ??
    entry.event ??
    '';
  return typeof raw === 'string' ? raw : '';
}

function resolveToolArgs(entry: ParsedEntry): Record<string, unknown> {
  const toolInput = entry.tool_input ?? entry.toolInput;
  if (typeof toolInput === 'string') {
    try {
      const parsed = JSON.parse(toolInput) as unknown;
      return asRecord(parsed) ?? { raw: toolInput };
    } catch {
      return { raw: toolInput };
    }
  }
  return asRecord(toolInput) ?? {};
}

function baseEvent(
  sessionId: string,
  source: EventSource,
  timestamp: string,
  actor: string,
  kind: EventKind,
  payload: Record<string, unknown>
): CanonicalEvent {
  return {
    id: randomUUID(),
    sessionId,
    source,
    timestamp,
    actor,
    kind,
    payload,
    harnessId: HARNESS_ID,
  };
}

function normalizeHookEntry(
  entry: ParsedEntry,
  sessionId: string,
  source: EventSource,
  timestamp: string,
  name: string
): CanonicalEvent[] {
  switch (name) {
    case 'sessionStart': {
      return [
        baseEvent(sessionId, source, timestamp, 'system', 'session_started', {
          cwd: Array.isArray(entry.workspace_roots)
            ? entry.workspace_roots[0] ?? null
            : entry.cwd ?? null,
          composerMode: entry.composer_mode ?? null,
          isBackgroundAgent: entry.is_background_agent ?? null,
          model: entry.model ?? entry.model_id ?? null,
        }),
      ];
    }
    case 'sessionEnd': {
      return [
        baseEvent(sessionId, source, timestamp, 'system', 'session_ended', {
          reason: entry.reason ?? entry.final_status ?? null,
          durationMs: entry.duration_ms ?? null,
          error: entry.error_message ?? null,
        }),
      ];
    }
    case 'beforeSubmitPrompt': {
      const prompt = typeof entry.prompt === 'string' ? entry.prompt : '';
      if (!prompt) return [];
      return [
        baseEvent(sessionId, source, timestamp, 'user', 'message', {
          text: prompt,
        }),
      ];
    }
    case 'afterAgentResponse': {
      const text = typeof entry.text === 'string' ? entry.text : '';
      if (!text) return [];
      return [
        baseEvent(sessionId, source, timestamp, 'assistant', 'message', {
          text,
        }),
      ];
    }
    case 'afterAgentThought': {
      const text = typeof entry.text === 'string' ? entry.text : '';
      if (!text) return [];
      return [
        baseEvent(sessionId, source, timestamp, 'assistant', 'message', {
          text,
          thinking: true,
        }),
      ];
    }
    case 'preToolUse':
    case 'beforeShellExecution':
    case 'beforeMCPExecution':
    case 'beforeReadFile': {
      const toolName =
        typeof entry.tool_name === 'string'
          ? entry.tool_name
          : name === 'beforeShellExecution'
            ? 'Shell'
            : name === 'beforeMCPExecution'
              ? 'MCP'
              : name === 'beforeReadFile'
                ? 'Read'
                : 'unknown';
      const args =
        name === 'beforeShellExecution'
          ? { command: entry.command, cwd: entry.cwd, working_directory: entry.cwd }
          : name === 'beforeReadFile'
            ? { file_path: entry.file_path, path: entry.file_path }
            : resolveToolArgs(entry);
      return [
        baseEvent(sessionId, source, timestamp, 'assistant', 'tool_started', {
          toolName,
          toolUseId: entry.tool_use_id ?? entry.tool_call_id ?? randomUUID(),
          args,
        }),
      ];
    }
    case 'postToolUse':
    case 'afterShellExecution':
    case 'afterMCPExecution':
    case 'afterFileEdit': {
      const toolUseId = entry.tool_use_id ?? entry.tool_call_id ?? randomUUID();
      const output =
        entry.tool_output ??
        entry.result_json ??
        entry.output ??
        (name === 'afterFileEdit'
          ? { file_path: entry.file_path, edits: entry.edits }
          : null);
      // afterFileEdit has no matching preToolUse in some Cursor versions —
      // emit a synthetic tool_started so file attention still lights up.
      if (name === 'afterFileEdit' && typeof entry.file_path === 'string') {
        return [
          baseEvent(sessionId, source, timestamp, 'assistant', 'tool_started', {
            toolName: 'Write',
            toolUseId,
            args: { file_path: entry.file_path, path: entry.file_path },
          }),
          baseEvent(sessionId, source, timestamp, 'assistant', 'tool_completed', {
            toolUseId,
            output,
            toolName: 'Write',
          }),
        ];
      }
      return [
        baseEvent(sessionId, source, timestamp, 'assistant', 'tool_completed', {
          toolUseId,
          output,
          toolName: entry.tool_name ?? null,
          durationMs: entry.duration ?? entry.duration_ms ?? null,
        }),
      ];
    }
    case 'postToolUseFailure': {
      return [
        baseEvent(sessionId, source, timestamp, 'assistant', 'tool_failed', {
          toolUseId: entry.tool_use_id ?? entry.tool_call_id ?? randomUUID(),
          error: entry.error_message ?? entry.failure_type ?? 'tool_failed',
          toolName: entry.tool_name ?? null,
          failureType: entry.failure_type ?? null,
        }),
      ];
    }
    case 'subagentStart': {
      return [
        baseEvent(sessionId, source, timestamp, 'system', 'agent_spawned', {
          agentId: entry.subagent_id ?? randomUUID(),
          agentType: entry.subagent_type ?? null,
          task: entry.task ?? null,
          parentConversationId: entry.parent_conversation_id ?? null,
        }),
      ];
    }
    case 'subagentStop': {
      return [
        baseEvent(sessionId, source, timestamp, 'system', 'agent_completed', {
          agentType: entry.subagent_type ?? null,
          status: entry.status ?? null,
          summary: entry.summary ?? null,
          modifiedFiles: entry.modified_files ?? [],
          durationMs: entry.duration_ms ?? null,
        }),
      ];
    }
    case 'stop': {
      return [
        baseEvent(sessionId, source, timestamp, 'system', 'agent_idle', {
          status: entry.status ?? null,
          loopCount: entry.loop_count ?? null,
        }),
      ];
    }
    default: {
      if (name) {
        logger.debug('capture', 'cursor_driver.unknown_hook_event', { name });
      }
      return [];
    }
  }
}

/**
 * Optional agent-trace JSONL convention (cursor/agent-trace). Accept a few
 * common shapes so the file-tail fallback is usable when present.
 */
function normalizeAgentTraceEntry(
  entry: ParsedEntry,
  sessionId: string,
  source: EventSource,
  timestamp: string
): CanonicalEvent[] {
  const type = typeof entry.type === 'string' ? entry.type : eventName(entry);
  if (type) {
    // Some agent-trace writers reuse hook_event_name / type with hook names.
    const viaHook = normalizeHookEntry(entry, sessionId, source, timestamp, type);
    if (viaHook.length > 0) return viaHook;
  }

  if (typeof entry.role === 'string' && typeof entry.content === 'string') {
    return [
      baseEvent(sessionId, source, timestamp, entry.role, 'message', {
        text: entry.content,
      }),
    ];
  }

  const message = asRecord(entry.message);
  if (message && typeof message.content === 'string') {
    const role = typeof message.role === 'string' ? message.role : 'assistant';
    return [
      baseEvent(sessionId, source, timestamp, role, 'message', {
        text: message.content,
      }),
    ];
  }

  return [];
}

export function normalizeEntry(
  entry: ParsedEntry,
  sessionId: string,
  source: EventSource = DEFAULT_SOURCE
): CanonicalEvent[] {
  const timestamp = extractTimestamp(entry);
  const name = eventName(entry);

  if (source === 'cursor-agent-trace' && !name) {
    return normalizeAgentTraceEntry(entry, sessionId, source, timestamp);
  }

  if (name) {
    return normalizeHookEntry(entry, sessionId, source, timestamp, name);
  }

  // Fall through: agent-trace-like payloads posted without hook_event_name.
  return normalizeAgentTraceEntry(entry, sessionId, source, timestamp);
}
