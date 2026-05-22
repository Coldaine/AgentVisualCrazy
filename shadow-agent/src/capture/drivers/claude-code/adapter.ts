import { randomUUID } from 'node:crypto';
import type { HarnessAdapter } from '../harness-driver';
import type { CanonicalEvent, EventKind } from '../../../shared/schema';
import type { ParsedEntry } from '../../incremental-parser';
import { createLogger } from '../../../shared/logger';

const logger = createLogger({ minLevel: 'info' });

export const claudeCodeAdapter: HarnessAdapter = {
  parseEntry(entry: ParsedEntry, sessionId: string, harnessId: string): CanonicalEvent[] {
    const events: CanonicalEvent[] = [];
    const timestamp =
      typeof entry.timestamp === 'string'
        ? entry.timestamp
        : typeof entry.created_at === 'string'
          ? entry.created_at
          : new Date().toISOString();
    const source = 'claude-transcript' as const;

    const type = typeof entry.type === 'string' ? entry.type : '';

    if (type === 'session' || (type === '' && entry.cwd)) {
      events.push({
        id: randomUUID(),
        sessionId,
        source,
        harnessId,
        timestamp,
        actor: 'system',
        kind: 'session_started',
        payload: { cwd: entry.cwd ?? null }
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
        harnessId,
        timestamp,
        actor: role,
        kind: 'message',
        payload: { text: content }
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
          harnessId,
          timestamp,
          actor: role,
          kind: 'message',
          payload: { text: block.text }
        });
      } else if (blockType === 'tool_use') {
        events.push({
          id: randomUUID(),
          sessionId,
          source,
          harnessId,
          timestamp,
          actor: role,
          kind: 'tool_started',
          payload: {
            toolName: block.name ?? 'unknown',
            toolUseId: block.id ?? randomUUID(),
            args: block.input ?? {}
          }
        });
      } else if (blockType === 'tool_result') {
        const isError = block.is_error === true;
        const kind: EventKind = isError ? 'tool_failed' : 'tool_completed';
        events.push({
          id: randomUUID(),
          sessionId,
          source,
          harnessId,
          timestamp,
          actor: role,
          kind,
          payload: {
            toolUseId: block.tool_use_id ?? randomUUID(),
            output: block.content ?? null,
            error: isError ? block.content : undefined
          }
        });
      } else if (blockType !== '') {
        logger.debug('capture', 'claude_code_adapter.unknown_block_type', { blockType });
      }
    }

    return events;
  }
};
