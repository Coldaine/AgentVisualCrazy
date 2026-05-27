/**
 * Normalizes Phoenix / OpenTelemetry spans and Claude Code OTel log events
 * into CanonicalEvents.
 *
 * Dispatches on two namespaces:
 *   - OpenInference (openinference.span.kind present): LLM, TOOL, AGENT, CHAIN spans
 *   - Claude Code log events (name = user_prompt | tool_decision | tool_result | file_edit | …)
 *
 * Extended-thinking blocks are NOT present in Claude Code's OTel emission as of 2026-05;
 * if that changes, add a 'thinking' case to normalizeClaudeCodeLogEvent below.
 */
import { randomUUID } from 'node:crypto';
import type { CanonicalEvent, EventKind } from '../shared/schema';

type OtelEntry = Record<string, unknown>;

const CLAUDE_CODE_LOG_EVENTS = new Set([
  'user_prompt',
  'tool_decision',
  'tool_result',
  'file_edit',
  'api_request',
  'api_error',
]);

function str(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v != null) return String(v);
  return '';
}

function tryJson(v: unknown): unknown {
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      /* not JSON */
    }
  }
  return v;
}

function event(
  kind: EventKind,
  actor: string,
  sessionId: string,
  timestamp: string,
  payload: Record<string, unknown>
): CanonicalEvent {
  return { id: randomUUID(), sessionId, source: 'phoenix', timestamp, actor, kind, payload };
}

function normalizeOpenInferenceSpan(span: OtelEntry, sessionId: string): CanonicalEvent[] {
  const events: CanonicalEvent[] = [];
  const attrs = (span.attributes as Record<string, unknown>) ?? {};
  const spanKind = str(
    span.span_kind ?? attrs['openinference.span.kind'] ?? ''
  ).toUpperCase();
  const ctx = (span.context as Record<string, unknown>) ?? {};
  const spanId = str(ctx.span_id ?? '');
  const traceId = str(ctx.trace_id ?? '');
  const parentId = span.parent_id != null ? str(span.parent_id) : null;
  const startTime = str(span.start_time ?? new Date().toISOString());
  const endTime = str(span.end_time ?? startTime);
  const statusCode = str(span.status_code ?? 'OK').toUpperCase();
  const isError = statusCode === 'ERROR';

  switch (spanKind) {
    case 'LLM': {
      const inputMessages = attrs['llm.input_messages'];
      if (Array.isArray(inputMessages)) {
        for (const msg of inputMessages as OtelEntry[]) {
          const role = str(msg['message.role'] ?? 'unknown');
          const content = str(msg['message.content'] ?? '');
          if (content) {
            events.push(event('message', role === 'user' ? 'user' : 'assistant', sessionId, startTime, { text: content }));
          }
        }
      }
      const outputMessages = attrs['llm.output_messages'];
      if (Array.isArray(outputMessages)) {
        for (const msg of outputMessages as OtelEntry[]) {
          const content = str(msg['message.content'] ?? '');
          if (content) {
            events.push(event('message', 'assistant', sessionId, endTime, { text: content }));
          }
          const toolCalls = msg['message.tool_calls'];
          if (Array.isArray(toolCalls)) {
            for (const tc of toolCalls as OtelEntry[]) {
              const toolUseId = str(tc['tool_call.id'] ?? randomUUID());
              const toolName = str(tc['tool_call.function.name'] ?? 'unknown');
              const args = tryJson(tc['tool_call.function.arguments']) ?? {};
              events.push(event('tool_started', 'assistant', sessionId, endTime, { toolName, toolUseId, args }));
            }
          }
        }
      }
      break;
    }

    case 'TOOL': {
      const toolName = str(attrs['tool.name'] ?? span.name ?? 'unknown');
      const toolUseId = spanId || randomUUID();
      const args = tryJson(attrs['tool.inputs']) ?? {};
      const output = tryJson(attrs['tool.outputs']) ?? null;
      events.push(event('tool_started', 'assistant', sessionId, startTime, { toolName, toolUseId, args }));
      events.push(event(
        isError ? 'tool_failed' : 'tool_completed',
        'tool',
        sessionId,
        endTime,
        isError
          ? { toolUseId, error: str(span.status_message ?? 'Tool failed') }
          : { toolUseId, output }
      ));
      break;
    }

    case 'AGENT': {
      if (parentId) {
        events.push(event('subagent_dispatched', 'system', sessionId, startTime, { agentId: spanId, traceId, parentSpanId: parentId }));
        events.push(event('subagent_returned', 'system', sessionId, endTime, { agentId: spanId, traceId }));
      } else {
        events.push(event('session_started', 'system', sessionId, startTime, { traceId }));
      }
      break;
    }

    default: {
      // CHAIN / RETRIEVER / generic — emit input/output as messages if present
      const inputText = str(attrs['input.value'] ?? '');
      if (inputText) events.push(event('message', 'user', sessionId, startTime, { text: inputText }));
      const outputText = str(attrs['output.value'] ?? '');
      if (outputText) events.push(event('message', 'assistant', sessionId, endTime, { text: outputText }));
      break;
    }
  }

  return events;
}

function normalizeClaudeCodeLogEvent(span: OtelEntry, sessionId: string): CanonicalEvent[] {
  const events: CanonicalEvent[] = [];
  const attrs = (span.attributes as Record<string, unknown>) ?? {};
  const ts = str(span.start_time ?? new Date().toISOString());
  const name = str(span.name ?? '');

  switch (name) {
    case 'user_prompt': {
      const text = str(attrs['prompt'] ?? attrs['input.value'] ?? '');
      if (text) events.push(event('message', 'user', sessionId, ts, { text }));
      break;
    }
    case 'tool_decision': {
      const toolName = str(attrs['tool_name'] ?? attrs['tool.name'] ?? 'unknown');
      const toolUseId = str(attrs['tool_use_id'] ?? randomUUID());
      const args = tryJson(attrs['tool_input'] ?? attrs['tool.inputs']) ?? {};
      events.push(event('tool_started', 'assistant', sessionId, ts, { toolName, toolUseId, args }));
      break;
    }
    case 'tool_result': {
      const toolUseId = str(attrs['tool_use_id'] ?? '');
      const isError = attrs['is_error'] === true || attrs['is_error'] === 'true';
      const output = attrs['tool_result'] ?? attrs['output.value'] ?? null;
      events.push(event(
        isError ? 'tool_failed' : 'tool_completed',
        'tool',
        sessionId,
        ts,
        isError ? { toolUseId, error: str(output) } : { toolUseId, output }
      ));
      break;
    }
    case 'file_edit': {
      const filePath = str(attrs['file_path'] ?? attrs['path'] ?? '');
      events.push(event('tool_started', 'assistant', sessionId, ts, {
        toolName: 'file_edit',
        toolUseId: randomUUID(),
        args: { path: filePath }
      }));
      break;
    }
    case 'api_error': {
      const errMsg = str(attrs['error'] ?? attrs['message'] ?? 'API error');
      events.push(event('tool_failed', 'system', sessionId, ts, { toolUseId: '', error: errMsg }));
      break;
    }
    // api_request: useful for inference context but not a canvas event; skip
    default:
      break;
  }

  return events;
}

export function normalizeOtelSpan(entry: Record<string, unknown>, sessionId: string): CanonicalEvent[] {
  const attrs = (entry.attributes as Record<string, unknown>) ?? {};
  const spanKind = str(entry.span_kind ?? attrs['openinference.span.kind'] ?? '');
  const name = str(entry.name ?? '');

  if (!spanKind && CLAUDE_CODE_LOG_EVENTS.has(name)) {
    return normalizeClaudeCodeLogEvent(entry, sessionId);
  }

  return normalizeOpenInferenceSpan(entry, sessionId);
}
