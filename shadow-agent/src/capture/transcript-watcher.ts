/**
 * Robust file-tail capture transport for Claude transcript JSONL files.
 *
 * Tracks byte offsets, detects truncation, and fingerprints the head of the file
 * so rotated/replaced transcripts are replayed from the beginning even when the
 * replacement file is the same size or larger than the previous one.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { open, stat } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';
import type { EventQueueBackpressureState } from '../shared/schema';
import { createLogger } from '../shared/logger';
import { discoverActiveSession, type DiscoveredSession } from './session-discovery';
import type {
  CaptureSession,
  CaptureTransport,
  CaptureTransportContext,
  CaptureTransportSubscription,
  FileTailCaptureTransportOptions
} from './capture-transport';

const logger = createLogger({ minLevel: 'info' });

export type ChunkCallback = (chunk: string) => void;

export interface TranscriptWatcher {
  stop(): void;
}

export interface TranscriptWatcherOptions {
  getBackpressure?: () => EventQueueBackpressureState;
}

interface FileFingerprint {
  size: number;
  mtimeMs: number;
  ino?: number;
  checksum: string;
}

const DEFAULT_DISCOVERY_INTERVAL_MS = 30_000;
const DEFAULT_FINGERPRINT_BYTES = 4_096;
const DEBOUNCE_MS = 100;
const READ_CHUNK = 65_536;

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

function buildSession(discovered: DiscoveredSession): CaptureSession {
  return {
    sessionId: discovered.sessionId,
    label: `Live: ${discovered.sessionId.slice(0, 12)}`,
    source: 'claude-transcript',
    path: discovered.filePath,
    transportId: 'file-tail'
  };
}

async function computeFileFingerprint(
  filePath: string,
  fingerprintBytes: number
): Promise<FileFingerprint | null> {
  try {
    const info = await stat(filePath);
    const byteCount = Math.max(0, Math.min(info.size, fingerprintBytes));
    const hash = createHash('sha1');

    if (byteCount > 0) {
      const handle = await open(filePath, 'r');
      try {
        const buffer = Buffer.allocUnsafe(byteCount);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        hash.update(buffer.subarray(0, bytesRead));
      } finally {
        await handle.close().catch(() => undefined);
      }
    }

    return {
      size: info.size,
      mtimeMs: info.mtimeMs,
      ino: typeof info.ino === 'number' ? info.ino : undefined,
      checksum: hash.digest('hex')
    };
  } catch {
    return null;
  }
}

function hasFingerprintChanged(previous: FileFingerprint | null, next: FileFingerprint | null): boolean {
  if (!previous || !next) {
    return false;
  }

  if (previous.ino !== undefined && next.ino !== undefined && previous.ino !== next.ino) {
    return true;
  }

  return previous.checksum !== next.checksum;
}

function attachWatcher(
  watchPath: string,
  onSignal: () => void
): fs.FSWatcher | null {
  try {
    return fs.watch(watchPath, { persistent: false }, () => {
      onSignal();
    });
  } catch (error) {
    logger.warn('capture', 'watcher.attach_failed', { watchPath, error });
    return null;
  }
}

export function createFileTailCaptureTransport(
  options: FileTailCaptureTransportOptions = { kind: 'file-tail' }
): CaptureTransport {
  return {
    id: 'file-tail',
    kind: 'file-tail',
    async start(context: CaptureTransportContext): Promise<CaptureTransportSubscription> {
      const discoveryIntervalMs = Math.max(1_000, options.discoveryIntervalMs ?? DEFAULT_DISCOVERY_INTERVAL_MS);
      const fingerprintBytes = Math.max(128, options.fingerprintBytes ?? DEFAULT_FINGERPRINT_BYTES);

      let activeSession: CaptureSession | null = null;
      let activeHandle: FileHandle | null = null;
      let activeFingerprint: FileFingerprint | null = null;
      let activeFileWatcher: fs.FSWatcher | null = null;
      let activeDirWatcher: fs.FSWatcher | null = null;
      let rediscoveryTimer: ReturnType<typeof setInterval> | null = null;
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      let stopped = false;
      let readInFlight = false;
      let pendingRead = false;
      let offset = 0;

      const closeHandle = async () => {
        if (!activeHandle) {
          return;
        }
        await activeHandle.close().catch(() => undefined);
        activeHandle = null;
      };

      const clearWatchers = () => {
        activeFileWatcher?.close();
        activeDirWatcher?.close();
        activeFileWatcher = null;
        activeDirWatcher = null;
      };

      const scheduleRead = (delay = DEBOUNCE_MS) => {
        if (stopped) {
          return;
        }
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          void readNew();
        }, computeWatchDelay(delay, context.getBackpressure()));
      };

      const resetCursor = async (reason: 'rotation' | 'truncation') => {
        if (!activeSession) {
          return;
        }
        await closeHandle();
        offset = 0;
        activeFingerprint = null;
        await context.onSessionReset(activeSession, reason);
      };

      const ensureWatchers = (filePath: string) => {
        clearWatchers();
        activeFileWatcher = attachWatcher(filePath, () => {
          scheduleRead();
        });
        activeDirWatcher = attachWatcher(path.dirname(filePath), () => {
          scheduleRead();
        });
      };

      const readNew = async () => {
        if (stopped || !activeSession) {
          return;
        }
        if (readInFlight) {
          pendingRead = true;
          return;
        }

        readInFlight = true;
        try {
          const filePath = activeSession.path;
          if (!filePath) {
            return;
          }

          const info = await stat(filePath).catch(() => null);
          if (!info) {
            return;
          }

          const fingerprint = await computeFileFingerprint(filePath, fingerprintBytes);

          if (info.size < offset) {
            logger.info('capture', 'watcher.truncated', { filePath, oldOffset: offset });
            await resetCursor('truncation');
          } else if (offset > 0 && hasFingerprintChanged(activeFingerprint, fingerprint)) {
            logger.info('capture', 'watcher.rotated', { filePath });
            await resetCursor('rotation');
          }

          if (info.size <= offset) {
            activeFingerprint = fingerprint;
            return;
          }

          if (!activeHandle) {
            activeHandle = await open(filePath, 'r');
          }

          while (!stopped) {
            const remaining = info.size - offset;
            if (remaining <= 0) {
              break;
            }

            const buffer = Buffer.allocUnsafe(Math.min(remaining, READ_CHUNK));
            const { bytesRead } = await activeHandle.read(buffer, 0, buffer.length, offset);
            if (bytesRead <= 0) {
              break;
            }

            offset += bytesRead;
            await context.onChunk({
              session: activeSession,
              chunk: buffer.subarray(0, bytesRead).toString('utf8')
            });
          }

          activeFingerprint = fingerprint;
        } catch (error) {
          logger.error('capture', 'watcher.read_error', {
            filePath: activeSession.path,
            error
          });
          await closeHandle();
        } finally {
          readInFlight = false;
          if (pendingRead) {
            pendingRead = false;
            scheduleRead(0);
          }
        }
      };

      const activateSession = async (discovered: DiscoveredSession) => {
        const nextSession = buildSession(discovered);
        const isSameFile = activeSession?.path === nextSession.path;
        if (isSameFile) {
          return;
        }

        await closeHandle();
        clearWatchers();

        activeSession = nextSession;
        offset = 0;
        activeFingerprint = null;
        ensureWatchers(discovered.filePath);
        await context.onSessionStarted(nextSession);
        scheduleRead(0);
      };

      const runDiscovery = async () => {
        const discovered = await discoverActiveSession(options.overridePath);
        if (!discovered) {
          return;
        }
        await activateSession(discovered);
      };

      await runDiscovery();

      if (!options.overridePath) {
        rediscoveryTimer = setInterval(() => {
          void runDiscovery();
        }, discoveryIntervalMs);
      }

      return {
        async stop() {
          stopped = true;
          if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
          }
          if (rediscoveryTimer) {
            clearInterval(rediscoveryTimer);
            rediscoveryTimer = null;
          }
          clearWatchers();
          await closeHandle();
          logger.info('capture', 'watcher.stopped', { filePath: activeSession?.path });
        }
      };
    }
  };
}

export function watchTranscript(
  filePath: string,
  onChunk: ChunkCallback,
  options: TranscriptWatcherOptions = {}
): TranscriptWatcher {
  let stopped = false;
  let subscriptionPromise: Promise<CaptureTransportSubscription> | null = null;

  subscriptionPromise = createFileTailCaptureTransport({
    kind: 'file-tail',
    overridePath: filePath
  }).start({
    getBackpressure: () =>
      options.getBackpressure?.() ?? {
        level: 'normal',
        shouldThrottle: false,
        totalRatio: 0,
        pendingWrites: 0
      },
    onSessionStarted: () => undefined,
    onSessionReset: () => undefined,
    onChunk: ({ chunk }) => {
      onChunk(chunk);
    }
  });

  return {
    stop() {
      if (stopped) {
        return;
      }
      stopped = true;
      void subscriptionPromise?.then((subscription) => subscription.stop());
      subscriptionPromise = null;
    }
  };
}
