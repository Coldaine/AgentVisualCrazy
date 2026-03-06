/**
 * Tests for client parameter passthrough in startOpenCodeServer
 */

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('../../src/utils/path-setup', () => ({
  ensureNodeModulesBinInPath: jest.fn()
}));

jest.mock('../../src/utils/server-setup', () => ({
  ensurePortAvailable: jest.fn()
}));

jest.mock('../../src/headless', () => ({
  waitForServer: jest.fn(async () => true)
}));

const mockStartServer = jest.fn(async () => ({
  client: { config: { get: jest.fn() } },
  server: { url: 'http://127.0.0.1:3456', close: jest.fn() }
}));
const mockCheckHealth = jest.fn(async () => true);

jest.mock('../../src/opencode-client', () => ({
  startServer: mockStartServer,
  checkHealth: mockCheckHealth
}));

const { startOpenCodeServer } = require('../../src/sidecar/session-utils');

describe('startOpenCodeServer client passthrough', () => {
  beforeEach(() => {
    mockStartServer.mockClear();
  });

  it('passes client option to startServer when provided', async () => {
    await startOpenCodeServer(null, { client: 'cowork' });

    expect(mockStartServer).toHaveBeenCalledWith(
      expect.objectContaining({ client: 'cowork' })
    );
  });

  it('does not set client when not provided', async () => {
    await startOpenCodeServer(null);

    const passedOpts = mockStartServer.mock.calls[0][0];
    expect(passedOpts.client).toBeUndefined();
  });

  it('passes both mcp and client when both provided', async () => {
    const mcpConfig = { myServer: { command: 'test' } };
    await startOpenCodeServer(mcpConfig, { client: 'code-local' });

    expect(mockStartServer).toHaveBeenCalledWith(
      expect.objectContaining({
        mcp: mcpConfig,
        client: 'code-local'
      })
    );
  });
});
