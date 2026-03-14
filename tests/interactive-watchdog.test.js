'use strict';

describe('interactive watchdog integration', () => {
  test('interactive.js creates watchdog in interactive mode', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../src/sidecar/interactive.js'), 'utf-8'
    );
    expect(src).toContain('idle-watchdog');
    expect(src).toContain("mode: 'interactive'");
    expect(src).toContain('watchdog.cancel()');
  });
});
