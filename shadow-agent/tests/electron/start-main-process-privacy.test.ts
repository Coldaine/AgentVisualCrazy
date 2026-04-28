import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

const DEFAULT_PRIVACY_SETTINGS = {
  allowRawTranscriptStorage: false,
  allowOffHostInference: false
} as const;

const OPTED_IN_PRIVACY_SETTINGS = {
  allowRawTranscriptStorage: true,
  allowOffHostInference: true
} as const;

const whenReadyMock = vi.fn(() => Promise.resolve());
const appOnMock = vi.fn();
const quitMock = vi.fn();
const getPathMock = vi.fn(() => 'C:\\shadow-user-data');
const handleMock = vi.fn();
const removeHandlerMock = vi.fn();
const browserWindowOnMock = vi.fn();
const loadFileMock = vi.fn();
const loadUrlMock = vi.fn();
const browserWindowInstance = {
  on: browserWindowOnMock,
  loadFile: loadFileMock,
  loadURL: loadUrlMock,
  webContents: {}
};
const BrowserWindowMock = vi.fn(() => browserWindowInstance);

const loadTranscriptPrivacySettingsMock = vi.fn(async () => OPTED_IN_PRIVACY_SETTINGS);

const bufferMock = {
  getAll: vi.fn(async () => []),
  subscribe: vi.fn(() => () => undefined),
  registerConsumer: vi.fn(),
  readPending: vi.fn(),
  commitCheckpoint: vi.fn(),
  getMetrics: vi.fn(),
  getBackpressure: vi.fn(),
  setSession: vi.fn(),
  push: vi.fn()
};

const sessionManagerMock = {
  start: vi.fn(async () => undefined),
  stop: vi.fn(),
  getBuffer: vi.fn(() => bufferMock),
  getCurrentSnapshot: vi.fn(async () => null)
};

const createSessionManagerMock = vi.fn(() => sessionManagerMock);

const inferenceEngineMock = {
  start: vi.fn(async () => undefined),
  stop: vi.fn()
};

const createInferenceEngineMock = vi.fn(() => inferenceEngineMock);

vi.mock('electron', () => ({
  app: {
    whenReady: whenReadyMock,
    on: appOnMock,
    quit: quitMock,
    isReady: vi.fn(() => true),
    getAppPath: vi.fn(() => 'C:\\tmp'),
    getPath: getPathMock
  },
  BrowserWindow: BrowserWindowMock,
  ipcMain: {
    handle: handleMock,
    removeHandler: removeHandlerMock
  }
}));

vi.mock('../../src/shared/privacy', () => ({
  DEFAULT_TRANSCRIPT_PRIVACY_SETTINGS: DEFAULT_PRIVACY_SETTINGS,
  loadTranscriptPrivacySettings: loadTranscriptPrivacySettingsMock
}));

vi.mock('../../src/electron/session-io', () => ({
  buildFixtureSnapshot: vi.fn(),
  loadSnapshotFromFile: vi.fn(),
  pickOpenFile: vi.fn(),
  saveReplayFile: vi.fn()
}));

vi.mock('../../src/capture/session-manager', () => ({
  createSessionManager: createSessionManagerMock
}));

vi.mock('../../src/inference/shadow-inference-engine', () => ({
  createInferenceEngine: createInferenceEngineMock
}));

async function flushStartup(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('startMainProcess privacy wiring', () => {
  beforeEach(() => {
    whenReadyMock.mockClear();
    appOnMock.mockClear();
    quitMock.mockClear();
    getPathMock.mockClear();
    handleMock.mockClear();
    removeHandlerMock.mockClear();
    BrowserWindowMock.mockClear();
    browserWindowOnMock.mockClear();
    loadFileMock.mockClear();
    loadUrlMock.mockClear();
    loadTranscriptPrivacySettingsMock.mockClear();
    createSessionManagerMock.mockClear();
    createInferenceEngineMock.mockClear();
    inferenceEngineMock.start.mockClear();
    inferenceEngineMock.stop.mockClear();
    sessionManagerMock.start.mockClear();
    sessionManagerMock.stop.mockClear();
    sessionManagerMock.getBuffer.mockClear();
    bufferMock.getAll.mockClear();
    vi.resetModules();
  });

  it('forwards loaded privacy settings into both capture and inference startup', async () => {
    const { startMainProcess } = await import('../../src/electron/start-main-process');

    startMainProcess();
    await flushStartup();

    expect(loadTranscriptPrivacySettingsMock).toHaveBeenCalledOnce();
    expect(createSessionManagerMock).toHaveBeenCalledOnce();
    const [, sessionManagerOptions] = createSessionManagerMock.mock.calls[0] as [
      () => unknown,
      {
        getPrivacy: () => typeof OPTED_IN_PRIVACY_SETTINGS;
        queuePersistenceRoot: string;
      }
    ];
    expect(sessionManagerOptions.queuePersistenceRoot).toBe(path.join('C:\\shadow-user-data', 'capture-queue'));
    expect(sessionManagerOptions.getPrivacy()).toEqual(OPTED_IN_PRIVACY_SETTINGS);
    expect(createInferenceEngineMock).toHaveBeenCalledWith(
      expect.objectContaining({
        buffer: bufferMock,
        privacy: OPTED_IN_PRIVACY_SETTINGS,
        onInsights: expect.any(Function),
        getState: expect.any(Function)
      })
    );
    expect(sessionManagerMock.start).toHaveBeenCalledOnce();
    expect(inferenceEngineMock.start).toHaveBeenCalledOnce();
  });
});
