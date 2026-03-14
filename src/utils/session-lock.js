'use strict';

/**
 * @module session-lock
 * Atomic session lock files to prevent concurrent resume/continue.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const LOCK_FILENAME = 'session.lock';

const MODE_TIMEOUTS = {
  headless: 15 * 60 * 1000,
  interactive: 60 * 60 * 1000,
  mcp: 15 * 60 * 1000,
};

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isLockStale(lockData) {
  if (!isPidAlive(lockData.pid)) {
    return true;
  }
  const modeTimeout = MODE_TIMEOUTS[lockData.mode] || MODE_TIMEOUTS.headless;
  const ageMs = Date.now() - new Date(lockData.timestamp).getTime();
  if (ageMs > modeTimeout * 2) {
    return true;
  }
  return false;
}

function acquireLock(sessionDir, mode) {
  const lockPath = path.join(sessionDir, LOCK_FILENAME);
  const lockData = {
    pid: process.pid,
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    mode,
  };

  // First attempt: atomic create
  try {
    fs.writeFileSync(lockPath, JSON.stringify(lockData, null, 2), { flag: 'wx', mode: 0o600 });
    return;
  } catch (err) {
    if (err.code !== 'EEXIST') { throw err; }
  }

  // Lock file exists - check if stale
  let existingLock;
  try {
    existingLock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
  } catch {
    try { fs.unlinkSync(lockPath); } catch { /* already gone */ }
    fs.writeFileSync(lockPath, JSON.stringify(lockData, null, 2), { flag: 'wx', mode: 0o600 });
    return;
  }

  if (isLockStale(existingLock)) {
    try { fs.unlinkSync(lockPath); } catch { /* race */ }
    try {
      fs.writeFileSync(lockPath, JSON.stringify(lockData, null, 2), { flag: 'wx', mode: 0o600 });
      return;
    } catch (retryErr) {
      if (retryErr.code === 'EEXIST') {
        throw new Error('Session already active (concurrent lock acquisition)');
      }
      throw retryErr;
    }
  }

  throw new Error(
    `Session already active (PID ${existingLock.pid}, started ${existingLock.timestamp})`
  );
}

function releaseLock(sessionDir) {
  const lockPath = path.join(sessionDir, LOCK_FILENAME);
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // Lock may not exist
  }
}

module.exports = { acquireLock, releaseLock, isLockStale, isPidAlive };
