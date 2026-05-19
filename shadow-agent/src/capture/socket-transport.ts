import net from 'node:net';
import { createLogger } from '../shared/logger';
import type {
  CaptureSession,
  CaptureTransport,
  CaptureTransportContext,
  CaptureTransportSubscription,
  SocketCaptureTransportOptions
} from './capture-transport';
import { computeWatchDelay } from './transcript-watcher';

const logger = createLogger({ minLevel: 'info' });
const DEFAULT_RECONNECT_DELAY_MS = 1_000;

function buildSession(options: SocketCaptureTransportOptions): CaptureSession {
  return {
    sessionId: options.sessionId ?? `socket-${options.host}:${options.port}`,
    label: options.sessionLabel ?? `Live Socket: ${options.host}:${options.port}`,
    source: 'claude-hook',
    path: `tcp://${options.host}:${options.port}`,
    transportId: 'socket'
  };
}

export function createSocketCaptureTransport(
  options: SocketCaptureTransportOptions
): CaptureTransport {
  return {
    id: 'socket',
    kind: 'socket',
    async start(context: CaptureTransportContext): Promise<CaptureTransportSubscription> {
      const session = buildSession(options);
      const reconnectDelayMs = Math.max(50, options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS);

      let socket: net.Socket | null = null;
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
      let stopped = false;
      let hasConnected = false;

      const clearReconnectTimer = () => {
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
      };

      const scheduleReconnect = () => {
        if (stopped || reconnectTimer) {
          return;
        }
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, reconnectDelayMs);
      };

      const connect = () => {
        if (stopped) {
          return;
        }

        logger.info('capture', 'transport.socket.connecting', {
          host: options.host,
          port: options.port
        });

        const nextSocket = net.createConnection({
          host: options.host,
          port: options.port
        });
        socket = nextSocket;
        nextSocket.setEncoding('utf8');

        nextSocket.on('connect', () => {
          void (async () => {
            if (!hasConnected) {
              await context.onSessionStarted(session);
              hasConnected = true;
            } else {
              await context.onSessionReset(session, 'reconnect');
            }
          })();
        });

        nextSocket.on('data', (chunk: string) => {
          void (async () => {
            const backpressure = context.getBackpressure();
            if (backpressure.shouldThrottle) {
              nextSocket.pause();
              setTimeout(() => {
                if (!stopped) {
                  nextSocket.resume();
                }
              }, computeWatchDelay(50, backpressure));
            }
            await context.onChunk({ session, chunk });
          })();
        });

        nextSocket.on('error', (error) => {
          if (!stopped) {
            logger.warn('capture', 'transport.socket.error', {
              host: options.host,
              port: options.port,
              error
            });
          }
        });

        nextSocket.on('close', () => {
          if (!stopped) {
            scheduleReconnect();
          }
        });
      };

      connect();

      return {
        stop() {
          stopped = true;
          clearReconnectTimer();
          socket?.destroy();
          socket = null;
          logger.info('capture', 'transport.socket.stopped', {
            host: options.host,
            port: options.port
          });
        }
      };
    }
  };
}
