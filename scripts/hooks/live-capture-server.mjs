#!/usr/bin/env node
/**
 * Standalone live capture server for Cursor hook smoke tests.
 *
 * Starts the same hook-receiver transport the Electron app uses, writes every
 * ingested CanonicalEvent as JSONL to an output file, and prints a one-line
 * summary on each POST so you can watch the feed in a terminal.
 *
 * Usage:
 *   node scripts/hooks/live-capture-server.mjs [--port 9477] [--out /tmp/shadow-live.jsonl]
 *
 * Env:
 *   SHADOW_HOOK_RECEIVER_PORT (default 9477)
 *   SHADOW_LIVE_CAPTURE_OUT   (default /tmp/shadow-live-capture.jsonl)
 */
import { createWriteStream } from 'node:fs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHookReceiverCaptureTransport } from '../../src/capture/hook-receiver-transport.ts';
import { createIncrementalParser } from '../../src/capture/incremental-parser.ts';
import { cursorDriver } from '../../src/capture/drivers/cursor/index.ts';

function argValue(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

const port = Number.parseInt(
  argValue('--port', process.env.SHADOW_HOOK_RECEIVER_PORT ?? '9477'),
  10
);
const outPath = argValue(
  '--out',
  process.env.SHADOW_LIVE_CAPTURE_OUT ?? '/tmp/shadow-live-capture.jsonl'
);

mkdirSync(path.dirname(outPath), { recursive: true });
const out = createWriteStream(outPath, { flags: 'a' });

let received = 0;
let canonical = 0;

const parser = createIncrementalParser((entry) => {
  const sessionId =
    (typeof entry.conversation_id === 'string' && entry.conversation_id) ||
    (typeof entry.session_id === 'string' && entry.session_id) ||
    'live';
  const events = cursorDriver.normalizeEntry(entry, sessionId, 'cursor-hook');
  for (const event of events) {
    canonical += 1;
    out.write(`${JSON.stringify(event)}\n`);
    console.log(
      `[live-capture] #${canonical} kind=${event.kind} actor=${event.actor} harness=${event.harnessId}` +
        (typeof event.payload.toolName === 'string' ? ` tool=${event.payload.toolName}` : '') +
        (typeof event.payload.text === 'string'
          ? ` text=${JSON.stringify(String(event.payload.text).slice(0, 80))}`
          : '')
    );
  }
});

const transport = createHookReceiverCaptureTransport({
  kind: 'hook-receiver',
  host: '127.0.0.1',
  port,
  defaultSource: 'cursor-hook'
});

const subscription = await transport.start({
  getBackpressure: () => ({
    level: 'normal',
    shouldThrottle: false,
    totalRatio: 0,
    pendingWrites: 0
  }),
  onSessionStarted: (session) => {
    console.log(
      `[live-capture] session_started id=${session.sessionId} source=${session.source}`
    );
  },
  onSessionReset: () => undefined,
  onChunk: ({ chunk }) => {
    received += 1;
    console.log(`[live-capture] post #${received} bytes=${chunk.length}`);
    parser.push(chunk);
  }
});

console.log(`[live-capture] listening on http://127.0.0.1:${port}/hook`);
console.log(`[live-capture] writing canonical events to ${outPath}`);
console.log(`[live-capture] entry=${pathToFileURL(process.argv[1] ?? '')}`);

const shutdown = async () => {
  console.log(`[live-capture] shutting down posts=${received} events=${canonical}`);
  await subscription.stop();
  out.end();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
