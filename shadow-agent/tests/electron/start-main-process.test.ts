import { beforeEach, describe, expect, it, vi } from 'vitest';

const handleMock = vi.fn();
const removeHandlerMock = vi.fn();

vi.mock('electron', () => ({
  app: {
    whenReady: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    quit: vi.fn(),
    getAppPath: vi.fn(() => 'C:/tmp')
  },
  BrowserWindow: vi.fn(),
  ipcMain: {
    handle: handleMock,
    removeHandler: removeHandlerMock
  }
}));

vi.mock('../../src/electron/session-io', () => ({
  buildFixtureSnapshot: vi.fn(),
  loadSnapshotFromFile: vi.fn(),
  pickOpenFile: vi.fn(),
  saveReplayFile: vi.fn()
}));

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    handleMock.mockReset();
    removeHandlerMock.mockReset();
  });

  it('removes old handlers before registering channels', async () => {
    const { registerIpcHandlers } = await import('../../src/electron/start-main-process');

    registerIpcHandlers(() => null);

    expect(removeHandlerMock).toHaveBeenCalledWith('shadow-agent:bootstrap');
    expect(removeHandlerMock).toHaveBeenCalledWith('shadow-agent:open-replay-file');
    expect(removeHandlerMock).toHaveBeenCalledWith('shadow-agent:export-replay-jsonl');
    expect(handleMock).toHaveBeenCalledTimes(3);

    const removeOrder = removeHandlerMock.mock.invocationCallOrder;
    const handleOrder = handleMock.mock.invocationCallOrder;
    expect(removeOrder[0]).toBeLessThan(handleOrder[0]);
    expect(removeOrder[1]).toBeLessThan(handleOrder[1]);
    expect(removeOrder[2]).toBeLessThan(handleOrder[2]);
  });
});
