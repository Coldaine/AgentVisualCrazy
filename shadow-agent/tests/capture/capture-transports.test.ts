import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import net from 'node:net';
import { appendFile, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import type {
  CaptureSession,
  CaptureTransportContext,
  CaptureTransportResetReason,
  CaptureTransportSubscription
} from '../../src/capture/capture-transport';
import { createHttpStreamCaptureTransport } from '../../src/capture/http-stream-transport';
import { createSocketCaptureTransport } from '../../src/capture/socket-transport';
import { createFileTailCaptureTransport } from '../../src/capture/transcript-watcher';
import { createWebSocketCaptureTransport } from '../../src/capture/websocket-transport';

const tempDirs: string[] = [];
const subscriptions: CaptureTransportSubscription[] = [];
const servers: Array<{ close: () => Promise<void> }> = [];

async function waitFor(assertion: () => boolean | Promise<boolean>, timeoutMs = 4_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await assertion()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out after ${timeoutMs}ms`);
}

function createContext() {
  const sessions: CaptureSession[] = [];
  const resets: CaptureTransportResetReason[] = [];
  const chunks: string[] = [];

  const context: CaptureTransportContext = {
    getBackpressure: () => ({
      level: 'normal',
      shouldThrottle: false,
      totalRatio: 0,
      pendingWrites: 0
    }),
    onSessionStarted: (session) => {
      sessions.push(session);
    },
    onSessionReset: (_session, reason) => {
      resets.push(reason);
    },
    onChunk: ({ chunk }) => {
      chunks.push(chunk);
    }
  };

  return { context, sessions, resets, chunks };
}

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function listenHttp(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected TCP server address');
  }
  servers.push({
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      })
  });
  return address.port;
}

async function listenSocket(server: net.Server): Promise<number> {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected TCP server address');
  }
  servers.push({
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      })
  });
  return address.port;
}

afterEach(async () => {
  while (subscriptions.length > 0) {
    await subscriptions.pop()?.stop();
  }

  while (servers.length > 0) {
    await servers.pop()?.close();
  }

  while (tempDirs.length > 0) {
    await rm(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('capture transports', () => {
  let originalWebSocket: typeof globalThis.WebSocket | undefined;

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket;
  });

  afterEach(() => {
    if (originalWebSocket) {
      globalThis.WebSocket = originalWebSocket;
      return;
    }
    Reflect.deleteProperty(globalThis, 'WebSocket');
  });

  it('file-tail transport replays replacement files when the head checksum changes', async () => {
    const dir = await makeTempDir('shadow-file-tail-');
    const filePath = path.join(dir, 'session-a.jsonl');
    const initialLine = '{"sessionId":"session-a","message":{"role":"assistant","content":"hello"}}\n';
    const appendedLine = '{"sessionId":"session-a","message":{"role":"assistant","content":"again"}}\n';
    const rotatedLine = '{"sessionId":"session-a","message":{"role":"assistant","content":"hullo"}}\n';
    await writeFile(filePath, initialLine, 'utf8');

    const { context, sessions, resets, chunks } = createContext();
    const subscription = await createFileTailCaptureTransport({
      kind: 'file-tail',
      overridePath: filePath,
      discoveryIntervalMs: 5_000,
      fingerprintBytes: 256
    }).start(context);
    subscriptions.push(subscription);

    await waitFor(() => sessions.length === 1 && chunks.join('').includes(initialLine));

    await appendFile(filePath, appendedLine, 'utf8');
    await waitFor(() => chunks.join('').includes(appendedLine));

    await rename(filePath, path.join(dir, 'session-a.rotated.jsonl'));
    await writeFile(filePath, rotatedLine, 'utf8');

    await waitFor(() => resets.includes('rotation') && chunks.join('').includes(rotatedLine));
  });

  it('http-stream transport reconnects and emits streamed chunks', async () => {
    let requestCount = 0;
    const server = http.createServer((_, response) => {
      requestCount += 1;
      response.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      if (requestCount === 1) {
        response.write('{"step":1}');
        setTimeout(() => response.end('\n'), 10);
        return;
      }
      response.end('{"step":2}\n');
    });
    const port = await listenHttp(server);

    const { context, sessions, resets, chunks } = createContext();
    const subscription = await createHttpStreamCaptureTransport({
      kind: 'http-stream',
      url: `http://127.0.0.1:${port}/stream`,
      reconnectDelayMs: 25,
      sessionId: 'http-stream-test'
    }).start(context);
    subscriptions.push(subscription);

    await waitFor(() => sessions.length === 1 && chunks.join('').includes('{"step":1}\n'));
    await waitFor(() => resets.includes('reconnect') && chunks.join('').includes('{"step":2}\n'));
  });

  it('websocket transport normalizes framed messages and reconnects after close', async () => {
    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 3;
      static instances: MockWebSocket[] = [];

      readyState = MockWebSocket.CONNECTING;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(
        public readonly url: string,
        public readonly protocols?: string | string[]
      ) {
        MockWebSocket.instances.push(this);
      }

      emitOpen() {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.({} as Event);
      }

      emitMessage(data: unknown) {
        this.onmessage?.({ data } as MessageEvent);
      }

      emitClose() {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.({} as CloseEvent);
      }

      close() {
        this.emitClose();
      }
    }

    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;

    const { context, sessions, resets, chunks } = createContext();
    const subscription = await createWebSocketCaptureTransport({
      kind: 'websocket',
      url: 'ws://localhost:4098/shadow',
      reconnectDelayMs: 25,
      sessionId: 'ws-test'
    }).start(context);
    subscriptions.push(subscription);

    const firstSocket = MockWebSocket.instances[0];
    firstSocket?.emitOpen();
    firstSocket?.emitMessage('{"frame":1}');

    await waitFor(() => sessions.length === 1 && chunks.includes('{"frame":1}\n'));

    firstSocket?.emitClose();
    await waitFor(() => MockWebSocket.instances.length === 2);
    MockWebSocket.instances[1]?.emitOpen();

    await waitFor(() => resets.includes('reconnect'));
  });

  it('socket transport reconnects after disconnects and keeps streaming chunks', async () => {
    let connectionCount = 0;
    const server = net.createServer((socket) => {
      connectionCount += 1;
      socket.write(`{"connection":${connectionCount}}\n`);
      socket.end();
    });
    const port = await listenSocket(server);

    const { context, sessions, resets, chunks } = createContext();
    const subscription = await createSocketCaptureTransport({
      kind: 'socket',
      host: '127.0.0.1',
      port,
      reconnectDelayMs: 25,
      sessionId: 'tcp-test'
    }).start(context);
    subscriptions.push(subscription);

    await waitFor(() => sessions.length === 1 && chunks.join('').includes('{"connection":1}\n'));
    await waitFor(() => resets.includes('reconnect') && chunks.join('').includes('{"connection":2}\n'));
  });
});
