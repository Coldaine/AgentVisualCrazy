/**
 * Session manager orchestrates the full capture pipeline:
 * transport → incremental parser → normalizer → buffer → IPC bridge
 *
 * The transport decides where bytes come from (file tail, HTTP stream,
 * WebSocket, socket) and when sessions rotate or reconnect.
 */
import type { WebContents } from 'electron';
import { DEFAULT_TRANSCRIPT_PRIVACY_SETTINGS } from '../shared/privacy';
import type { SnapshotPayload, LoadedSource, TranscriptPrivacySettings } from '../shared/schema';
import { buildRendererInput } from '../shared/renderer-input-adapter';
import { createIncrementalParser } from './incremental-parser';
import { normalizeEntry } from './normalizer';
import { createEventBuffer, type EventBuffer } from './event-buffer';
import { createIpcBridge } from './ipc-bridge';
import { createLogger } from '../shared/logger';
import type {
  CaptureSession,
  CaptureTransport,
  CaptureTransportOptions,
  CaptureTransportSubscription
} from './capture-transport';
import { createCaptureTransport } from './capture-transports';

const logger = createLogger({ minLevel: 'info' });

export interface SessionManager {
  start(overridePath?: string): Promise<void>;
  stop(): void;
  getBuffer(): EventBuffer;
  getCurrentSnapshot(): Promise<SnapshotPayload | null>;
}

export function createSessionManager(
  getWebContents: () => WebContents | null,
  options: {
    privacy?: TranscriptPrivacySettings;
    getPrivacy?: () => TranscriptPrivacySettings;
    queuePersistenceRoot?: string;
    queueMemoryCapacity?: number;
    queueTotalCapacity?: number;
    transport?: CaptureTransport | CaptureTransportOptions;
  } = {}
): SessionManager {
  const getPrivacy = options.getPrivacy ?? (() => options.privacy ?? DEFAULT_TRANSCRIPT_PRIVACY_SETTINGS);
  const buffer = createEventBuffer({
    persistenceRoot: options.queuePersistenceRoot,
    memoryCapacity: options.queueMemoryCapacity,
    totalCapacity: options.queueTotalCapacity
  });
  let activeSession: CaptureSession | null = null;
  let activeParser = createIncrementalParser(() => undefined);
  let transportSubscription: CaptureTransportSubscription | null = null;
  let bridgeCleanup: (() => void) | null = null;
  let sessionTitle = 'Live session';
  const transport =
    options.transport && 'start' in options.transport
      ? options.transport
      : createCaptureTransport(options.transport ?? { kind: 'file-tail' });

  const buildSnapshot = async (): Promise<SnapshotPayload | null> => {
    const events = await buffer.getAll();
    const source: LoadedSource = {
      kind: 'transcript',
      label: sessionTitle,
      path: activeSession?.path
    };

    return {
      ...buildRendererInput(events, {
        source,
        fallbackTitle: sessionTitle,
        privacySettings: getPrivacy()
      }),
      captureQueue: buffer.getMetrics()
    };
  };

  const teardown = () => {
    void transportSubscription?.stop();
    transportSubscription = null;
    activeSession = null;
  };

  const startSession = async (session: CaptureSession) => {
    activeSession = session;
    sessionTitle = session.label;
    await buffer.setSession(session.sessionId);
    activeParser = createIncrementalParser((entry) => {
      const events = normalizeEntry(entry, session.sessionId);
      if (events.length === 0) {
        return;
      }
      void buffer.push(events).catch((error) => {
        logger.error('capture', 'session_manager.push_failed', {
          sessionId: session.sessionId,
          error
        });
      });
    });

    logger.info('capture', 'session_manager.start_session', {
      filePath: session.path,
      sessionId: session.sessionId,
      transportId: session.transportId
    });
  };

  return {
    async start(overridePath?: string) {
      // Start the IPC bridge
      const bridge = createIpcBridge({
        buffer,
        getWebContents,
        buildSnapshot,
        getPrivacy,
      });
      bridgeCleanup = bridge.start();

      const effectiveTransport =
        overridePath && transport.kind === 'file-tail'
          ? createCaptureTransport({ kind: 'file-tail', overridePath })
          : transport;

      transportSubscription = await effectiveTransport.start({
        getBackpressure: () => buffer.getBackpressure(),
        onSessionStarted: async (session) => {
          const isNewSession =
            !activeSession ||
            session.sessionId !== activeSession.sessionId ||
            session.path !== activeSession.path;
          if (!isNewSession) {
            return;
          }
          logger.info('capture', 'session_manager.new_session_detected', {
            sessionId: session.sessionId,
            filePath: session.path,
            transportId: session.transportId
          });
          await startSession(session);
        },
        onSessionReset: async (session, reason) => {
          if (!activeSession || activeSession.sessionId !== session.sessionId) {
            return;
          }
          activeParser.reset();
          logger.info('capture', 'session_manager.session_reset', {
            sessionId: session.sessionId,
            reason,
            filePath: session.path
          });
        },
        onChunk: async ({ session, chunk }) => {
          if (!activeSession || activeSession.sessionId !== session.sessionId) {
            await startSession(session);
          }
          activeParser.push(chunk);
        }
      });
    },

    stop() {
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
