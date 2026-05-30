/**
 * Instrumentation sampling tests (issue #19).
 *
 * These tests verify that expected structured log events fire when real
 * fixtures are replayed through each subsystem boundary.  They use an
 * in-memory logger (includeConsole: false) and assert that the correct
 * domain + event names appear in the memory ring after each operation.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

// file-replay-store and session-io build module-level loggers with a bare
// `createLogger()` whose minLevel is read from SHADOW_LOG_LEVEL at IMPORT time.
// If the ambient env sets warn|error, the INFO logs these tests assert get
// filtered out and the suite fails nondeterministically. Pin the level before
// those imports run (vi.hoisted is hoisted above all imports) and restore after.
const ORIGINAL_LOG_LEVEL = vi.hoisted(() => {
  const previous = process.env['SHADOW_LOG_LEVEL'];
  process.env['SHADOW_LOG_LEVEL'] = 'debug';
  return previous;
});

import { createLogger, type StructuredLogger } from '../src/shared/logger';
import { FileReplayStore } from '../src/persistence/file-replay-store';
import { createSnapshot, buildFixtureSnapshot, loadSnapshotFromFile } from '../src/electron/session-io';
import { parseReplay } from '../src/shared/replay-store';
import type { LoadedSource } from '../src/shared/schema';

afterAll(() => {
  if (ORIGINAL_LOG_LEVEL === undefined) {
    delete process.env['SHADOW_LOG_LEVEL'];
  } else {
    process.env['SHADOW_LOG_LEVEL'] = ORIGINAL_LOG_LEVEL;
  }
});

const REPLAY_FIXTURES = join(import.meta.dirname, 'fixtures/replays');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLogger(): StructuredLogger {
  return createLogger({ minLevel: 'debug', includeConsole: false, memoryCapacity: 200 });
}

function eventsOf(logger: StructuredLogger) {
  return logger.getRecent(200).map((e) => ({ domain: e.domain, event: e.event, level: e.level }));
}

function captureStructuredConsole() {
  return vi.spyOn(console, 'log').mockImplementation(() => undefined);
}

function expectStructuredLog(
  spy: ReturnType<typeof captureStructuredConsole>,
  level: 'INFO' | 'ERROR',
  domain: string,
  event: string,
  context: Record<string, unknown>
) {
  expect(spy).toHaveBeenCalledWith(
    expect.stringContaining(`${level} ${domain}:${event}`),
    expect.objectContaining(context)
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Persistence subsystem
// ---------------------------------------------------------------------------

describe('instrumentation sampling — persistence', () => {
  it('emits persistence.replay.saved after saveSession writes a replay', async () => {
    const consoleLog = captureStructuredConsole();
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'shadow-inst-pers-'));
    const store = new FileReplayStore(tmpDir);

    const raw = readFileSync(join(REPLAY_FIXTURES, 'happy-path.replay.jsonl'), 'utf8');
    const events = parseReplay(raw);
    const record = await store.saveSession('test-session', events, 'Sampling test');

    // This assertion samples the real module logger side effect, not the saveSession return value.
    expectStructuredLog(consoleLog, 'INFO', 'persistence', 'persistence.replay.saved', {
      sessionId: 'test-session',
      eventCount: events.length
    });
    expect(record.eventCount).toBe(events.length);
    expect(typeof record.sessionId).toBe('string');
  });

  it('emits persistence.replay.loaded after loadSession reads stored events', async () => {
    const consoleLog = captureStructuredConsole();
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'shadow-inst-load-'));
    const store = new FileReplayStore(tmpDir);

    const raw = readFileSync(join(REPLAY_FIXTURES, 'happy-path.replay.jsonl'), 'utf8');
    const events = parseReplay(raw);
    await store.saveSession('load-test', events);
    const loaded = await store.loadSession('load-test');

    expect(loaded.events).toHaveLength(events.length);
    // Loaded instrumentation must carry the replay key and count for support diagnostics.
    expectStructuredLog(consoleLog, 'INFO', 'persistence', 'persistence.replay.loaded', {
      sessionId: 'load-test',
      eventCount: events.length
    });
    expect(typeof loaded.record.sessionId).toBe('string');
  });

  it('emits persistence.replay.load_failed on nonexistent session', async () => {
    const consoleLog = captureStructuredConsole();
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'shadow-inst-fail-'));
    const store = new FileReplayStore(tmpDir);
    await expect(store.loadSession('does-not-exist')).rejects.toThrow();
    // Failure logs are the observable behavior; throwing alone would not prove instrumentation.
    expectStructuredLog(consoleLog, 'ERROR', 'persistence', 'persistence.replay.load_failed', {
      sessionId: 'does-not-exist'
    });
  });

  it('emits persistence.store.listed after listSessions returns valid sessions', async () => {
    const consoleLog = captureStructuredConsole();
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'shadow-inst-list-'));
    const store = new FileReplayStore(tmpDir);

    const raw = readFileSync(join(REPLAY_FIXTURES, 'happy-path.replay.jsonl'), 'utf8');
    const events = parseReplay(raw);
    await store.saveSession('list-session-1', events);
    await store.saveSession('list-session-2', events);

    const sessions = await store.listSessions();
    expect(sessions).toHaveLength(2);
    // List instrumentation proves the store boundary reported the final filtered count.
    expectStructuredLog(consoleLog, 'INFO', 'persistence', 'persistence.store.listed', {
      sessionCount: 2
    });
  });
});

// ---------------------------------------------------------------------------
// IPC / session-io subsystem (via injectable logger approach)
// ---------------------------------------------------------------------------

describe('instrumentation sampling — ipc / session-io', () => {
  it('emits ipc.snapshot.created when createSnapshot builds renderer input', () => {
    const consoleLog = captureStructuredConsole();
    const raw = readFileSync(join(REPLAY_FIXTURES, 'happy-path.replay.jsonl'), 'utf8');
    const events = parseReplay(raw);
    const source: LoadedSource = { kind: 'replay', label: 'test.jsonl', path: '/test.jsonl' };

    const snapshot = createSnapshot(events, source);
    // Snapshot creation must emit the same source/count the renderer receives.
    expectStructuredLog(consoleLog, 'INFO', 'ipc', 'ipc.snapshot.created', {
      sourceKind: 'replay',
      eventCount: events.length
    });
    expect(snapshot.events).toHaveLength(events.length);
    expect(snapshot.source.kind).toBe('replay');
    expect(snapshot.record.eventCount).toBe(events.length);
  });

  it('emits ipc.snapshot.fixture_built when buildFixtureSnapshot uses the bundled fixture', () => {
    const consoleLog = captureStructuredConsole();
    const snapshot = buildFixtureSnapshot();
    // Fixture instrumentation proves the app boot path reported its built-in replay size.
    expectStructuredLog(consoleLog, 'INFO', 'ipc', 'ipc.snapshot.fixture_built', {
      eventCount: snapshot.events.length
    });
    expect(snapshot.source.kind).toBe('fixture');
    expect(snapshot.events.length).toBeGreaterThan(0);
    expect(snapshot.state.transcript.length).toBeGreaterThan(0);
  });

  it('emits ipc.snapshot.loaded when loadSnapshotFromFile reads a replay file', async () => {
    const consoleLog = captureStructuredConsole();
    const filePath = join(REPLAY_FIXTURES, 'happy-path.replay.jsonl');
    const snapshot = await loadSnapshotFromFile(filePath);
    // Loaded logs must identify the parser format chosen for the file.
    expectStructuredLog(consoleLog, 'INFO', 'ipc', 'ipc.snapshot.loaded', {
      fileName: 'happy-path.replay.jsonl',
      format: 'replay',
      eventCount: snapshot.events.length
    });
    expect(snapshot.source.kind).toBe('replay');
    expect(snapshot.events.length).toBeGreaterThan(0);
  });

  it('emits ipc.snapshot.loaded for a transcript fixture', async () => {
    const consoleLog = captureStructuredConsole();
    const filePath = join(import.meta.dirname, 'fixtures/transcripts/happy-path.jsonl');
    const snapshot = await loadSnapshotFromFile(filePath);
    // Transcript logs prove fallback detection did not silently label the file as replay.
    expectStructuredLog(consoleLog, 'INFO', 'ipc', 'ipc.snapshot.loaded', {
      fileName: 'happy-path.jsonl',
      format: 'transcript',
      eventCount: snapshot.events.length
    });
    expect(snapshot.events.length).toBeGreaterThan(0);
  });

  it('emits ipc.snapshot.load_failed when loadSnapshotFromFile rejects an empty file', async () => {
    const consoleLog = captureStructuredConsole();
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'shadow-inst-empty-'));
    const emptyFile = path.join(tmpDir, 'empty.jsonl');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(emptyFile, '', 'utf8');

    await expect(loadSnapshotFromFile(emptyFile)).rejects.toThrow(/No events/);
    // The failure event carries parser context that the thrown message alone cannot sample.
    expectStructuredLog(consoleLog, 'ERROR', 'ipc', 'ipc.snapshot.load_failed', {
      fileName: 'empty.jsonl',
      primaryFormat: 'replay',
      secondaryFormat: 'transcript'
    });
  });
});

// ---------------------------------------------------------------------------
// Logger instrumentation — SHADOW_LOG_LEVEL sampling
// ---------------------------------------------------------------------------

describe('instrumentation sampling — logger level filtering by env', () => {
  it('only info+ events appear when minLevel=info', () => {
    const logger = makeLogger();
    // Override minLevel explicitly so the test is env-independent
    const filteredLogger = createLogger({ minLevel: 'info', includeConsole: false });

    filteredLogger.debug('persistence', 'persistence.replay.load_started', { sessionId: 'x' });
    filteredLogger.info('persistence', 'persistence.replay.loaded', { sessionId: 'x', eventCount: 5 });
    filteredLogger.error('persistence', 'persistence.replay.load_failed', { sessionId: 'x', error: new Error('oops') });

    const logged = eventsOf(filteredLogger);
    expect(logged.some((e) => e.event === 'persistence.replay.load_started')).toBe(false);
    expect(logged.some((e) => e.event === 'persistence.replay.loaded')).toBe(true);
    expect(logged.some((e) => e.event === 'persistence.replay.load_failed')).toBe(true);
  });

  it('event names follow <subsystem>.<component>.<action> pattern', () => {
    const logger = makeLogger();

    logger.info('persistence', 'persistence.replay.saved', { sessionId: 'abc', eventCount: 3 });
    logger.info('ipc', 'ipc.snapshot.loaded', { fileName: 'test.jsonl', format: 'replay', eventCount: 3 });
    logger.info('ipc', 'ipc.export.saved', { fileName: 'out.jsonl', eventCount: 3 });

    const logged = eventsOf(logger);
    const eventNames = logged.map((e) => e.event);

    for (const name of eventNames) {
      // Must have at least two dots: subsystem.component.action
      expect(name.split('.').length).toBeGreaterThanOrEqual(3);
    }
  });

  it('error context has serialized cause chain for persistence failure', () => {
    const logger = makeLogger();
    const cause = new Error('ENOENT: no such file');
    const err = new Error('load failed');
    (err as Error & { cause?: unknown }).cause = cause;

    logger.error('persistence', 'persistence.replay.load_failed', { sessionId: 'x', error: err });

    const [entry] = logger.getRecent(1);
    const errorCtx = entry.context?.error as Record<string, unknown>;
    expect(errorCtx.message).toBe('load failed');
    expect((errorCtx.cause as Record<string, unknown>).message).toBe('ENOENT: no such file');
  });
});
