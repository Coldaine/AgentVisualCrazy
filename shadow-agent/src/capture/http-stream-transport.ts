import { createLogger } from '../shared/logger';
import type {
  CaptureSession,
  CaptureTransport,
  CaptureTransportContext,
  CaptureTransportSubscription,
  HttpStreamCaptureTransportOptions
} from './capture-transport';

const logger = createLogger({ minLevel: 'info' });
const DEFAULT_RECONNECT_DELAY_MS = 1_000;

function buildSession(options: HttpStreamCaptureTransportOptions): CaptureSession {
  const url = new URL(options.url);
  return {
    sessionId: options.sessionId ?? `http-stream-${url.host}`,
    label: options.sessionLabel ?? `Live HTTP: ${url.host}`,
    source: 'claude-hook',
    path: options.url,
    transportId: 'http-stream'
  };
}

export function createHttpStreamCaptureTransport(
  options: HttpStreamCaptureTransportOptions
): CaptureTransport {
  return {
    id: 'http-stream',
    kind: 'http-stream',
    async start(context: CaptureTransportContext): Promise<CaptureTransportSubscription> {
      const session = buildSession(options);
      const reconnectDelayMs = Math.max(50, options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS);
      const decoder = new TextDecoder();

      let abortController: AbortController | null = null;
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
          void connect();
        }, reconnectDelayMs);
      };

      const connect = async (): Promise<void> => {
        if (stopped) {
          return;
        }

        abortController = new AbortController();
        try {
          logger.info('capture', 'transport.http_stream.connecting', { url: options.url });
          const response = await fetch(options.url, {
            headers: options.headers,
            signal: abortController.signal
          });

          if (!response.ok) {
            throw new Error(`HTTP stream responded with ${response.status} ${response.statusText}`);
          }
          if (!response.body) {
            throw new Error('HTTP stream response did not provide a body.');
          }

          if (!hasConnected) {
            await context.onSessionStarted(session);
            hasConnected = true;
          } else {
            await context.onSessionReset(session, 'reconnect');
          }

          const reader = response.body.getReader();
          try {
            while (!stopped) {
              const { value, done } = await reader.read();
              if (done) {
                const trailing = decoder.decode();
                if (trailing) {
                  await context.onChunk({ session, chunk: trailing });
                }
                break;
              }
              if (value && value.byteLength > 0) {
                await context.onChunk({
                  session,
                  chunk: decoder.decode(value, { stream: true })
                });
              }
            }
          } finally {
            reader.releaseLock();
          }
        } catch (error) {
          if (!stopped) {
            logger.warn('capture', 'transport.http_stream.error', { url: options.url, error });
          }
        } finally {
          abortController = null;
          if (!stopped) {
            scheduleReconnect();
          }
        }
      };

      void connect();

      return {
        stop() {
          stopped = true;
          clearReconnectTimer();
          abortController?.abort();
          abortController = null;
          logger.info('capture', 'transport.http_stream.stopped', { url: options.url });
        }
      };
    }
  };
}

