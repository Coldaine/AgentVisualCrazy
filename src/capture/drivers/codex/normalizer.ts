/**
 * Normalizes raw Codex rollout entries (`~/.codex/sessions/**\/rollout-*.jsonl`)
 * into CanonicalEvents. See docs/plans/plan-codex-replay.md section D1 for the
 * full mapping table this file implements; the table is reproduced inline
 * above each branch below so this file stays readable without the doc open.
 *
 * Every event produced here carries harnessId: 'codex' and driverVersion:
 * '0.1.0' (bumped when the mapping below changes shape).
 *
 * Determinism: event IDs are derived from `sessionId + entry index + intra-
 * entry index`, not randomUUID(), so replaying the same file twice produces
 * an identical ID sequence (required for deterministic replay, D3). The
 * entry-index counter is per-session state that resets whenever a
 * `session_meta` line is seen — every rollout file opens with exactly one,
 * so starting (or restarting) a session naturally re-synchronizes the
 * counter without needing an explicit "end of stream" hook that the
 * single-entry `normalizeEntry(entry, sessionId, source)` signature has no
 * room for.
 */
import type { CanonicalEvent, EventKind, EventSource } from '../../../shared/schema';
import type { ParsedEntry } from '../../incremental-parser';
import { createLogger } from '../../../shared/logger';

const logger = createLogger({ minLevel: 'info' });

const HARNESS_ID = 'codex' as const;
const DRIVER_VERSION = '0.1.0' as const;
const DEFAULT_SOURCE: EventSource = 'codex-rollout';

/** Emit roughly 1 in this many `token_count` lines as `context_snapshot`. */
const TOKEN_COUNT_SAMPLE_RATE = 10;

// ---------------------------------------------------------------------------
// Per-session state
//
// normalizeEntry is called once per parsed line by session-manager (and by
// tests, directly). There is no session-lifecycle hook, so state that must
// span calls (deterministic ID counters, the token_count sampler, the
// user-message dedupe watermark) lives here, keyed by sessionId, and is
// reset whenever a `session_meta` entry (always the first line of a rollout
// file) is observed for that session.
// ---------------------------------------------------------------------------

const entryIndexBySession = new Map<string, number>();
const tokenCountIndexBySession = new Map<string, number>();
const lastUserMessageBySession = new Map<string, string | null>();

function resetSessionState(sessionId: string): void {
  entryIndexBySession.set(sessionId, 0);
  tokenCountIndexBySession.set(sessionId, 0);
  lastUserMessageBySession.set(sessionId, null);
}

function nextEntryIndex(sessionId: string): number {
  const idx = entryIndexBySession.get(sessionId) ?? 0;
  entryIndexBySession.set(sessionId, idx + 1);
  return idx;
}

function buildId(sessionId: string, entryIndex: number, subIndex: number): string {
  return `codex:${sessionId}:${entryIndex}:${subIndex}`;
}

// ---------------------------------------------------------------------------
// Small shape helpers
// ---------------------------------------------------------------------------

function extractTimestamp(entry: ParsedEntry): string {
  const ts = entry.timestamp;
  if (typeof ts === 'string') return ts;
  return new Date().toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/** Concatenates the `.text` of every block in a Codex content array. */
function extractContentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => {
      const rec = asRecord(block);
      return typeof rec.text === 'string' ? rec.text : '';
    })
    .filter((text) => text.length > 0)
    .join('\n');
}

/** Flattens a Codex tool-output payload (string | block array | object) to text. */
function outputToText(output: unknown): string {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) {
    return output
      .map((block) => {
        const rec = asRecord(block);
        return typeof rec.text === 'string' ? rec.text : '';
      })
      .filter((text) => text.length > 0)
      .join('\n');
  }
  if (output && typeof output === 'object') {
    try {
      return JSON.stringify(output);
    } catch {
      return '';
    }
  }
  return '';
}

/**
 * Codex's `exec`-backed tool outputs (custom_tool_call_output,
 * function_call_output) wrap results in a "Script completed"/"Script failed"
 * envelope, usually followed by an "Exit code: N" line. Both signals are
 * checked (OR'd) because some failures (e.g. a JS SyntaxError inside the
 * sandboxed script) never print an exit code at all — verified against the
 * PR-1 fixture: every case where the exit-code regex matched a nonzero code
 * also had the "Script failed" first line, but not vice versa.
 */
function isScriptOutputError(output: unknown): boolean {
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    const rec = output as Record<string, unknown>;
    if (rec.success === false) return true;
  }
  const firstBlockText = Array.isArray(output)
    ? (asRecord(output[0]).text as string | undefined) ?? ''
    : typeof output === 'string'
      ? output
      : '';
  if (/^Script failed/.test(firstBlockText)) return true;
  const fullText = outputToText(output);
  return /Exit code:\s*[1-9]\d*/.test(fullText);
}

function messageEvent(
  sessionId: string,
  source: EventSource,
  timestamp: string,
  entryIndex: number,
  actor: string,
  payload: Record<string, unknown>
): CanonicalEvent {
  return {
    id: buildId(sessionId, entryIndex, 0),
    sessionId,
    source,
    timestamp,
    actor,
    kind: 'message',
    payload,
    harnessId: HARNESS_ID,
    driverVersion: DRIVER_VERSION,
  };
}

function makeEvent(
  sessionId: string,
  source: EventSource,
  timestamp: string,
  entryIndex: number,
  actor: string,
  kind: EventKind,
  payload: Record<string, unknown>
): CanonicalEvent {
  return {
    id: buildId(sessionId, entryIndex, 0),
    sessionId,
    source,
    timestamp,
    actor,
    kind,
    payload,
    harnessId: HARNESS_ID,
    driverVersion: DRIVER_VERSION,
  };
}

export function normalizeEntry(
  entry: ParsedEntry,
  sessionId: string,
  source: EventSource = DEFAULT_SOURCE
): CanonicalEvent[] {
  const events: CanonicalEvent[] = [];
  const timestamp = extractTimestamp(entry);
  const type = typeof entry.type === 'string' ? entry.type : '';

  if (type === 'session_meta') {
    resetSessionState(sessionId);
  }
  const entryIndex = nextEntryIndex(sessionId);

  const payload = asRecord(entry.payload);
  const payloadType = typeof payload.type === 'string' ? payload.type : '';

  // -- session_meta -> session_started -------------------------------------
  if (type === 'session_meta') {
    events.push(
      makeEvent(sessionId, source, timestamp, entryIndex, 'system', 'session_started', {
        cwd: typeof payload.cwd === 'string' ? payload.cwd : null,
        originator: typeof payload.originator === 'string' ? payload.originator : null,
        cliVersion: typeof payload.cli_version === 'string' ? payload.cli_version : null,
        modelProvider: typeof payload.model_provider === 'string' ? payload.model_provider : null,
      })
    );
    return events;
  }

  // -- top-level compacted -> context_snapshot -----------------------------
  if (type === 'compacted') {
    events.push(
      makeEvent(sessionId, source, timestamp, entryIndex, 'system', 'context_snapshot', {
        compacted: true,
      })
    );
    return events;
  }

  // -- response_item / * ----------------------------------------------------
  if (type === 'response_item') {
    if (payloadType === 'message') {
      const role = typeof payload.role === 'string' ? payload.role : '';
      const text = extractContentText(payload.content);

      if (role === 'assistant') {
        events.push(messageEvent(sessionId, source, timestamp, entryIndex, 'agent', { text }));
        return events;
      }
      if (role === 'user' || role === 'developer') {
        events.push(messageEvent(sessionId, source, timestamp, entryIndex, 'user', { text }));
        // Dedup watermark: only genuine user turns (not injected developer
        // instructions) get mirrored by a later event_msg/user_message.
        if (role === 'user') {
          lastUserMessageBySession.set(sessionId, text.trim());
        }
        return events;
      }
      logger.debug('capture', 'codex_driver.unknown_message_role', { role });
      return events;
    }

    if (payloadType === 'reasoning') {
      const summaryArr = Array.isArray(payload.summary) ? payload.summary : [];
      const summaryText = summaryArr
        .map((block) => {
          if (typeof block === 'string') return block;
          const rec = asRecord(block);
          return typeof rec.text === 'string' ? rec.text : '';
        })
        .filter((text) => text.length > 0)
        .join('\n');
      events.push(
        messageEvent(sessionId, source, timestamp, entryIndex, 'agent', {
          thinking: true,
          summary: summaryText,
        })
      );
      return events;
    }

    if (payloadType === 'custom_tool_call' || payloadType === 'function_call') {
      const name = typeof payload.name === 'string' ? payload.name : 'unknown';
      const toolUseId =
        typeof payload.call_id === 'string'
          ? payload.call_id
          : typeof payload.id === 'string'
            ? payload.id
            : buildId(sessionId, entryIndex, 0);

      let args: unknown;
      if (payloadType === 'custom_tool_call') {
        // custom_tool_call (Codex's `exec` encoding) carries raw JS source in
        // `input` — keep it as-is, it is not JSON.
        args = payload.input ?? {};
      } else {
        // function_call's `arguments` is (usually) a JSON string.
        const raw = payload.arguments;
        if (typeof raw === 'string') {
          try {
            args = JSON.parse(raw);
          } catch {
            args = raw;
          }
        } else {
          args = raw ?? {};
        }
      }

      const toolPayload: Record<string, unknown> = { toolName: name, toolUseId, args };
      if (name === 'wait') {
        // Coordinator-idle signature (D1): a `wait` call is the agent
        // deliberately polling for a subagent/background task, not doing
        // work itself. Flagged rather than dropped so consumers (derive.ts,
        // the future replay report) can distinguish idle-poll churn from
        // real tool activity without re-parsing args.
        toolPayload.coordinatorIdle = true;
      }
      events.push(
        makeEvent(sessionId, source, timestamp, entryIndex, 'agent', 'tool_started', toolPayload)
      );
      return events;
    }

    if (payloadType === 'custom_tool_call_output' || payloadType === 'function_call_output') {
      const output = payload.output;
      const failed = isScriptOutputError(output);
      const toolUseId =
        typeof payload.call_id === 'string' ? payload.call_id : buildId(sessionId, entryIndex, 0);
      const text = outputToText(output);
      events.push(
        makeEvent(
          sessionId,
          source,
          timestamp,
          entryIndex,
          'agent',
          failed ? 'tool_failed' : 'tool_completed',
          {
            toolUseId,
            output: text,
            error: failed ? text : undefined,
          }
        )
      );
      return events;
    }

    // turn_context / world_state / thread_settings_applied / item_completed
    // (none of these carry type: 'response_item' but are handled by the
    // generic drop below anyway) and any other unrecognized response_item
    // payload type — dropped for v1, per plan-codex-replay.md D1.
    return events;
  }

  // -- event_msg / * ---------------------------------------------------------
  if (type === 'event_msg') {
    if (payloadType === 'user_message') {
      const text = typeof payload.message === 'string' ? payload.message : '';
      const last = lastUserMessageBySession.get(sessionId);
      // Dedup rule (D1): Codex mirrors the same user text as both
      // event_msg/user_message and a preceding response_item/message. The
      // response_item copy is always emitted first in the observed corpus
      // (same or earlier timestamp), so — unlike the "keep the event_msg"
      // framing in the design doc, which would require buffering/lookahead
      // the single-entry normalizeEntry signature doesn't support — this
      // keeps whichever copy arrives first (the response_item one) and
      // skips the mirrored event_msg. Net effect is identical: exactly one
      // message per duplicated user turn, not two.
      if (last !== null && last !== undefined && text.trim() === last) {
        lastUserMessageBySession.set(sessionId, null);
        return events;
      }
      events.push(messageEvent(sessionId, source, timestamp, entryIndex, 'user', { text }));
      return events;
    }

    if (payloadType === 'agent_message') {
      const text = typeof payload.message === 'string' ? payload.message : '';
      events.push(messageEvent(sessionId, source, timestamp, entryIndex, 'agent', { text }));
      return events;
    }

    if (payloadType === 'task_started') {
      events.push(
        makeEvent(sessionId, source, timestamp, entryIndex, 'agent', 'agent_spawned', {
          turnId: payload.turn_id ?? null,
        })
      );
      return events;
    }

    if (payloadType === 'task_complete') {
      events.push(
        makeEvent(sessionId, source, timestamp, entryIndex, 'agent', 'agent_completed', {
          turnId: payload.turn_id ?? null,
          lastMessage: payload.last_agent_message ?? null,
        })
      );
      return events;
    }

    if (payloadType === 'turn_aborted') {
      events.push(
        makeEvent(sessionId, source, timestamp, entryIndex, 'agent', 'agent_idle', {
          aborted: true,
          turnId: payload.turn_id ?? null,
          reason: payload.reason ?? null,
        })
      );
      return events;
    }

    if (payloadType === 'token_count') {
      const idx = tokenCountIndexBySession.get(sessionId) ?? 0;
      tokenCountIndexBySession.set(sessionId, idx + 1);
      // Rate-limited: 770 raw token_count lines in the PR-1 fixture would
      // drown the buffer. Emit every Nth (deterministic — same input always
      // samples the same lines).
      if (idx % TOKEN_COUNT_SAMPLE_RATE !== 0) {
        return events;
      }
      const info = asRecord(payload.info);
      events.push(
        makeEvent(sessionId, source, timestamp, entryIndex, 'system', 'context_snapshot', {
          tokenUsage: info.total_token_usage ?? null,
          contextWindow: info.model_context_window ?? null,
        })
      );
      return events;
    }

    if (payloadType === 'context_compacted') {
      events.push(
        makeEvent(sessionId, source, timestamp, entryIndex, 'system', 'context_snapshot', {
          compacted: true,
        })
      );
      return events;
    }

    if (payloadType === 'patch_apply_end') {
      const success = payload.success === true;
      const toolUseId =
        typeof payload.call_id === 'string' ? payload.call_id : buildId(sessionId, entryIndex, 0);
      events.push(
        makeEvent(
          sessionId,
          source,
          timestamp,
          entryIndex,
          'agent',
          success ? 'tool_completed' : 'tool_failed',
          {
            toolName: 'apply_patch',
            toolUseId,
            output: typeof payload.stdout === 'string' ? payload.stdout : null,
            error: success
              ? undefined
              : (typeof payload.stderr === 'string' && payload.stderr) ||
                (typeof payload.stdout === 'string' ? payload.stdout : 'apply_patch failed'),
          }
        )
      );
      return events;
    }

    if (payloadType === 'mcp_tool_call_end') {
      const invocation = asRecord(payload.invocation);
      const server = typeof invocation.server === 'string' ? invocation.server : 'mcp';
      const tool = typeof invocation.tool === 'string' ? invocation.tool : 'unknown';
      const result = asRecord(payload.result);
      const ok = 'Ok' in result ? asRecord(result.Ok) : undefined;
      const err = 'Err' in result ? result.Err : undefined;
      const isError = err !== undefined || ok?.isError === true;
      const toolUseId =
        typeof payload.call_id === 'string' ? payload.call_id : buildId(sessionId, entryIndex, 0);
      events.push(
        makeEvent(
          sessionId,
          source,
          timestamp,
          entryIndex,
          'agent',
          isError ? 'tool_failed' : 'tool_completed',
          {
            toolName: `${server}:${tool}`,
            toolUseId,
            output: ok ?? null,
            error: isError ? (err ?? ok) : undefined,
          }
        )
      );
      return events;
    }

    if (payloadType === 'web_search_end') {
      const toolUseId =
        typeof payload.call_id === 'string' ? payload.call_id : buildId(sessionId, entryIndex, 0);
      events.push(
        makeEvent(sessionId, source, timestamp, entryIndex, 'agent', 'tool_completed', {
          toolName: 'web_search',
          toolUseId,
          query: typeof payload.query === 'string' ? payload.query : '',
        })
      );
      return events;
    }

    if (payloadType === 'thread_goal_updated') {
      const goal = asRecord(payload.goal);
      const objective = typeof goal.objective === 'string' ? goal.objective : '';
      events.push(
        messageEvent(sessionId, source, timestamp, entryIndex, 'system', {
          text: objective,
          goalUpdate: true,
          objective,
        })
      );
      return events;
    }

    // thread_settings_applied, item_completed, and any other event_msg
    // payload type not listed above — dropped for v1, per D1.
    return events;
  }

  // turn_context, world_state — dropped for v1, per D1.
  return events;
}
