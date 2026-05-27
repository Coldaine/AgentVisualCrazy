import type { CaptureTransport, CaptureTransportOptions, HttpStreamCaptureTransportOptions, PhoenixCaptureTransportOptions, SocketCaptureTransportOptions, WebSocketCaptureTransportOptions } from './capture-transport';
import { createHttpStreamCaptureTransport } from './http-stream-transport';
import { createPhoenixCaptureTransport } from './phoenix-transport';
import { createSocketCaptureTransport } from './socket-transport';
import { createFileTailCaptureTransport } from './transcript-watcher';
import { createWebSocketCaptureTransport } from './websocket-transport';

const DEFAULT_CAPTURE_TRANSPORT = 'phoenix';

function parseReconnectDelayMs(raw: string | undefined): number | undefined {
  if (!raw?.trim()) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
}

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
        url: requiredEnv(
          env.SHADOW_CAPTURE_HTTP_URL ?? env.SHADOW_CAPTURE_TARGET,
          'SHADOW_CAPTURE_HTTP_URL or SHADOW_CAPTURE_TARGET'
        ),
        reconnectDelayMs: parseReconnectDelayMs(env.SHADOW_CAPTURE_RECONNECT_MS),
        sessionId: env.SHADOW_CAPTURE_SESSION_ID?.trim() || undefined,
        sessionLabel: env.SHADOW_CAPTURE_SESSION_LABEL?.trim() || undefined
      } satisfies HttpStreamCaptureTransportOptions;
    case 'ws':
    case 'websocket':
      return {
        kind: 'websocket',
        url: requiredEnv(
          env.SHADOW_CAPTURE_WS_URL ?? env.SHADOW_CAPTURE_TARGET,
          'SHADOW_CAPTURE_WS_URL or SHADOW_CAPTURE_TARGET'
        ),
        reconnectDelayMs: parseReconnectDelayMs(env.SHADOW_CAPTURE_RECONNECT_MS),
        sessionId: env.SHADOW_CAPTURE_SESSION_ID?.trim() || undefined,
        sessionLabel: env.SHADOW_CAPTURE_SESSION_LABEL?.trim() || undefined
      } satisfies WebSocketCaptureTransportOptions;
    case 'socket':
      return {
        kind: 'socket',
        host: requiredEnv(env.SHADOW_CAPTURE_SOCKET_HOST, 'SHADOW_CAPTURE_SOCKET_HOST'),
        port: parsePort(env.SHADOW_CAPTURE_SOCKET_PORT),
        reconnectDelayMs: parseReconnectDelayMs(env.SHADOW_CAPTURE_RECONNECT_MS),
        sessionId: env.SHADOW_CAPTURE_SESSION_ID?.trim() || undefined,
        sessionLabel: env.SHADOW_CAPTURE_SESSION_LABEL?.trim() || undefined
      } satisfies SocketCaptureTransportOptions;
    case 'phoenix':
      return {
        kind: 'phoenix',
        url: requiredEnv(
          env.SHADOW_CAPTURE_PHOENIX_URL ?? env.SHADOW_CAPTURE_TARGET,
          'SHADOW_CAPTURE_PHOENIX_URL'
        ),
        projectName: env.SHADOW_CAPTURE_PHOENIX_PROJECT?.trim() || undefined,
        pollIntervalMs: parseReconnectDelayMs(env.SHADOW_CAPTURE_RECONNECT_MS),
        apiKey: env.SHADOW_CAPTURE_PHOENIX_API_KEY?.trim() || undefined,
        sessionId: env.SHADOW_CAPTURE_SESSION_ID?.trim() || undefined,
        sessionLabel: env.SHADOW_CAPTURE_SESSION_LABEL?.trim() || undefined
      } satisfies PhoenixCaptureTransportOptions;
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
    case 'phoenix':
      return createPhoenixCaptureTransport(options);
  }
}
