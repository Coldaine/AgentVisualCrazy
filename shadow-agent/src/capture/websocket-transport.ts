import { createLogger } from '../shared/logger';
import type {
  CaptureSession,
  CaptureTransport,
  CaptureTransportContext,
  CaptureTransportSubscription,
  WebSocketCaptureTransportOptions
} from './capture-transport';

const logger = createLogger({ minLevel: 'info' });
const DEFAULT_RECONNECT_DELAY_MS = 1_000;

function buildSession(options: WebSocketCaptureTransportOptions): CaptureSession {
  const url = new URL(options.url);
  return {
    sessionId: options.sessionId ?? `websocket-${url.host}`,
    label: options.sessionLabel ?? `Live WebSocket: ${url.host}`,
    source: 'claude-hook',
    path: options.url,
    transportId: 'websocket'
  };
}

function ensureMessageDelimiter(chunk: string): string {
  return chunk.endsWith('\n') ? chunk : `${chunk}\n`;
}

async function readMessageData(data: unknown): Promise<string | null> {
  if (typeof data === 'string') {
    return ensureMessageDelimiter(data);
  }
  if (data instanceof ArrayBuffer) {
    return ensureMessageDelimiter(Buffer.from(data).toString('utf8'));
  }
  if (ArrayBuffer.isView(data)) {
    return ensureMessageDelimiter(Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8'));
  }
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return ensureMessageDelimiter(await data.text());
  }
  return null;
}

export function createWebSocketCaptureTransport(
  options: WebSocketCaptureTransportOptions
): CaptureTransport {
  return {
    id: 'websocket',
    kind: 'websocket',
    async start(context: CaptureTransportContext): Promise<CaptureTransportSubscription> {
      const session = buildSession(options);
      const reconnectDelayMs = Math.max(50, options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS);

      let socket: WebSocket | null = null;
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
      let stopped = false;
      let hasOpened = false;

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
          void connect();
        }, reconnectDelayMs);
      };

      const connect = async (): Promise<void> => {
        if (stopped) {
          return;
        }

        logger.info('capture', 'transport.websocket.connecting', { url: options.url });
        const nextSocket = new WebSocket(options.url, options.protocols);
        socket = nextSocket;

        nextSocket.onopen = () => {
          void (async () => {
            if (!hasOpened) {
              await context.onSessionStarted(session);
              hasOpened = true;
            } else {
              await context.onSessionReset(session, 'reconnect');
            }
          })();
        };

        nextSocket.onmessage = (event) => {
          void (async () => {
            const chunk = await readMessageData(event.data);
            if (chunk) {
              await context.onChunk({ session, chunk });
            }
          })();
        };

        nextSocket.onerror = (event) => {
          if (!stopped) {
            logger.warn('capture', 'transport.websocket.error', { url: options.url, error: event });
          }
        };

        nextSocket.onclose = () => {
          if (!stopped) {
            scheduleReconnect();
          }
        };
      };

      void connect();

      return {
        stop() {
          stopped = true;
          clearReconnectTimer();
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.close();
          } else {
            socket?.close();
          }
          socket = null;
          logger.info('capture', 'transport.websocket.stopped', { url: options.url });
        }
      };
    }
  };
}

