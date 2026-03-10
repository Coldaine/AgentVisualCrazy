/**
 * Tests for main index module
 *
 * Smoke tests for re-exports and generateTaskId.
 * Detailed behavioral tests live in sidecar/*.test.js files:
 *   - sidecar/start.test.js    → startSidecar
 *   - sidecar/read.test.js     → listSidecars, readSidecar
 *   - sidecar/resume.test.js   → resumeSidecar
 *   - sidecar/continue.test.js → continueSidecar
 */

jest.mock('../src/opencode-client', () => ({
  createClient: jest.fn(),
  createSession: jest.fn(),
  sendPrompt: jest.fn(),
  sendPromptAsync: jest.fn(),
  getMessages: jest.fn(),
  checkHealth: jest.fn(),
  startServer: jest.fn(),
  loadMcpConfig: jest.fn().mockReturnValue(null),
  parseMcpSpec: jest.fn().mockReturnValue(null),
  abortSession: jest.fn()
}));

jest.mock('../src/utils/mcp-discovery', () => ({
  discoverParentMcps: jest.fn().mockReturnValue(null)
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  }
}));

const {
  startSidecar,
  listSidecars,
  resumeSidecar,
  continueSidecar,
  readSidecar,
  generateTaskId,
  COMPLETE_MARKER,
  FOLD_MARKER,
  buildContext,
  formatFoldOutput,
  detectEnvironment,
  inferClient,
  getSessionRoot,
  compressContext,
  estimateTokens
} = require('../src/index');

describe('Index Module', () => {
  describe('generateTaskId', () => {
    it('should generate an 8-character hex string', () => {
      const taskId = generateTaskId();
      expect(taskId).toMatch(/^[a-f0-9]{8}$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateTaskId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('Re-exports', () => {
    it('should export all core sidecar operations', () => {
      expect(typeof startSidecar).toBe('function');
      expect(typeof listSidecars).toBe('function');
      expect(typeof readSidecar).toBe('function');
      expect(typeof resumeSidecar).toBe('function');
      expect(typeof continueSidecar).toBe('function');
    });

    it('should export environment detection functions', () => {
      expect(typeof detectEnvironment).toBe('function');
      expect(typeof inferClient).toBe('function');
      expect(typeof getSessionRoot).toBe('function');
    });

    it('should export context compression functions', () => {
      expect(typeof compressContext).toBe('function');
      expect(typeof estimateTokens).toBe('function');
    });

    it('should export FOLD_MARKER as [SIDECAR_FOLD]', () => {
      expect(FOLD_MARKER).toBe('[SIDECAR_FOLD]');
    });

    it('should export COMPLETE_MARKER as [SIDECAR_FOLD]', () => {
      expect(COMPLETE_MARKER).toBe('[SIDECAR_FOLD]');
    });

    it('should export formatFoldOutput', () => {
      expect(typeof formatFoldOutput).toBe('function');
    });

    it('should export buildContext', () => {
      expect(typeof buildContext).toBe('function');
    });
  });
});
