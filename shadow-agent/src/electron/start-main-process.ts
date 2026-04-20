import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { DEFAULT_TRANSCRIPT_PRIVACY_SETTINGS, loadTranscriptPrivacySettings } from '../shared/privacy';
import type { CanonicalEvent, TranscriptPrivacySettings } from '../shared/schema';
import { createLogger } from '../shared/logger';
import { buildFixtureSnapshot, loadSnapshotFromFile, pickOpenFile, saveReplayFile } from './session-io';
import { createSessionManager } from '../capture/session-manager';
import { createInferenceEngine, type InferenceEngine } from '../inference/shadow-inference-engine';
import { deriveState } from '../shared/derive';

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

export function registerIpcHandlers(
  getMainWindow: () => BrowserWindow | null,
  privacySettings: TranscriptPrivacySettings = DEFAULT_TRANSCRIPT_PRIVACY_SETTINGS
): void {
  ipcMain.removeHandler('shadow-agent:bootstrap');
  ipcMain.handle('shadow-agent:bootstrap', () => {
    logger.info('ipc', 'bootstrap_requested');
    return buildFixtureSnapshot(privacySettings);
  });

  ipcMain.removeHandler('shadow-agent:open-replay-file');
  ipcMain.handle('shadow-agent:open-replay-file', async () => {
    let filePath: string | undefined;
    try {
      filePath = await pickOpenFile(getMainWindow());
      if (!filePath) {
        logger.info('ipc', 'open_replay_cancelled');
        return null;
      }

      logger.info('ipc', 'open_replay_selected', { fileName: path.basename(filePath) });
      return await loadSnapshotFromFile(filePath, privacySettings);
    } catch (error) {
      logger.error('ipc', 'open_replay_failed', {
        fileName: filePath ? path.basename(filePath) : undefined,
        error
      });
      throw error;
    }
  });

  ipcMain.removeHandler('shadow-agent:export-replay-jsonl');
  ipcMain.handle(
    'shadow-agent:export-replay-jsonl',
    async (
      _event,
      events: CanonicalEvent[],
      suggestedFileName?: string,
      options?: { storeRawTranscript?: boolean }
    ) => {
    try {
      return await saveReplayFile(getMainWindow(), events, suggestedFileName, options, privacySettings);
    } catch (error) {
      logger.error('ipc', 'export_replay_failed', {
        suggestedFileName: suggestedFileName ? path.basename(suggestedFileName) : undefined,
        storeRawTranscript: options?.storeRawTranscript === true,
        error
      });
      return {
        canceled: false,
        error: error instanceof Error ? error.message : 'Unable to export replay JSONL.'
      };
    }
    }
  );
}

export function startMainProcess(): void {
  let mainWindow: BrowserWindow | null = null;
  let sessionManager: ReturnType<typeof createSessionManager> | null = null;
  let inferenceEngine: InferenceEngine | null = null;

  app
    .whenReady()
    .then(async () => {
      const privacySettings = await loadTranscriptPrivacySettings();
      const currentSessionManager = createSessionManager(() => mainWindow?.webContents ?? null, {
        privacy: privacySettings,
        queuePersistenceRoot: path.join(app.getPath('userData'), 'capture-queue')
      });
      sessionManager = currentSessionManager;
      registerIpcHandlers(() => mainWindow, privacySettings);
      try {
        mainWindow = createWindow();
        mainWindow.on('closed', () => {
          mainWindow = null;
        });
        // Start live transcript capture (non-blocking; falls back gracefully if no session found)
        void currentSessionManager.start();
        inferenceEngine = createInferenceEngine({
          buffer: currentSessionManager.getBuffer(),
          getState: () => {
            const events = currentSessionManager.getBuffer().getAll();
            return deriveState(events);
          },
          onInsights: (insights) => {
            logger.info('inference', 'insights_received', { count: insights.length });
          }
        });
        void inferenceEngine.start();
        logger.info('app', 'ready');
      } catch (error) {
        logger.error('app', 'window_create_failed_on_ready', { error });
        app.quit();
      }
    })
    .catch((error) => {
      logger.error('app', 'when_ready_failed', { error });
      app.quit();
    });

  app.on('activate', () => {
    if (app.isReady() && BrowserWindow.getAllWindows().length === 0) {
      try {
        mainWindow = createWindow();
        mainWindow.on('closed', () => {
          mainWindow = null;
        });
        logger.info('app', 'window_created_on_activate');
      } catch (error) {
        logger.error('app', 'window_create_failed_on_activate', { error });
        app.quit();
      }
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      logger.info('app', 'quit_on_window_all_closed');
      inferenceEngine?.stop();
      inferenceEngine = null;
      sessionManager?.stop();
      app.quit();
    }
  });
}
