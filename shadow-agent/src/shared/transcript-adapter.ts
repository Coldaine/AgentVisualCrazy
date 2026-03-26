import { CanonicalEvent } from './schema';

interface ClaudeTranscriptEntry {
  sessionId?: string;
  type?: string;
  cwd?: string;
  message?: {
    role?: string;
    content?: Array<Record<string, unknown>> | string;
  };
}

function makeId(index: number, suffix: string): string {
  return `transcript-${index}-${suffix}`;
}

function makeTimestamp(eventIndex: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, eventIndex)).toISOString();
}

export function parseClaudeTranscriptJsonl(raw: string): CanonicalEvent[] {
  const events: CanonicalEvent[] = [];
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let activeSessionId = 'claude-transcript-session';
  let eventIndex = 0;

  const nextTimestamp = (): string => {
    const timestamp = makeTimestamp(eventIndex);
    eventIndex += 1;
    return timestamp;
  };

  lines.forEach((line, index) => {
    let parsed: ClaudeTranscriptEntry;
    try {
      parsed = JSON.parse(line) as ClaudeTranscriptEntry;
    } catch {
      return;
    }

    activeSessionId = parsed.sessionId || activeSessionId;
    if (index === 0) {
      events.push({
        id: makeId(index, 'session-started'),
        sessionId: activeSessionId,
        source: 'claude-transcript',
        timestamp: nextTimestamp(),
        actor: 'system',
        kind: 'session_started',
        payload: { cwd: parsed.cwd ?? null }
      });
    }

    if (!parsed.message) {
      return;
    }

    const role = parsed.message.role || 'unknown';
    const content = parsed.message.content;

    if (typeof content === 'string') {
      events.push({
        id: makeId(index, 'message'),
        sessionId: activeSessionId,
        source: 'claude-transcript',
        timestamp: nextTimestamp(),
        actor: role,
        kind: 'message',
        payload: { text: content }
      });
      return;
    }

    if (!Array.isArray(content)) {
      return;
    }

    content.forEach((block, blockIndex) => {
      const type = String(block.type ?? '');
      if (type === 'text' && typeof block.text === 'string') {
        events.push({
          id: makeId(index, `text-${blockIndex}`),
          sessionId: activeSessionId,
          source: 'claude-transcript',
          timestamp: nextTimestamp(),
          actor: role,
          kind: 'message',
          payload: { text: block.text }
        });
      } else if (type === 'tool_use') {
        const input = (block.input ?? {}) as Record<string, unknown>;
        events.push({
          id: makeId(index, `tool-start-${blockIndex}`),
          sessionId: activeSessionId,
          source: 'claude-transcript',
          timestamp: nextTimestamp(),
          actor: role,
          kind: 'tool_started',
          payload: {
            toolName: block.name ?? 'unknown',
            ...input
          }
        });
      } else if (type === 'tool_result') {
        const isError = block.is_error === true;
        events.push({
          id: makeId(index, `tool-result-${blockIndex}`),
          sessionId: activeSessionId,
          source: 'claude-transcript',
          timestamp: nextTimestamp(),
          actor: role,
          kind: isError ? 'tool_failed' : 'tool_completed',
          payload: {
            toolUseId: block.tool_use_id ?? null,
            content: block.content ?? null
          }
        });
      } else if (type === 'thinking' && typeof block.thinking === 'string') {
        events.push({
          id: makeId(index, `thinking-${blockIndex}`),
          sessionId: activeSessionId,
          source: 'claude-transcript',
          timestamp: nextTimestamp(),
          actor: role,
          kind: 'message',
          payload: { text: block.thinking }
        });
      }
    });
  });

  if (events.length > 0) {
    events.push({
      id: makeId(lines.length, 'session-ended'),
      sessionId: activeSessionId,
      source: 'claude-transcript',
      timestamp: nextTimestamp(),
      actor: 'system',
      kind: 'session_ended',
      payload: {}
    });
  }

  return events;
}
