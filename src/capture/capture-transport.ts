import type { EventQueueBackpressureState, EventSource } from '../shared/schema';

export type CaptureTransportKind = 'file-tail' | 'http-stream' | 'websocket' | 'socket';
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

export type CaptureTransportOptions =
  | FileTailCaptureTransportOptions
  | HttpStreamCaptureTransportOptions
  | WebSocketCaptureTransportOptions
  | SocketCaptureTransportOptions;

