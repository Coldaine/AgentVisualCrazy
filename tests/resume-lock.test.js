'use strict';

const fs = require('fs');
const path = require('path');

describe('resume dead-process detection', () => {
  test('resume.js imports session-lock and liveness helpers', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/sidecar/resume.js'), 'utf-8'
    );
    expect(src).toContain('session-lock');
    expect(src).toContain('checkSessionLiveness');
    expect(src).toContain('acquireLock');
  });
});

describe('session lock integration', () => {
  test('start.js uses session lock', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/sidecar/start.js'), 'utf-8'
    );
    expect(src).toContain('session-lock');
    expect(src).toContain('acquireLock');
    expect(src).toContain('releaseLock');
  });

  test('continue.js uses session lock', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/sidecar/continue.js'), 'utf-8'
    );
    expect(src).toContain('session-lock');
    expect(src).toContain('acquireLock');
    expect(src).toContain('releaseLock');
  });
});
