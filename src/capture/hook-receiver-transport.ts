/**
 * Local hook-receiver transport.
 *
 * Cursor (and other command-only hook systems) spawn a shell script with JSON
 * on stdin. The stock forwarder in `scripts/hooks/forward-to-shadow.sh` POSTs
 * that JSON here. We expose a loopback HTTP server (and optional Unix socket)
 * that turns each POST body into one JSONL line for the incremental parser.
 *
 * This transport is harness-agnostic: the EventSource stamped on sessions is
 * configurable (default `cursor-hook`). Claude HTTP hooks / Codex wrappers can
 * reuse the same endpoint with a different source header.
 */
import http from 'node:http';
import net from 'node:net';
import { unlink } from 'node:fs/promises';
import type {
  CaptureSession,
  CaptureTransport,
  CaptureTransportContext,
  CaptureTransportSubscription,
  HookReceiverCaptureTransportOptions
} from './capture-transport';
import { createLogger } from '../shared/logger';
import type { EventSource } from '../shared/schema';

const logger = createLogger({ minLevel: 'info' });

export const DEFAULT_HOOK_RECEIVER_HOST = '127.0.0.1';
export const DEFAULT_HOOK_RECEIVER_PORT = 9477;

function resolveSessionId(body: Record<string, unknown>, fallback: string): string {
  for (const key of ['conversation_id', 'session_id', 'sessionId', 'conversationId']) {
    const value = body[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

function resolveSource(
  req: http.IncomingMessage,
  options: HookReceiverCaptureTransportOptions
): EventSource {
  const header = req.headers['x-shadow-source'];
  if (typeof header === 'string' && header.trim()) {
    return header.trim();
  }
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const querySource = url.searchParams.get('source');
    if (querySource?.trim()) {
      return querySource.trim();
    }
  } catch {
    // ignore malformed URL
  }
  return options.defaultSource ?? 'cursor-hook';
}

function authorize(
  req: http.IncomingMessage,
  options: HookReceiverCaptureTransportOptions
): boolean {
  if (!options.sharedToken) {
    return true;
  }
  const header = req.headers['x-shadow-token'] ?? req.headers.authorization;
  if (typeof header !== 'string') {
    return false;
  }
  if (header === options.sharedToken) {
    return true;
  }
  if (header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim() === options.sharedToken;
  }
  return false;
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function buildSession(
  sessionId: string,
  source: EventSource,
  options: HookReceiverCaptureTransportOptions,
  pathHint?: string
): CaptureSession {
  return {
    sessionId,
    label: options.sessionLabel ?? `Live Cursor: ${sessionId.slice(0, 12)}`,
    source,
    path: pathHint ?? `hook-receiver://${source}/${sessionId}`,
    transportId: 'hook-receiver'
  };
}

export function createHookReceiverCaptureTransport(
  options: HookReceiverCaptureTransportOptions = { kind: 'hook-receiver' }
): CaptureTransport {
  const host = options.host ?? DEFAULT_HOOK_RECEIVER_HOST;
  const port = options.port ?? DEFAULT_HOOK_RECEIVER_PORT;
  const fallbackSessionId = options.sessionId ?? 'cursor-live';

  return {
    id: 'hook-receiver',
    kind: 'hook-receiver',
    async start(context: CaptureTransportContext): Promise<CaptureTransportSubscription> {
      const sessionsStarted = new Set<string>();
      let stopped = false;

      const handlePayload = async (
        rawBody: string,
        source: EventSource
      ): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> => {
        const trimmed = rawBody.trim();
        if (!trimmed) {
          return { ok: false, error: 'empty body' };
        }

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
          return { ok: false, error: 'invalid JSON' };
        }

        const sessionId = resolveSessionId(parsed, fallbackSessionId);
        const session = buildSession(
          sessionId,
          source,
          options,
          typeof parsed.transcript_path === 'string' ? parsed.transcript_path : undefined
        );

        if (!sessionsStarted.has(sessionId)) {
          sessionsStarted.add(sessionId);
          await context.onSessionStarted(session);
        }

        // One JSON object per POST → one JSONL line for the incremental parser.
        const line = `${JSON.stringify(parsed)}\n`;
        await context.onChunk({ session, chunk: line });
        return { ok: true, sessionId };
      };

      const server = http.createServer((req, res) => {
        void (async () => {
          if (stopped) {
            res.writeHead(503).end('stopped');
            return;
          }

          if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true, transport: 'hook-receiver' }));
            return;
          }

          if (req.method !== 'POST') {
            res.writeHead(405).end('method not allowed');
            return;
          }

          if (!authorize(req, options)) {
            res.writeHead(401).end('unauthorized');
            return;
          }

          const source = resolveSource(req, options);
          const body = await readBody(req);
          const result = await handlePayload(body, source);
          if (!result.ok) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: result.error }));
            return;
          }

          // Cursor hooks expect fast success; empty JSON keeps fail-open clients happy.
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('{}');
        })().catch((error) => {
          logger.warn('capture', 'transport.hook_receiver.request_error', { error });
          if (!res.headersSent) {
            res.writeHead(500).end('error');
          }
        });
      });

      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          resolve();
        });
      });

      logger.info('capture', 'transport.hook_receiver.listening', { host, port });

      let unixServer: net.Server | null = null;
      if (options.unixSocketPath) {
        try {
          await unlink(options.unixSocketPath).catch(() => undefined);
          unixServer = net.createServer((socket) => {
            void (async () => {
              const chunks: Buffer[] = [];
              for await (const chunk of socket) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
              }
              const body = Buffer.concat(chunks).toString('utf8');
              await handlePayload(body, options.defaultSource ?? 'cursor-hook');
              socket.end('{}\n');
            })().catch((error) => {
              logger.warn('capture', 'transport.hook_receiver.unix_error', { error });
              socket.destroy();
            });
          });
          await new Promise<void>((resolve, reject) => {
            unixServer!.once('error', reject);
            unixServer!.listen(options.unixSocketPath, () => {
              unixServer!.off('error', reject);
              resolve();
            });
          });
          logger.info('capture', 'transport.hook_receiver.unix_listening', {
            path: options.unixSocketPath
          });
        } catch (error) {
          logger.warn('capture', 'transport.hook_receiver.unix_bind_failed', {
            path: options.unixSocketPath,
            error
          });
          unixServer = null;
        }
      }

      return {
        async stop() {
          stopped = true;
          await new Promise<void>((resolve) => {
            server.close(() => resolve());
          });
          if (unixServer) {
            await new Promise<void>((resolve) => {
              unixServer!.close(() => resolve());
            });
            await unlink(options.unixSocketPath!).catch(() => undefined);
          }
          logger.info('capture', 'transport.hook_receiver.stopped', { host, port });
        }
      };
    }
  };
}
