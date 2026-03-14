'use strict';

describe('headless watchdog integration', () => {
  test('headless.js creates watchdog in headless mode', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../src/headless.js'), 'utf-8'
    );
    expect(src).toContain('idle-watchdog');
    expect(src).toContain("mode: 'headless'");
    expect(src).toContain('watchdog.touch()');
    expect(src).toContain('watchdog.cancel()');
  });
});
