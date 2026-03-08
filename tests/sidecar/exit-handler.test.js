/**
 * Crash Handler Tests
 *
 * Tests for installCrashHandler: updates metadata.json to status 'error'
 * when the spawned sidecar process crashes with an uncaught exception.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { SessionPaths } = require('../../src/sidecar/session-utils');
const { installCrashHandler } = require('../../src/sidecar/crash-handler');

describe('Crash Handler', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crash-handler-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes error status to metadata on crash', () => {
    const taskId = 'task-crash-001';
    const sessionDir = SessionPaths.sessionDir(tmpDir, taskId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const metadata = {
      taskId,
      status: 'running',
      model: 'test-model',
      createdAt: new Date().toISOString()
    };
    fs.writeFileSync(
      SessionPaths.metadataFile(sessionDir),
      JSON.stringify(metadata, null, 2)
    );

    const handler = installCrashHandler(taskId, tmpDir);
    handler(new Error('something broke'));

    const updated = JSON.parse(
      fs.readFileSync(SessionPaths.metadataFile(sessionDir), 'utf-8')
    );
    expect(updated.status).toBe('error');
    expect(updated.reason).toBe('something broke');
    expect(updated.errorAt).toBeDefined();
    // Verify errorAt is a valid ISO date
    expect(new Date(updated.errorAt).toISOString()).toBe(updated.errorAt);
  });

  it('does nothing if metadata does not exist', () => {
    const taskId = 'task-nonexistent-999';
    const handler = installCrashHandler(taskId, tmpDir);

    // Should not throw
    expect(() => handler(new Error('crash'))).not.toThrow();
  });

  it('does nothing if status is already complete', () => {
    const taskId = 'task-complete-002';
    const sessionDir = SessionPaths.sessionDir(tmpDir, taskId);
    fs.mkdirSync(sessionDir, { recursive: true });

    const metadata = {
      taskId,
      status: 'complete',
      model: 'test-model',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    };
    fs.writeFileSync(
      SessionPaths.metadataFile(sessionDir),
      JSON.stringify(metadata, null, 2)
    );

    const handler = installCrashHandler(taskId, tmpDir);
    handler(new Error('late crash'));

    const updated = JSON.parse(
      fs.readFileSync(SessionPaths.metadataFile(sessionDir), 'utf-8')
    );
    expect(updated.status).toBe('complete');
    expect(updated.reason).toBeUndefined();
    expect(updated.errorAt).toBeUndefined();
  });
});
