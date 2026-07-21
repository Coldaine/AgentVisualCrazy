import type { EventQueueBackpressureState, EventSource } from '../shared/schema';

export type CaptureTransportKind =
  | 'file-tail'
  | 'http-stream'
  | 'websocket'
  | 'socket'
  | 'hook-receiver'
  | 'auto';
export type CaptureTransportResetReason = 'rotation' | 'truncation' | 'reconnect';

export interface CaptureSession {
  sessionId: string;
  label: string;
  source: EventSource;
  path?: string;
  transportId: string;
}

export interface CaptureChunk {
  session: CaptureSession;
  chunk: string;
}

export interface CaptureTransportContext {
  getBackpressure(): EventQueueBackpressureState;
  onSessionStarted(session: CaptureSession): Promise<void> | void;
  onSessionReset(session: CaptureSession, reason: CaptureTransportResetReason): Promise<void> | void;
  onChunk(chunk: CaptureChunk): Promise<void> | void;
}

export interface CaptureTransportSubscription {
  stop(): void | Promise<void>;
}

export interface CaptureTransport {
  readonly id: string;
  readonly kind: CaptureTransportKind;
  start(context: CaptureTransportContext): Promise<CaptureTransportSubscription>;
}

export interface FileTailCaptureTransportOptions {
  kind: 'file-tail';
  overridePath?: string;
  discoveryIntervalMs?: number;
  fingerprintBytes?: number;
}

export interface HttpStreamCaptureTransportOptions {
  kind: 'http-stream';
  url: string;
  headers?: Record<string, string>;
  reconnectDelayMs?: number;
  sessionId?: string;
  sessionLabel?: string;
}

export interface WebSocketCaptureTransportOptions {
  kind: 'websocket';
  url: string;
  protocols?: string | string[];
  reconnectDelayMs?: number;
  sessionId?: string;
  sessionLabel?: string;
}

export interface SocketCaptureTransportOptions {
  kind: 'socket';
  host: string;
  port: number;
  reconnectDelayMs?: number;
  sessionId?: string;
  sessionLabel?: string;
}

export interface HookReceiverCaptureTransportOptions {
  kind: 'hook-receiver';
  /** Loopback bind host. Defaults to 127.0.0.1. */
  host?: string;
  /** TCP port. Defaults to 9477. */
  port?: number;
  /** Optional Unix domain socket path (in addition to TCP). */
  unixSocketPath?: string;
  /** When set, require `X-Shadow-Token` (or Bearer) on each POST. */
  sharedToken?: string;
  /** EventSource stamped on sessions (default `cursor-hook`). */
  defaultSource?: EventSource;
  sessionId?: string;
  sessionLabel?: string;
}

export interface AutoCaptureTransportOptions {
  kind: 'auto';
  /** Forwarded to the file-tail leg. */
  overridePath?: string;
  discoveryIntervalMs?: number;
  fingerprintBytes?: number;
  /** Forwarded to the hook-receiver leg. */
  hookHost?: string;
  hookPort?: number;
  unixSocketPath?: string;
  sharedToken?: string;
  defaultSource?: EventSource;
  sessionId?: string;
  sessionLabel?: string;
}

export type CaptureTransportOptions =
  | FileTailCaptureTransportOptions
  | HttpStreamCaptureTransportOptions
  | WebSocketCaptureTransportOptions
  | SocketCaptureTransportOptions
  | HookReceiverCaptureTransportOptions
  | AutoCaptureTransportOptions;

