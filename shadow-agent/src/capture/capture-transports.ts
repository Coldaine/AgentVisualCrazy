import type { CaptureTransport, CaptureTransportOptions, HttpStreamCaptureTransportOptions, SocketCaptureTransportOptions, WebSocketCaptureTransportOptions } from './capture-transport';
import { createHttpStreamCaptureTransport } from './http-stream-transport';
import { createSocketCaptureTransport } from './socket-transport';
import { createFileTailCaptureTransport } from './transcript-watcher';
import { createWebSocketCaptureTransport } from './websocket-transport';

const DEFAULT_CAPTURE_TRANSPORT = 'file-tail';

function requiredEnv(value: string | undefined, variableName: string): string {
  if (value && value.trim()) {
    return value.trim();
  }
  throw new Error(`Missing required capture environment variable: ${variableName}`);
}

function parsePort(raw: string | undefined): number {
  const port = Number.parseInt(requiredEnv(raw, 'SHADOW_CAPTURE_SOCKET_PORT'), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid SHADOW_CAPTURE_SOCKET_PORT: ${raw ?? '<unset>'}`);
  }
  return port;
}

export function resolveCaptureTransportOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): CaptureTransportOptions {
  const kind = (env.SHADOW_CAPTURE_TRANSPORT ?? DEFAULT_CAPTURE_TRANSPORT).trim().toLowerCase();

  switch (kind) {
    case 'file-tail':
      return {
        kind: 'file-tail',
        overridePath: env.SHADOW_CAPTURE_FILE?.trim() || undefined
      };
    case 'http':
    case 'http-stream':
      return {
        kind: 'http-stream',
        url: requiredEnv(env.SHADOW_CAPTURE_HTTP_URL ?? env.SHADOW_CAPTURE_TARGET, 'SHADOW_CAPTURE_HTTP_URL'),
        reconnectDelayMs: env.SHADOW_CAPTURE_RECONNECT_MS ? Number.parseInt(env.SHADOW_CAPTURE_RECONNECT_MS, 10) : undefined,
        sessionId: env.SHADOW_CAPTURE_SESSION_ID?.trim() || undefined,
        sessionLabel: env.SHADOW_CAPTURE_SESSION_LABEL?.trim() || undefined
      } satisfies HttpStreamCaptureTransportOptions;
    case 'ws':
    case 'websocket':
      return {
        kind: 'websocket',
        url: requiredEnv(env.SHADOW_CAPTURE_WS_URL ?? env.SHADOW_CAPTURE_TARGET, 'SHADOW_CAPTURE_WS_URL'),
        reconnectDelayMs: env.SHADOW_CAPTURE_RECONNECT_MS ? Number.parseInt(env.SHADOW_CAPTURE_RECONNECT_MS, 10) : undefined,
        sessionId: env.SHADOW_CAPTURE_SESSION_ID?.trim() || undefined,
        sessionLabel: env.SHADOW_CAPTURE_SESSION_LABEL?.trim() || undefined
      } satisfies WebSocketCaptureTransportOptions;
    case 'socket':
      return {
        kind: 'socket',
        host: requiredEnv(env.SHADOW_CAPTURE_SOCKET_HOST, 'SHADOW_CAPTURE_SOCKET_HOST'),
        port: parsePort(env.SHADOW_CAPTURE_SOCKET_PORT),
        reconnectDelayMs: env.SHADOW_CAPTURE_RECONNECT_MS ? Number.parseInt(env.SHADOW_CAPTURE_RECONNECT_MS, 10) : undefined,
        sessionId: env.SHADOW_CAPTURE_SESSION_ID?.trim() || undefined,
        sessionLabel: env.SHADOW_CAPTURE_SESSION_LABEL?.trim() || undefined
      } satisfies SocketCaptureTransportOptions;
    default:
      throw new Error(`Unsupported SHADOW_CAPTURE_TRANSPORT: ${kind}`);
  }
}

export function createCaptureTransport(options: CaptureTransportOptions): CaptureTransport {
  switch (options.kind) {
    case 'file-tail':
      return createFileTailCaptureTransport(options);
    case 'http-stream':
      return createHttpStreamCaptureTransport(options);
    case 'websocket':
      return createWebSocketCaptureTransport(options);
    case 'socket':
      return createSocketCaptureTransport(options);
  }
}
