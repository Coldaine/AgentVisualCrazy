import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import type { CanonicalEvent } from '../shared/schema';
import { createLogger } from '../shared/logger';
import { buildFixtureSnapshot, loadSnapshotFromFile, pickOpenFile, saveReplayFile } from './session-io';

const APP_TITLE = 'Shadow Agent';
const logger = createLogger({ minLevel: 'info' });

function getIndexHtmlPath(): string {
  return path.resolve(app.getAppPath(), 'dist', 'index.html');
}

function getPreloadPath(): string {
  return path.join(__dirname, 'preload.cjs');
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1600,
    height: 1080,
    minWidth: 1280,
    minHeight: 860,
    title: APP_TITLE,
    backgroundColor: '#07111d',
    autoHideMenuBar: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(getIndexHtmlPath());
  }

  win.on('closed', () => {
    logger.info('app', 'window_closed');
  });

  return win;
}

export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.removeHandler('shadow-agent:bootstrap');
  ipcMain.handle('shadow-agent:bootstrap', () => {
    logger.info('ipc', 'bootstrap_requested');
    return buildFixtureSnapshot();
  });

  ipcMain.removeHandler('shadow-agent:open-replay-file');
  ipcMain.handle('shadow-agent:open-replay-file', async () => {
    const filePath = await pickOpenFile(getMainWindow());
    if (!filePath) {
      logger.info('ipc', 'open_replay_cancelled');
      return null;
    }

    logger.info('ipc', 'open_replay_selected', { fileName: path.basename(filePath) });
    return loadSnapshotFromFile(filePath);
  });

  ipcMain.removeHandler('shadow-agent:export-replay-jsonl');
  ipcMain.handle('shadow-agent:export-replay-jsonl', async (_event, events: CanonicalEvent[], suggestedFileName?: string) =>
    saveReplayFile(getMainWindow(), events, suggestedFileName)
  );
}

export function startMainProcess(): void {
  let mainWindow: BrowserWindow | null = null;

  app.whenReady().then(() => {
    registerIpcHandlers(() => mainWindow);
    mainWindow = createWindow();
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
    logger.info('app', 'ready');
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      mainWindow.on('closed', () => {
        mainWindow = null;
      });
      logger.info('app', 'window_created_on_activate');
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      logger.info('app', 'quit_on_window_all_closed');
      app.quit();
    }
  });
}
