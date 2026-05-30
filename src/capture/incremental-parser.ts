/**
 * Incrementally parses JSONL chunks into raw objects.
 * Handles partial lines across chunk boundaries using an internal line buffer.
 */
import { createLogger } from '../shared/logger';

const logger = createLogger({ minLevel: 'info' });

export type ParsedEntry = Record<string, unknown>;
export type EntryCallback = (entry: ParsedEntry) => void;

export interface IncrementalParser {
  push(chunk: string): void;
  reset(): void;
}

export function createIncrementalParser(onEntry: EntryCallback): IncrementalParser {
  let lineBuffer = '';

  return {
    push(chunk: string) {
      lineBuffer += chunk;
      const parts = lineBuffer.split(/\r?\n/);
      // Last element may be a partial line — keep it in buffer
      lineBuffer = parts.pop() ?? '';

      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const entry = JSON.parse(trimmed) as ParsedEntry;
          onEntry(entry);
        } catch {
          logger.warn('capture', 'parser.malformed_line', { preview: trimmed.slice(0, 80) });
        }
      }
    },

    reset() {
      lineBuffer = '';
      logger.debug('capture', 'parser.reset');
    },
  };
}
