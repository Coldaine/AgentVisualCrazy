import { describe, expect, it, afterEach } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLogger } from '../src/shared/logger';

describe('structured logger', () => {
  it('applies minimum level filtering and memory capacity', () => {
    const logger = createLogger({
      minLevel: 'warn',
      includeConsole: false,
      includeMemory: true,
      memoryCapacity: 2
    });

    logger.info('app', 'ignored_info');
    logger.warn('app', 'warning_event');
    logger.error('app', 'error_event');
    logger.error('app', 'overflow_event');

    const logs = logger.getRecent(10);
    expect(logs).toHaveLength(2);
    expect(logs.map((entry) => entry.event)).toEqual(['error_event', 'overflow_event']);
  });

  it('redacts sensitive text-like fields in context', () => {
    const logger = createLogger({
      minLevel: 'debug',
      includeConsole: false,
      includeMemory: true
    });

    logger.debug('inference', 'prompt_built', {
      prompt: 'top-secret',
      content: 'raw content',
      text: 'full transcript chunk',
      payload: {
        prompt: 'nested prompt',
        details: { content: 'nested content', keep: true }
      },
      list: [{ text: 'redact me' }, { safe: 'ok' }],
      contentType: 'application/json',
      error: new Error('boom'),
      eventCount: 12
    });

    const [entry] = logger.getRecent(1);
    expect(entry.context).toEqual({
      prompt: '[redacted]',
      content: '[redacted]',
      text: '[redacted]',
      payload: {
        prompt: '[redacted]',
        details: { content: '[redacted]', keep: true }
      },
      list: [{ text: '[redacted]' }, { safe: 'ok' }],
      contentType: 'application/json',
      error: {
        name: 'Error',
        message: 'boom',
        stack: expect.any(String),
        redacted: false
      },
      eventCount: 12
    });
  });

  it('handles circular arrays in context without recursion overflow', () => {
    const logger = createLogger({
      minLevel: 'debug',
      includeConsole: false,
      includeMemory: true
    });

    const circular: unknown[] = [];
    circular.push(circular);

    logger.debug('app', 'circular_array', { circular });

    const [entry] = logger.getRecent(1);
    expect(entry.context).toEqual({
      circular: ['[circular]']
    });
  });

  it('tracks file write failures even with console logging disabled', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'shadow-agent-logger-failure-'));
    const logger = createLogger({
      minLevel: 'debug',
      includeConsole: false,
      includeMemory: false,
      filePath: tempDir
    });

    logger.error('app', 'file_write_failure');

    for (let attempt = 0; attempt < 20 && logger.getWriteFailureCount() === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    expect(logger.getWriteFailureCount()).toBeGreaterThan(0);
  });
});

describe('structured logger — Error cause chain', () => {
  it('serializes a single-level cause on Error instances', () => {
    const logger = createLogger({ minLevel: 'debug', includeConsole: false });
    const cause = new Error('root cause');
    const err = new Error('outer error');
    (err as Error & { cause?: unknown }).cause = cause;

    logger.error('app', 'test_event', { err });
    const [entry] = logger.getRecent(1);

    expect(entry.context?.err).toMatchObject({
      name: 'Error',
      message: 'outer error',
      cause: {
        name: 'Error',
        message: 'root cause',
        redacted: false
      },
      redacted: false
    });
  });

  it('serializes a two-level cause chain', () => {
    const logger = createLogger({ minLevel: 'debug', includeConsole: false });
    const root = new Error('db connection refused');
    const mid = new Error('query failed');
    (mid as Error & { cause?: unknown }).cause = root;
    const top = new Error('request failed');
    (top as Error & { cause?: unknown }).cause = mid;

    logger.error('persistence', 'load.failed', { err: top });
    const [entry] = logger.getRecent(1);

    const serialized = entry.context?.err as Record<string, unknown>;
    expect(serialized.message).toBe('request failed');
    const midSer = serialized.cause as Record<string, unknown>;
    expect(midSer.message).toBe('query failed');
    const rootSer = midSer.cause as Record<string, unknown>;
    expect(rootSer.message).toBe('db connection refused');
  });

  it('handles Error with no cause gracefully (no cause key in output)', () => {
    const logger = createLogger({ minLevel: 'debug', includeConsole: false });
    const err = new Error('simple error');
    logger.error('app', 'ev', { err });
    const [entry] = logger.getRecent(1);
    const serialized = entry.context?.err as Record<string, unknown>;
    expect('cause' in serialized).toBe(false);
  });
});

describe('structured logger — SHADOW_LOG_LEVEL env var', () => {
  afterEach(() => {
    delete process.env['SHADOW_LOG_LEVEL'];
  });

  it('defaults to info level when SHADOW_LOG_LEVEL is not set', () => {
    delete process.env['SHADOW_LOG_LEVEL'];
    const logger = createLogger({ includeConsole: false });
    logger.debug('app', 'should_be_filtered');
    logger.info('app', 'should_be_kept');
    expect(logger.getRecent(10).map((e) => e.event)).toEqual(['should_be_kept']);
  });

  it('respects SHADOW_LOG_LEVEL=debug', () => {
    process.env['SHADOW_LOG_LEVEL'] = 'debug';
    const logger = createLogger({ includeConsole: false });
    logger.debug('app', 'debug_event');
    logger.info('app', 'info_event');
    expect(logger.getRecent(10).map((e) => e.event)).toEqual(['debug_event', 'info_event']);
  });

  it('respects SHADOW_LOG_LEVEL=warn (filters debug + info)', () => {
    process.env['SHADOW_LOG_LEVEL'] = 'warn';
    const logger = createLogger({ includeConsole: false });
    logger.debug('app', 'debug_ev');
    logger.info('app', 'info_ev');
    logger.warn('app', 'warn_ev');
    logger.error('app', 'error_ev');
    expect(logger.getRecent(10).map((e) => e.event)).toEqual(['warn_ev', 'error_ev']);
  });

  it('explicit minLevel option overrides SHADOW_LOG_LEVEL env var', () => {
    process.env['SHADOW_LOG_LEVEL'] = 'debug';
    const logger = createLogger({ minLevel: 'error', includeConsole: false });
    logger.debug('app', 'should_be_filtered');
    logger.error('app', 'should_be_kept');
    expect(logger.getRecent(10).map((e) => e.event)).toEqual(['should_be_kept']);
  });

  it('ignores unrecognised SHADOW_LOG_LEVEL value and falls back to info', () => {
    process.env['SHADOW_LOG_LEVEL'] = 'verbose';
    const logger = createLogger({ includeConsole: false });
    logger.debug('app', 'debug_filtered');
    logger.info('app', 'info_kept');
    expect(logger.getRecent(10).map((e) => e.event)).toEqual(['info_kept']);
  });
});

describe('structured logger — file rotation', () => {
  it('rotates the log file when it exceeds rotationMaxBytes', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'shadow-logger-rotate-'));
    const logFile = path.join(tempDir, 'shadow.log');

    // Pre-fill the file so it already exceeds the 50-byte threshold
    await writeFile(logFile, 'x'.repeat(60), 'utf8');

    const logger = createLogger({
      minLevel: 'debug',
      includeConsole: false,
      includeMemory: false,
      filePath: logFile,
      rotationMaxBytes: 50
    });

    logger.info('app', 'after_rotation');

    // Wait for the async write to complete
    for (let i = 0; i < 50; i++) {
      const recent = logger.getWriteFailureCount() + logger.getDroppedWriteCount();
      if (recent === 0) {
        try {
          const contents = await readFile(logFile, 'utf8');
          if (contents.includes('after_rotation')) break;
        } catch { /* not written yet */ }
      }
      await new Promise((r) => setTimeout(r, 10));
    }

    // The rotated file should still contain the pre-fill data
    const rotated = await readFile(`${logFile}.1`, 'utf8');
    expect(rotated).toContain('x'.repeat(60));

    // The new file should contain the post-rotation entry
    const current = await readFile(logFile, 'utf8');
    expect(current).toContain('after_rotation');
  });
});

describe('structured logger — bounded write queue backpressure', () => {
  it('drops writes and increments droppedWriteCount when queue is full', () => {
    const logger = createLogger({
      minLevel: 'debug',
      includeConsole: false,
      includeMemory: false,
      filePath: '/dev/null',
      maxQueueDepth: 1
    });

    // write_1: pushed, then immediately shifted into drainQueue before first await
    // write_2: queue empty again → pushed (depth=1 reached)
    // write_3: queue length=1 >= maxQueueDepth=1 → dropped
    logger.info('app', 'write_1');
    logger.info('app', 'write_2');
    logger.info('app', 'write_3');

    expect(logger.getDroppedWriteCount()).toBeGreaterThanOrEqual(1);
  });
});
