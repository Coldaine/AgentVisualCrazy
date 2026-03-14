'use strict';

const fs = require('fs');
const path = require('path');

describe('headless external server support', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../src/headless.js'), 'utf-8'
  );

  test('checks for externalServer flag', () => {
    expect(src).toContain('externalServer');
  });

  test('skips server.close() when externalServer is true', () => {
    expect(src).toContain('!externalServer');
  });

  test('accepts options.sessionId', () => {
    expect(src).toContain('options.sessionId');
  });

  test('accepts options.watchdog', () => {
    expect(src).toContain('options.watchdog');
  });
});
