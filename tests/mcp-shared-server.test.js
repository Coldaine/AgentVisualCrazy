'use strict';

const fs = require('fs');
const path = require('path');

describe('MCP shared server integration', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../src/mcp-server.js'), 'utf-8'
  );

  test('imports SharedServerManager', () => {
    expect(src).toContain('shared-server');
    expect(src).toContain('SharedServerManager');
  });

  test('checks SIDECAR_SHARED_SERVER feature flag', () => {
    expect(src).toContain('sharedServer.enabled');
  });

  test('has SIGTERM/SIGINT cleanup handlers', () => {
    expect(src).toContain('SIGTERM');
    expect(src).toContain('sharedServer.shutdown()');
  });
});
