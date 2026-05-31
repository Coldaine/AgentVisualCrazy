/**
 * Normalizes raw Claude Code transcript entries into CanonicalEvents.
 *
 * This is the canonical home for Claude-specific parsing logic extracted from
 * the legacy capture/normalizer.ts shim. Every event produced here carries
 * harnessId: 'claude-code' for downstream driver-aware consumers.
 */
import { randomUUID } from 'node:crypto';
import type { CanonicalEvent, EventKind, EventSource } from '../../../shared/schema';
import type { ParsedEntry } from '../../incremental-parser';
import { createLogger } from '../../../shared/logger';

const logger = createLogger({ minLevel: 'info' });

const HARNESS_ID = 'claude-code' as const;
const DEFAULT_SOURCE: EventSource = 'claude-transcript';

function extractTimestamp(entry: ParsedEntry): string {
  const ts = entry.timestamp ?? entry.created_at;
  if (typeof ts === 'string') return ts;
  return new Date().toISOString();
}

export function normalizeEntry(
  entry: ParsedEntry,
  sessionId: string,
  source: EventSource = DEFAULT_SOURCE
): CanonicalEvent[] {
  const events: CanonicalEvent[] = [];
  const timestamp = extractTimestamp(entry);

  const type = typeof entry.type === 'string' ? entry.type : '';

  if (type === 'session' || (type === '' && entry.cwd)) {
    events.push({
      id: randomUUID(),
      sessionId,
      source,
      timestamp,
      actor: 'system',
      kind: 'session_started',
      payload: { cwd: entry.cwd ?? null },
      harnessId: HARNESS_ID,
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
      harnessId: HARNESS_ID,
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
        harnessId: HARNESS_ID,
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
        harnessId: HARNESS_ID,
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
        harnessId: HARNESS_ID,
      });
    } else if (blockType === 'thinking' && typeof block.thinking === 'string') {
      events.push({
        id: randomUUID(),
        sessionId,
        source,
        timestamp,
        actor: role,
        kind: 'message',
        payload: { text: block.thinking, thinking: true },
        harnessId: HARNESS_ID,
      });
    } else if (blockType !== '') {
      logger.debug('capture', 'claude_driver.unknown_block_type', { blockType });
    }
  }

  return events;
}
