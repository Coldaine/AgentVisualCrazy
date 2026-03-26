import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deriveState } from '../shared/derive';
import { paymentRefactorSession } from '../shared/fixtures/payment-refactor-session';
import { buildSessionRecord, parseReplay, serializeEvents } from '../shared/replay-store';
import { parseClaudeTranscriptJsonl } from '../shared/transcript-adapter';
import type { CanonicalEvent, DerivedState, SessionRecord } from '../shared/schema';

interface LoadedSource {
  kind: 'fixture' | 'replay' | 'transcript';
  label: string;
  path?: string;
}

interface SnapshotPayload {
  source: LoadedSource;
  record: SessionRecord;
  state: DerivedState;
  events: CanonicalEvent[];
}

interface ExportResult {
  canceled: boolean;
  filePath?: string;
  error?: string;
}

const APP_TITLE = 'Shadow Agent';

let mainWindow: BrowserWindow | null = null;

function inferTitle(events: CanonicalEvent[], fallback: string): string {
  const labeledSession = events.find(
    (event) => event.kind === 'session_started' && typeof event.payload.label === 'string' && event.payload.label.length > 0
  );
  if (labeledSession) {
    return String(labeledSession.payload.label);
  }

  const sessionTitle = events.find(
    (event) => event.kind === 'context_snapshot' && typeof event.payload.title === 'string' && event.payload.title.length > 0
  );
  if (sessionTitle) {
    return String(sessionTitle.payload.title);
  }

  const firstUserMessage = events.find(
    (event) => event.kind === 'message' && event.actor === 'user' && typeof event.payload.text === 'string'
  );
  if (firstUserMessage) {
    return String(firstUserMessage.payload.text).slice(0, 80);
  }

  return fallback;
}

function createSnapshot(events: CanonicalEvent[], source: LoadedSource): SnapshotPayload {
  const title = inferTitle(events, source.label);
  const record = buildSessionRecord(events, title);
  return {
    source,
    record,
    state: deriveState(events, record.title),
    events
  };
}

function detectReplayFormat(raw: string): 'replay' | 'transcript' {
  const firstLine = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return 'replay';
  }

  try {
    const parsed = JSON.parse(firstLine) as Record<string, unknown>;
    if (typeof parsed.kind === 'string') {
      return 'replay';
    }
  } catch {
    return 'transcript';
  }

  return 'transcript';
}

async function loadSnapshotFromFile(filePath: string): Promise<SnapshotPayload> {
  const raw = await readFile(filePath, 'utf8');
  const format = detectReplayFormat(raw);
  const events = format === 'replay' ? parseReplay(raw) : parseClaudeTranscriptJsonl(raw);
  if (events.length === 0) {
    throw new Error(`No events could be read from ${path.basename(filePath)}.`);
  }

  return createSnapshot(events, {
    kind: format,
    label: path.basename(filePath),
    path: filePath
  });
}

function buildFixtureSnapshot(): SnapshotPayload {
  return createSnapshot(paymentRefactorSession, {
    kind: 'fixture',
    label: 'Built-in replay fixture'
  });
}

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
      sandbox: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(getIndexHtmlPath());
  }

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  return win;
}

async function pickOpenFile(): Promise<string | undefined> {
  const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: 'Open transcript or replay file',
    properties: ['openFile'],
    filters: [
      { name: 'Replay files', extensions: ['jsonl', 'ndjson'] },
      { name: 'JSON files', extensions: ['json'] },
      { name: 'Text files', extensions: ['txt'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return undefined;
  }

  return result.filePaths[0];
}

async function saveReplayFile(events: CanonicalEvent[], suggestedFileName = 'shadow-agent-replay.jsonl'): Promise<ExportResult> {
  try {
    const result = await dialog.showSaveDialog(mainWindow ?? undefined, {
      title: 'Export replay JSONL',
      defaultPath: suggestedFileName.endsWith('.jsonl') ? suggestedFileName : `${suggestedFileName}.jsonl`,
      filters: [{ name: 'Replay files', extensions: ['jsonl'] }]
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    await writeFile(result.filePath, serializeEvents(events), 'utf8');
    return { canceled: false, filePath: result.filePath };
  } catch (error) {
    return {
      canceled: false,
      error: error instanceof Error ? error.message : 'Unable to export replay JSONL.'
    };
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('shadow-agent:bootstrap', () => buildFixtureSnapshot());
  ipcMain.handle('shadow-agent:open-replay-file', async () => {
    const filePath = await pickOpenFile();
    if (!filePath) {
      return null;
    }

    return loadSnapshotFromFile(filePath);
  });
  ipcMain.handle('shadow-agent:export-replay-jsonl', async (_event, events: CanonicalEvent[], suggestedFileName?: string) =>
    saveReplayFile(events, suggestedFileName)
  );
}

app.whenReady().then(() => {
  registerIpcHandlers();
  mainWindow = createWindow();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
