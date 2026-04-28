/**
 * Watches a single JSONL transcript file for new lines, handles truncation and rotation.
 * Emits raw string chunks to registered callbacks.
 */
import { open, stat } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import fs from 'node:fs';
import type { EventQueueBackpressureState } from '../shared/schema';
import { createLogger } from '../shared/logger';

const logger = createLogger({ minLevel: 'info' });

export type ChunkCallback = (chunk: string) => void;

export interface TranscriptWatcher {
  stop(): void;
}

export interface TranscriptWatcherOptions {
  getBackpressure?: () => EventQueueBackpressureState;
}

const DEBOUNCE_MS = 100;
const READ_CHUNK = 65_536; // 64 KB

export function computeWatchDelay(
  baseDelayMs: number,
  backpressure?: EventQueueBackpressureState
): number {
  if (!backpressure) {
    return baseDelayMs;
  }
  if (backpressure.level === 'critical') {
    return Math.max(baseDelayMs, 500);
  }
  if (backpressure.level === 'high') {
    return Math.max(baseDelayMs, 250);
  }
  return baseDelayMs;
}

export function watchTranscript(
  filePath: string,
  onChunk: ChunkCallback,
  options: TranscriptWatcherOptions = {}
): TranscriptWatcher {
  let offset = 0;
  let handle: FileHandle | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const readNew = async () => {
    try {
      const info = await stat(filePath);

      // File was truncated or rotated → reset
      if (info.size < offset) {
        logger.info('capture', 'watcher.truncated', { filePath, oldOffset: offset });
        if (handle) {
          await handle.close().catch(() => undefined);
          handle = null;
        }
        offset = 0;
      }

      if (info.size <= offset) return;

      if (!handle) {
        handle = await open(filePath, 'r');
      }

      const toRead = info.size - offset;
      const buf = Buffer.allocUnsafe(Math.min(toRead, READ_CHUNK));
      const { bytesRead } = await handle.read(buf, 0, buf.length, offset);
      if (bytesRead > 0) {
        offset += bytesRead;
        onChunk(buf.subarray(0, bytesRead).toString('utf8'));
        // If there's more data, schedule another read immediately
        if (bytesRead === READ_CHUNK) {
          scheduleRead(0);
        }
      }
    } catch (err) {
      logger.error('capture', 'watcher.read_error', { filePath, error: err });
      if (handle) {
        await handle.close().catch(() => undefined);
        handle = null;
      }
    }
  };

  const scheduleRead = (delay = DEBOUNCE_MS) => {
    if (stopped) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    const nextDelay = computeWatchDelay(delay, options.getBackpressure?.());
    debounceTimer = setTimeout(() => {
      void readNew();
    }, nextDelay);
  };

  const watcher = fs.watch(filePath, { persistent: false }, () => {
    scheduleRead();
  });

  watcher.on('error', (err) => {
    logger.error('capture', 'watcher.fs_error', { filePath, error: err });
  });

  // Initial read — catch up on existing content
  void readNew();

  return {
    stop() {
      stopped = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      watcher.close();
      if (handle) {
        void handle.close().catch(() => undefined);
        handle = null;
      }
      logger.info('capture', 'watcher.stopped', { filePath });
    },
  };
}
