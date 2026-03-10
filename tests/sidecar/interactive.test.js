/**
 * Interactive Mode Tests
 *
 * Tests for buildElectronEnv: environment variable construction
 * for the Electron sidecar process.
 */

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

const { buildElectronEnv } = require('../../src/sidecar/interactive');

const BASE_ARGS = ['task-001', 'google/gemini-2.5', '/project', '/bin', '/usr/bin'];

describe('buildElectronEnv - window position', () => {
  it('sets SIDECAR_WINDOW_POSITION when windowPosition is provided', () => {
    const env = buildElectronEnv(...BASE_ARGS, { windowPosition: 'right' });
    expect(env.SIDECAR_WINDOW_POSITION).toBe('right');
  });

  it('sets SIDECAR_WINDOW_POSITION to left', () => {
    const env = buildElectronEnv(...BASE_ARGS, { windowPosition: 'left' });
    expect(env.SIDECAR_WINDOW_POSITION).toBe('left');
  });

  it('sets SIDECAR_WINDOW_POSITION to center', () => {
    const env = buildElectronEnv(...BASE_ARGS, { windowPosition: 'center' });
    expect(env.SIDECAR_WINDOW_POSITION).toBe('center');
  });

  it('omits SIDECAR_WINDOW_POSITION when not provided', () => {
    const env = buildElectronEnv(...BASE_ARGS, {});
    expect(env.SIDECAR_WINDOW_POSITION).toBeUndefined();
  });
});
