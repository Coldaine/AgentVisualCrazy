/**
 * Session manager orchestrates the full capture pipeline:
 * transport → incremental parser → normalizer → buffer → IPC bridge
 *
 * The transport decides where bytes come from (file tail, HTTP stream,
 * WebSocket, socket) and when sessions rotate or reconnect.
 */
import type { WebContents } from 'electron';
import type { SnapshotPayload, LoadedSource, ShadowInsight } from '../shared/schema';
import { buildRendererInput } from '../shared/renderer-input-adapter';
import { createIncrementalParser } from './incremental-parser';
import { driverRegistry } from './drivers';
import { createEventBuffer, type EventBuffer } from './event-buffer';
import { createIpcBridge, type IpcBridge } from './ipc-bridge';
import { createLogger, type Logger } from '../shared/logger';
import type {
  CaptureSession,
  CaptureTransport,
  CaptureTransportOptions,
  CaptureTransportSubscription
} from './capture-transport';
import { createCaptureTransport } from './capture-transports';

export interface SessionManagerOptions {
  queuePersistenceRoot?: string;
  queueMemoryCapacity?: number;
  queueTotalCapacity?: number;
  transport?: CaptureTransport | CaptureTransportOptions;
  logger?: Logger;
}

export interface SessionManager {
  start(overridePath?: string): Promise<void>;
  stop(): void;
  getBuffer(): EventBuffer;
  getCurrentSnapshot(): Promise<SnapshotPayload | null>;
  /**
   * Store the latest model-produced insights. They are merged into the next
   * snapshot (quarantined: model insights replace heuristic ones when present)
   * and a renderer re-pull is nudged via the IPC bridge.
   */
  setModelInsights(insights: ShadowInsight[]): void;
}

export function createSessionManager(
  getWebContents: () => WebContents | null,
  options: SessionManagerOptions = {}
): SessionManager {
  const logger = options.logger ?? createLogger({ minLevel: 'info' });
  const buffer = createEventBuffer({
    persistenceRoot: options.queuePersistenceRoot,
    memoryCapacity: options.queueMemoryCapacity,
    totalCapacity: options.queueTotalCapacity,
    logger
  });
  let activeSession: CaptureSession | null = null;
  let activeParser = createIncrementalParser(() => undefined);
  let transportSubscription: CaptureTransportSubscription | null = null;
  let bridgeCleanup: (() => void) | null = null;
  let bridge: IpcBridge | null = null;
  let latestModelInsights: ShadowInsight[] = [];
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

    const rendererInput = buildRendererInput(events, {
      source,
      fallbackTitle: sessionTitle
    });

    // Quarantine: when the model has produced insights, render those ONLY.
    // Otherwise fall back to the heuristic insights from deriveState. The two
    // are never interleaved — heuristic insights are tagged source:'heuristic'
    // and serve purely as a no-model fallback.
    const shadowInsights =
      latestModelInsights.length > 0 ? latestModelInsights : rendererInput.state.shadowInsights;

    return {
      ...rendererInput,
      state: {
        ...rendererInput.state,
        shadowInsights
      },
      captureQueue: buffer.getMetrics()
    };
  };

  const teardown = () => {
    void transportSubscription?.stop();
    transportSubscription = null;
    activeSession = null;
  };

  const startSession = async (session: CaptureSession) => {
    sessionTitle = session.label;
    await buffer.setSession(session.sessionId);
    activeSession = session;
    const driver = driverRegistry.getForSource(session.source) ?? driverRegistry.getDefault();
    activeParser = createIncrementalParser((entry) => {
      const events = driver.normalizeEntry(entry, session.sessionId, session.source);
      if (events.length === 0) {
        return;
      }
      void buffer.push(events).catch((error) => {
        // Log push failures so we can diagnose event loss during high-volume
        // sessions or when a spinner/stuck parser accumulates 1M+ lines.
        logger.error('capture', 'session_manager.push_failed', {
          sessionId: session.sessionId,
          error
        });
      });
    });

    // Log session start so we can trace event flow end-to-end from discovery
    // through parsing, buffering, bridge, and renderer delivery.
    logger.info('capture', 'session_manager.start_session', {
      filePath: session.path,
      sessionId: session.sessionId,
      transportId: session.transportId
    });
  };

  return {
    async start(overridePath?: string) {
      // Start the IPC bridge
      bridge = createIpcBridge({
        buffer,
        getWebContents,
        buildSnapshot,
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
          // Log new session detection so we can diagnose why the watcher fires
          // (file rotation, new transcript, rediscovery) and confirm the
          // session switch reached the startSession pipeline.
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
          // Log resets so we can diagnose truncation vs rotation vs reconnect
          // in the transport layer. Each reason maps to a different debug path.
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
      bridge = null;
      // Log stop so we can confirm clean shutdown (no hung timers, open handles)
      // when diagnosing "session not refreshing" issues.
      logger.info('capture', 'session_manager.stopped');
    },

    getBuffer() {
      return buffer;
    },

    getCurrentSnapshot() {
      return buildSnapshot();
    },

    setModelInsights(insights: ShadowInsight[]) {
      latestModelInsights = insights;
      // Nudge the renderer to re-pull the snapshot so new model insights
      // surface even between transcript events (and on idle / session-end).
      bridge?.markDirty();
    },
  };
}
