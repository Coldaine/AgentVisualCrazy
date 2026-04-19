/**
 * Normalizes raw Claude Code transcript entries into CanonicalEvents.
 * Reuses the same mapping logic as transcript-adapter.ts but operates on
 * individual entries rather than full files.
 */
import { randomUUID } from 'node:crypto';
import type { CanonicalEvent, EventKind } from '../shared/schema';
import type { ParsedEntry } from './incremental-parser';
import { createLogger } from '../shared/logger';

const logger = createLogger({ minLevel: 'info' });

export type NormalizedEvent = CanonicalEvent;

function extractTimestamp(entry: ParsedEntry): string {
  const ts = entry.timestamp ?? entry.created_at;
  if (typeof ts === 'string') return ts;
  return new Date().toISOString();
}

export function normalizeEntry(
  entry: ParsedEntry,
  sessionId: string
): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];
  const timestamp = extractTimestamp(entry);
  const source = 'claude-transcript' as const;

  const type = typeof entry.type === 'string' ? entry.type : '';

  // Session lifecycle
  if (type === 'session' || (type === '' && entry.cwd)) {
    events.push({
      id: randomUUID(),
      sessionId,
      source,
      timestamp,
      actor: 'system',
      kind: 'session_started',
      payload: { cwd: entry.cwd ?? null },
    });
    return events;
  }

  const message = entry.message as Record<string, unknown> | undefined;
  if (!message) return events;

  const role = typeof message.role === 'string' ? message.role : 'unknown';
  const content = message.content;

  if (typeof content === 'string') {
    events.push({
      id: randomUUID(),
      sessionId,
      source,
      timestamp,
      actor: role,
      kind: 'message',
      payload: { text: content },
    });
    return events;
  }

  if (!Array.isArray(content)) return events;

  for (const block of content as ParsedEntry[]) {
    const blockType = typeof block.type === 'string' ? block.type : '';

    if (blockType === 'text' && typeof block.text === 'string') {
      events.push({
        id: randomUUID(),
        sessionId,
        source,
        timestamp,
        actor: role,
        kind: 'message',
        payload: { text: block.text },
      });
    } else if (blockType === 'tool_use') {
      events.push({
        id: randomUUID(),
        sessionId,
        source,
        timestamp,
        actor: role,
        kind: 'tool_started',
        payload: {
          toolName: block.name ?? 'unknown',
          toolUseId: block.id ?? randomUUID(),
          args: block.input ?? {},
        },
      });
    } else if (blockType === 'tool_result') {
      const isError = block.is_error === true;
      const kind: EventKind = isError ? 'tool_failed' : 'tool_completed';
      events.push({
        id: randomUUID(),
        sessionId,
        source,
        timestamp,
        actor: role,
        kind,
        payload: {
          toolUseId: block.tool_use_id ?? randomUUID(),
          output: block.content ?? null,
          error: isError ? block.content : undefined,
        },
      });
    } else if (blockType !== '') {
      logger.debug('capture', 'normalizer.unknown_block_type', { blockType });
    }
  }

  return events;
}
