/**
 * Session manager orchestrates the full capture pipeline:
 * session discovery → watcher → incremental parser → normalizer → buffer → IPC bridge
 *
 * Scans every 30 seconds for new sessions. Tears down the old pipeline when a
 * new session is detected.
 */
import type { WebContents } from 'electron';
import type { SnapshotPayload, LoadedSource } from '../shared/schema';
import { deriveState } from '../shared/derive';
import { discoverActiveSession, type DiscoveredSession } from './session-discovery';
import { watchTranscript, type TranscriptWatcher } from './transcript-watcher';
import { createIncrementalParser } from './incremental-parser';
import { normalizeEntry } from './normalizer';
import { createEventBuffer, type EventBuffer } from './event-buffer';
import { createIpcBridge } from './ipc-bridge';
import { createLogger } from '../shared/logger';
import { readFile } from 'node:fs/promises';

const logger = createLogger({ minLevel: 'info' });

const REDISCOVERY_INTERVAL_MS = 30_000;

export interface SessionManager {
  start(overridePath?: string): Promise<void>;
  stop(): void;
  getBuffer(): EventBuffer;
  getCurrentSnapshot(): SnapshotPayload | null;
}

export function createSessionManager(
  getWebContents: () => WebContents | null
): SessionManager {
  const buffer = createEventBuffer();
  let activeSession: DiscoveredSession | null = null;
  let activeWatcher: TranscriptWatcher | null = null;
  let rediscoveryTimer: ReturnType<typeof setInterval> | null = null;
  let bridgeCleanup: (() => void) | null = null;
  let sessionTitle = 'Live session';

  const buildSnapshot = (): SnapshotPayload | null => {
    const events = buffer.getAll();
    const state = deriveState(events);
    const source: LoadedSource = {
      kind: 'transcript',
      label: sessionTitle,
      path: activeSession?.filePath,
    };
    const record = {
      sessionId: state.sessionId || activeSession?.sessionId || 'unknown',
      title: sessionTitle,
      startedAt: events[0]?.timestamp ?? new Date().toISOString(),
      updatedAt: events.at(-1)?.timestamp ?? new Date().toISOString(),
      source: 'claude-transcript' as const,
      eventCount: events.length,
    };
    return { source, record, state, events };
  };

  const teardown = () => {
    if (activeWatcher) {
      activeWatcher.stop();
      activeWatcher = null;
    }
    activeSession = null;
  };

  const startSession = async (session: DiscoveredSession) => {
    teardown();
    activeSession = session;
    sessionTitle = `Live: ${session.sessionId.slice(0, 12)}`;

    logger.info('capture', 'session_manager.start_session', {
      filePath: session.filePath,
      sessionId: session.sessionId,
    });

    // Catch-up: read the entire existing file first
    try {
      const raw = await readFile(session.filePath, 'utf8');
      const lines = raw.split(/\r?\n/).filter((l) => l.trim());
      const catchupEvents = lines.flatMap((line) => {
        try {
          const entry = JSON.parse(line) as Record<string, unknown>;
          return normalizeEntry(entry, session.sessionId);
        } catch {
          return [];
        }
      });
      if (catchupEvents.length > 0) {
        buffer.push(catchupEvents);
        logger.info('capture', 'session_manager.catchup', { count: catchupEvents.length });
      }
    } catch (err) {
      logger.warn('capture', 'session_manager.catchup_failed', { error: err });
    }

    // Then watch for incremental updates
    const parser = createIncrementalParser((entry) => {
      const events = normalizeEntry(entry, session.sessionId);
      if (events.length > 0) {
        buffer.push(events);
      }
    });

    activeWatcher = watchTranscript(session.filePath, (chunk) => {
      parser.push(chunk);
    });
  };

  const runRediscovery = async (overridePath?: string) => {
    const found = await discoverActiveSession(overridePath);
    if (!found) return;

    const isNewSession = !activeSession || found.filePath !== activeSession.filePath;
    if (isNewSession) {
      logger.info('capture', 'session_manager.new_session_detected', {
        filePath: found.filePath,
      });
      buffer.clear();
      await startSession(found);
    }
  };

  return {
    async start(overridePath?: string) {
      // Start the IPC bridge
      const bridge = createIpcBridge({
        buffer,
        getWebContents,
        buildSnapshot,
      });
      bridgeCleanup = bridge.start();

      // Initial discovery
      await runRediscovery(overridePath);

      // Periodic re-discovery
      rediscoveryTimer = setInterval(() => {
        void runRediscovery(overridePath);
      }, REDISCOVERY_INTERVAL_MS);
    },

    stop() {
      if (rediscoveryTimer) {
        clearInterval(rediscoveryTimer);
        rediscoveryTimer = null;
      }
      teardown();
      if (bridgeCleanup) {
        bridgeCleanup();
        bridgeCleanup = null;
      }
      logger.info('capture', 'session_manager.stopped');
    },

    getBuffer() {
      return buffer;
    },

    getCurrentSnapshot() {
      return buildSnapshot();
    },
  };
}
