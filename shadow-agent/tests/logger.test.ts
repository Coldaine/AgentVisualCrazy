import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
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
