'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

describe('SessionLock', () => {
  let acquireLock, releaseLock, isLockStale;
  let tmpDir;

  beforeAll(() => {
    ({ acquireLock, releaseLock, isLockStale } = require('../src/utils/session-lock'));
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sidecar-lock-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('acquireLock creates lock file with correct contents', () => {
    acquireLock(tmpDir, 'headless');
    const lockPath = path.join(tmpDir, 'session.lock');
    expect(fs.existsSync(lockPath)).toBe(true);
    const contents = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
    expect(contents.pid).toBe(process.pid);
    expect(contents.mode).toBe('headless');
    expect(contents.hostname).toBe(os.hostname());
    expect(typeof contents.timestamp).toBe('string');
  });

  test('acquireLock throws if lock already held by live process', () => {
    acquireLock(tmpDir, 'headless');
    expect(() => acquireLock(tmpDir, 'headless')).toThrow(/already active/i);
  });

  test('acquireLock succeeds if existing lock is stale (dead PID)', () => {
    const lockPath = path.join(tmpDir, 'session.lock');
    fs.writeFileSync(lockPath, JSON.stringify({
      pid: 999999999,
      timestamp: new Date().toISOString(),
      hostname: os.hostname(),
      mode: 'headless',
    }));
    expect(() => acquireLock(tmpDir, 'headless')).not.toThrow();
  });

  test('acquireLock succeeds if lock file is corrupt', () => {
    const lockPath = path.join(tmpDir, 'session.lock');
    fs.writeFileSync(lockPath, 'not json{{{');
    expect(() => acquireLock(tmpDir, 'headless')).not.toThrow();
  });

  test('releaseLock deletes lock file', () => {
    acquireLock(tmpDir, 'headless');
    releaseLock(tmpDir);
    expect(fs.existsSync(path.join(tmpDir, 'session.lock'))).toBe(false);
  });

  test('releaseLock is safe when no lock exists', () => {
    expect(() => releaseLock(tmpDir)).not.toThrow();
  });

  test('isLockStale returns true for dead PID', () => {
    const result = isLockStale({
      pid: 999999999,
      timestamp: new Date().toISOString(),
      mode: 'headless',
    });
    expect(result).toBe(true);
  });

  test('isLockStale returns false for live PID within time window', () => {
    const result = isLockStale({
      pid: process.pid,
      timestamp: new Date().toISOString(),
      mode: 'headless',
    });
    expect(result).toBe(false);
  });

  test('isLockStale returns true for live PID but very old timestamp', () => {
    const result = isLockStale({
      pid: process.pid,
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      mode: 'headless',
    });
    expect(result).toBe(true);
  });
});
