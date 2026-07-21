import type {
  AutoCaptureTransportOptions,
  CaptureTransport,
  CaptureTransportOptions,
  HookReceiverCaptureTransportOptions,
  HttpStreamCaptureTransportOptions,
  SocketCaptureTransportOptions,
  WebSocketCaptureTransportOptions
} from './capture-transport';
import { createAutoCaptureTransport } from './auto-capture-transport';
import {
  createHookReceiverCaptureTransport,
  DEFAULT_HOOK_RECEIVER_HOST,
  DEFAULT_HOOK_RECEIVER_PORT
} from './hook-receiver-transport';
import { createHttpStreamCaptureTransport } from './http-stream-transport';
import { createSocketCaptureTransport } from './socket-transport';
import { createFileTailCaptureTransport } from './transcript-watcher';
import { createWebSocketCaptureTransport } from './websocket-transport';

/** Default: Claude file-tail + Cursor hook-receiver side by side. */
const DEFAULT_CAPTURE_TRANSPORT = 'auto';

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

function parsePort(raw: string | undefined, variableName: string): number {
  const port = Number.parseInt(requiredEnv(raw, variableName), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid ${variableName}: ${raw ?? '<unset>'}`);
  }
  return port;
}

function parseOptionalPort(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) {
    return fallback;
  }
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid SHADOW_HOOK_RECEIVER_PORT: ${raw}`);
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
        port: parsePort(env.SHADOW_CAPTURE_SOCKET_PORT, 'SHADOW_CAPTURE_SOCKET_PORT'),
        reconnectDelayMs: parseReconnectDelayMs(env.SHADOW_CAPTURE_RECONNECT_MS),
        sessionId: env.SHADOW_CAPTURE_SESSION_ID?.trim() || undefined,
        sessionLabel: env.SHADOW_CAPTURE_SESSION_LABEL?.trim() || undefined
      } satisfies SocketCaptureTransportOptions;
    case 'hook-receiver':
    case 'hooks':
    case 'cursor':
      return {
        kind: 'hook-receiver',
        host: env.SHADOW_HOOK_RECEIVER_HOST?.trim() || DEFAULT_HOOK_RECEIVER_HOST,
        port: parseOptionalPort(env.SHADOW_HOOK_RECEIVER_PORT, DEFAULT_HOOK_RECEIVER_PORT),
        unixSocketPath: env.SHADOW_HOOK_RECEIVER_SOCKET?.trim() || undefined,
        sharedToken: env.SHADOW_HOOK_TOKEN?.trim() || undefined,
        defaultSource: env.SHADOW_HOOK_SOURCE?.trim() || 'cursor-hook',
        sessionId: env.SHADOW_CAPTURE_SESSION_ID?.trim() || undefined,
        sessionLabel: env.SHADOW_CAPTURE_SESSION_LABEL?.trim() || undefined
      } satisfies HookReceiverCaptureTransportOptions;
    case 'auto':
    case 'both':
      return {
        kind: 'auto',
        overridePath: env.SHADOW_CAPTURE_FILE?.trim() || undefined,
        hookHost: env.SHADOW_HOOK_RECEIVER_HOST?.trim() || DEFAULT_HOOK_RECEIVER_HOST,
        hookPort: parseOptionalPort(env.SHADOW_HOOK_RECEIVER_PORT, DEFAULT_HOOK_RECEIVER_PORT),
        unixSocketPath: env.SHADOW_HOOK_RECEIVER_SOCKET?.trim() || undefined,
        sharedToken: env.SHADOW_HOOK_TOKEN?.trim() || undefined,
        defaultSource: env.SHADOW_HOOK_SOURCE?.trim() || 'cursor-hook',
        sessionId: env.SHADOW_CAPTURE_SESSION_ID?.trim() || undefined,
        sessionLabel: env.SHADOW_CAPTURE_SESSION_LABEL?.trim() || undefined
      } satisfies AutoCaptureTransportOptions;
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
    case 'hook-receiver':
      return createHookReceiverCaptureTransport(options);
    case 'auto':
      return createAutoCaptureTransport(options);
  }
}
