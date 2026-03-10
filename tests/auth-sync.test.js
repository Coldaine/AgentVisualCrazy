/**
 * Auth Sync Tests
 *
 * Tests for syncOpenCodeAuth() — keeps OPENROUTER_API_KEY in ~/.config/sidecar/.env
 * and ~/.local/share/opencode/auth.json in sync. .env is source of truth on conflict.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('fs');
jest.mock('../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

const { syncOpenCodeAuth } = require('../src/utils/auth-sync');
const { logger } = require('../src/utils/logger');
const AUTH_JSON_PATH = path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json');

function mockAuthJson(content) {
  fs.existsSync.mockImplementation((p) => p === AUTH_JSON_PATH);
  fs.readFileSync.mockImplementation((p) => {
    if (p === AUTH_JSON_PATH) { return JSON.stringify(content); }
    throw new Error(`ENOENT: ${p}`);
  });
}

function mockAuthJsonMissing() {
  fs.existsSync.mockReturnValue(false);
}

describe('syncOpenCodeAuth', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.clearAllMocks();
    fs.writeFileSync = jest.fn();
    fs.mkdirSync = jest.fn();
    fs.existsSync = jest.fn().mockReturnValue(false);
    fs.readFileSync = jest.fn();
  });

  afterEach(() => {
    // Restore process.env
    Object.keys(process.env).forEach(k => {
      if (!(k in originalEnv)) { delete process.env[k]; }
    });
    Object.assign(process.env, originalEnv);
  });

  test('no-op when env and auth.json have matching key', () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-abc123';
    mockAuthJson({ openrouter: { type: 'api', key: 'sk-or-v1-abc123' } });

    syncOpenCodeAuth();

    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  test('updates auth.json when env key differs from auth.json key', () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-NEW';
    mockAuthJson({ openrouter: { type: 'api', key: 'sk-or-v1-OLD' } });

    syncOpenCodeAuth();

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      AUTH_JSON_PATH,
      expect.stringContaining('sk-or-v1-NEW'),
      'utf-8'
    );
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({
      msg: expect.stringMatching(/out of sync|conflict/i),
    }));
  });

  test('adds openrouter entry to auth.json when missing', () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-abc123';
    mockAuthJson({});  // auth.json exists but has no openrouter key

    syncOpenCodeAuth();

    const written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
    expect(written.openrouter.key).toBe('sk-or-v1-abc123');
  });

  test('creates auth.json when file does not exist', () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-abc123';
    mockAuthJsonMissing();

    syncOpenCodeAuth();

    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      AUTH_JSON_PATH,
      expect.stringContaining('sk-or-v1-abc123'),
      'utf-8'
    );
  });

  test('sets process.env from auth.json when env var not set', () => {
    delete process.env.OPENROUTER_API_KEY;
    mockAuthJson({ openrouter: { type: 'api', key: 'sk-or-v1-fromfile' } });

    syncOpenCodeAuth();

    expect(process.env.OPENROUTER_API_KEY).toBe('sk-or-v1-fromfile');
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  test('no-op when neither env nor auth.json has a key', () => {
    delete process.env.OPENROUTER_API_KEY;
    mockAuthJson({});

    syncOpenCodeAuth();

    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  test('handles malformed auth.json gracefully without throwing', () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-abc123';
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('not valid json {{');

    expect(() => syncOpenCodeAuth()).not.toThrow();
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  test('preserves other auth.json entries when updating openrouter key', () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-v1-NEW';
    mockAuthJson({
      openrouter: { type: 'api', key: 'sk-or-v1-OLD' },
      google: { apiKey: 'AIza-existing' },
    });

    syncOpenCodeAuth();

    const written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
    expect(written.openrouter.key).toBe('sk-or-v1-NEW');
    expect(written.google.apiKey).toBe('AIza-existing');
  });
});
