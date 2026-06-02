/**
 * Instrumentation sampling tests (issue #19).
 *
 * These tests verify that expected structured log events fire when real
 * fixtures are replayed through each subsystem boundary.  They use an
 * in-memory logger (includeConsole: false) and assert that the correct
 * domain + event names appear in the memory ring after each operation.
 *
 * The logger is injected via constructor / factory parameters so tests
 * never need to spy on console.log or mutate SHADOW_LOG_LEVEL.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createLogger, createTestLogger, type StructuredLogger } from '../src/shared/logger';
import { FileReplayStore } from '../src/persistence/file-replay-store';
import { createSnapshot, buildFixtureSnapshot, loadSnapshotFromFile } from '../src/electron/session-io';
import { parseReplay } from '../src/shared/replay-store';
import type { LoadedSource } from '../src/shared/schema';

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

// ---------------------------------------------------------------------------
// Persistence subsystem
// ---------------------------------------------------------------------------

describe('instrumentation sampling — persistence', () => {
  it('emits persistence.replay.saved after saveSession writes a replay', async () => {
    const logger = createTestLogger();
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'shadow-inst-pers-'));
    const store = new FileReplayStore(tmpDir, { logger });

    const raw = readFileSync(join(REPLAY_FIXTURES, 'happy-path.replay.jsonl'), 'utf8');
    const events = parseReplay(raw);
    const record = await store.saveSession('test-session', events, 'Sampling test');

    const logs = logger.getRecent();
    expect(logs).toContainEqual(expect.objectContaining({
      level: 'info',
      domain: 'persistence',
      event: 'persistence.replay.saved',
      context: expect.objectContaining({
        sessionId: 'test-session',
        eventCount: events.length
      })
    }));
    expect(record.eventCount).toBe(events.length);
    expect(typeof record.sessionId).toBe('string');
  });

  it('emits persistence.replay.loaded after loadSession reads stored events', async () => {
    const logger = createTestLogger();
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'shadow-inst-load-'));
    const store = new FileReplayStore(tmpDir, { logger });

    const raw = readFileSync(join(REPLAY_FIXTURES, 'happy-path.replay.jsonl'), 'utf8');
    const events = parseReplay(raw);
    await store.saveSession('load-test', events);
    const loaded = await store.loadSession('load-test');

    expect(loaded.events).toHaveLength(events.length);
    const logs = logger.getRecent();
    expect(logs).toContainEqual(expect.objectContaining({
      level: 'info',
      domain: 'persistence',
      event: 'persistence.replay.loaded',
      context: expect.objectContaining({
        sessionId: 'load-test',
        eventCount: events.length
      })
    }));
    expect(typeof loaded.record.sessionId).toBe('string');
  });

  it('emits persistence.replay.load_failed on nonexistent session', async () => {
    const logger = createTestLogger();
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'shadow-inst-fail-'));
    const store = new FileReplayStore(tmpDir, { logger });
    await expect(store.loadSession('does-not-exist')).rejects.toThrow();
    const logs = logger.getRecent();
    expect(logs).toContainEqual(expect.objectContaining({
      level: 'error',
      domain: 'persistence',
      event: 'persistence.replay.load_failed',
      context: expect.objectContaining({
        sessionId: 'does-not-exist'
      })
    }));
  });

  it('emits persistence.store.listed after listSessions returns valid sessions', async () => {
    const logger = createTestLogger();
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'shadow-inst-list-'));
    const store = new FileReplayStore(tmpDir, { logger });

    const raw = readFileSync(join(REPLAY_FIXTURES, 'happy-path.replay.jsonl'), 'utf8');
    const events = parseReplay(raw);
    await store.saveSession('list-session-1', events);
    await store.saveSession('list-session-2', events);

    const sessions = await store.listSessions();
    expect(sessions).toHaveLength(2);
    const logs = logger.getRecent();
    expect(logs).toContainEqual(expect.objectContaining({
      level: 'info',
      domain: 'persistence',
      event: 'persistence.store.listed',
      context: expect.objectContaining({
        sessionCount: 2
      })
    }));
  });
});

// ---------------------------------------------------------------------------
// IPC / session-io subsystem
// ---------------------------------------------------------------------------

describe('instrumentation sampling — ipc / session-io', () => {
  it('emits ipc.snapshot.created when createSnapshot builds renderer input', () => {
    const logger = createTestLogger();
    const raw = readFileSync(join(REPLAY_FIXTURES, 'happy-path.replay.jsonl'), 'utf8');
    const events = parseReplay(raw);
    const source: LoadedSource = { kind: 'replay', label: 'test.jsonl', path: '/test.jsonl' };

    const snapshot = createSnapshot(events, source, undefined, logger);

    const logs = logger.getRecent();
    expect(logs).toContainEqual(expect.objectContaining({
      level: 'info',
      domain: 'ipc',
      event: 'ipc.snapshot.created',
      context: expect.objectContaining({
        sourceKind: 'replay',
        eventCount: events.length
      })
    }));
    expect(snapshot.events).toHaveLength(events.length);
    expect(snapshot.source.kind).toBe('replay');
    expect(snapshot.record.eventCount).toBe(events.length);
  });

  it('emits ipc.snapshot.fixture_built when buildFixtureSnapshot uses the bundled fixture', () => {
    const logger = createTestLogger();
    const snapshot = buildFixtureSnapshot(undefined, logger);

    const logs = logger.getRecent();
    expect(logs).toContainEqual(expect.objectContaining({
      level: 'info',
      domain: 'ipc',
      event: 'ipc.snapshot.fixture_built',
      context: expect.objectContaining({
        eventCount: snapshot.events.length
      })
    }));
    expect(snapshot.source.kind).toBe('fixture');
    expect(snapshot.events.length).toBeGreaterThan(0);
    expect(snapshot.state.transcript.length).toBeGreaterThan(0);
  });

  it('emits ipc.snapshot.loaded when loadSnapshotFromFile reads a replay file', async () => {
    const logger = createTestLogger();
    const filePath = join(REPLAY_FIXTURES, 'happy-path.replay.jsonl');
    const snapshot = await loadSnapshotFromFile(filePath, undefined, logger);

    const logs = logger.getRecent();
    expect(logs).toContainEqual(expect.objectContaining({
      level: 'info',
      domain: 'ipc',
      event: 'ipc.snapshot.loaded',
      context: expect.objectContaining({
        fileName: 'happy-path.replay.jsonl',
        format: 'replay',
        eventCount: snapshot.events.length
      })
    }));
    expect(snapshot.source.kind).toBe('replay');
    expect(snapshot.events.length).toBeGreaterThan(0);
  });

  it('emits ipc.snapshot.loaded for a transcript fixture', async () => {
    const logger = createTestLogger();
    const filePath = join(import.meta.dirname, 'fixtures/transcripts/happy-path.jsonl');
    const snapshot = await loadSnapshotFromFile(filePath, undefined, logger);

    const logs = logger.getRecent();
    expect(logs).toContainEqual(expect.objectContaining({
      level: 'info',
      domain: 'ipc',
      event: 'ipc.snapshot.loaded',
      context: expect.objectContaining({
        fileName: 'happy-path.jsonl',
        format: 'transcript',
        eventCount: snapshot.events.length
      })
    }));
    expect(snapshot.events.length).toBeGreaterThan(0);
  });

  it('emits ipc.snapshot.load_failed when loadSnapshotFromFile rejects an empty file', async () => {
    const logger = createTestLogger();
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'shadow-inst-empty-'));
    const emptyFile = path.join(tmpDir, 'empty.jsonl');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(emptyFile, '', 'utf8');

    await expect(loadSnapshotFromFile(emptyFile, undefined, logger)).rejects.toThrow(/No events/);

    const logs = logger.getRecent();
    expect(logs).toContainEqual(expect.objectContaining({
      level: 'error',
      domain: 'ipc',
      event: 'ipc.snapshot.load_failed',
      context: expect.objectContaining({
        fileName: 'empty.jsonl',
        primaryFormat: 'replay',
        secondaryFormat: 'transcript'
      })
    }));
  });
});

// ---------------------------------------------------------------------------
// Logger instrumentation — SHADOW_LOG_LEVEL sampling
// ---------------------------------------------------------------------------

describe('instrumentation sampling — logger level filtering by env', () => {
  it('only info+ events appear when minLevel=info', () => {
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
