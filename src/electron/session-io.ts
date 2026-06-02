import { dialog, type BrowserWindow } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { paymentRefactorSession } from '../shared/fixtures/payment-refactor-session';
import { parseReplay, serializeEvents } from '../shared/replay-store';
import type {
  CanonicalEvent,
  ExportResult,
  LoadedSource,
  SnapshotPayload
} from '../shared/schema';
import { buildRendererInput, inferRendererInputTitle } from '../shared/renderer-input-adapter';
import { parseClaudeTranscriptJsonl } from '../shared/transcript-adapter';
import { createLogger, type Logger } from '../shared/logger';

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export const inferTitle = inferRendererInputTitle;

export function createSnapshot(
  events: CanonicalEvent[],
  source: LoadedSource,
  logger: Logger = createLogger()
): SnapshotPayload {
  const snapshot = buildRendererInput(events, {
    source,
    fallbackTitle: source.label
  });

  // Log snapshot creation so we can verify the IPC pipeline produced the
  // same source/count the renderer receives. Missing = stuck loading screen.
  logger.info('ipc', 'ipc.snapshot.created', {
    sourceKind: source.kind,
    eventCount: events.length
  });
  return snapshot;
}

export function detectReplayFormat(raw: string): 'replay' | 'transcript' {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 25);

  if (lines.length === 0) {
    return 'replay';
  }

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (typeof parsed.kind === 'string') {
        return 'replay';
      }
      if ('sessionId' in parsed || 'message' in parsed) {
        return 'transcript';
      }
    } catch {
      // Try later lines. JSONL may contain non-JSON prelude lines.
    }
  }

  return 'transcript';
}

export async function loadSnapshotFromFile(
  filePath: string,
  logger: Logger = createLogger()
): Promise<SnapshotPayload> {
  const raw = await readFile(filePath, 'utf8');
  const primaryFormat = detectReplayFormat(raw);
  const secondaryFormat = primaryFormat === 'replay' ? 'transcript' : 'replay';
  const fileName = path.basename(filePath);

  logger.info('ipc', 'ipc.snapshot.load_started', { fileName, detectedFormat: primaryFormat });

  let format = primaryFormat;
  let events: CanonicalEvent[] = [];
  let primaryError: unknown;
  let secondaryError: unknown;
  let secondaryAttempted = false;

  try {
    events = primaryFormat === 'replay' ? parseReplay(raw) : parseClaudeTranscriptJsonl(raw);
  } catch (error) {
    primaryError = error;
    events = [];
  }

  const shouldTrySecondary = events.length === 0 && !(primaryFormat === 'replay' && primaryError);
  if (shouldTrySecondary) {
    secondaryAttempted = true;
    try {
      const fallbackEvents = secondaryFormat === 'replay' ? parseReplay(raw) : parseClaudeTranscriptJsonl(raw);
      if (fallbackEvents.length > 0) {
        format = secondaryFormat;
        events = fallbackEvents;
        // Log format fallback so we can diagnose auto-detection edge cases.
        logger.info('ipc', 'ipc.snapshot.format_fallback_used', { fileName, fallbackFormat: secondaryFormat });
      }
    } catch (error) {
      secondaryError = error;
    }
  }

  if (events.length === 0) {
    const primaryDetail = primaryError
      ? `failed with "${formatErrorMessage(primaryError)}"`
      : 'returned zero events';
    const secondaryDetail = secondaryAttempted
      ? secondaryError
        ? `failed with "${formatErrorMessage(secondaryError)}"`
        : 'returned zero events'
      : 'was skipped to preserve replay parser errors';

    const msg =
      `No events could be read from ${fileName}. ` +
      `Primary parser (${primaryFormat}) ${primaryDetail}. ` +
      `Secondary parser (${secondaryFormat}) ${secondaryDetail}.`;

    // Log load failures so we can diagnose corrupted files, wrong format
    // detection, or unsupported transcript versions.
    logger.error('ipc', 'ipc.snapshot.load_failed', {
      fileName,
      primaryFormat,
      primaryError,
      secondaryFormat,
      secondaryAttempted,
      secondaryError
    });
    throw new Error(msg);
  }

  // Log loaded snapshot so we can confirm the parser detection worked and
  // the renderer received the expected event count.
  logger.info('ipc', 'ipc.snapshot.loaded', { fileName, format, eventCount: events.length });
  return createSnapshot(events, {
    kind: format,
    label: fileName,
    path: filePath
  }, logger);
}

export function buildFixtureSnapshot(
  logger: Logger = createLogger()
): SnapshotPayload {
  // Log fixture build so we can verify the app boot path produced the
  // expected built-in replay size. Missing = blank landing screen.
  logger.info('ipc', 'ipc.snapshot.fixture_built', { eventCount: paymentRefactorSession.length });
  return createSnapshot(paymentRefactorSession, {
    kind: 'fixture',
    label: 'Built-in replay fixture'
  }, logger);
}

export async function pickOpenFile(mainWindow: BrowserWindow | null): Promise<string | undefined> {
  const openDialogResult = await dialog.showOpenDialog(mainWindow ?? null!, {
    title: 'Open transcript or replay file',
    properties: ['openFile'],
    filters: [
      { name: 'Replay files', extensions: ['jsonl', 'ndjson'] },
      { name: 'JSON files', extensions: ['json'] },
      { name: 'Text files', extensions: ['txt'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });

  if (openDialogResult.canceled || openDialogResult.filePaths.length === 0) {
    return undefined;
  }

  return openDialogResult.filePaths[0];
}

export async function saveReplayFile(
  mainWindow: BrowserWindow | null,
  events: CanonicalEvent[],
  suggestedFileName = 'shadow-agent-replay.jsonl',
  logger: Logger = createLogger()
): Promise<ExportResult> {
  try {
    const saveDialogResult = await dialog.showSaveDialog(mainWindow ?? null!, {
      title: 'Export replay JSONL',
      defaultPath: suggestedFileName.endsWith('.jsonl') ? suggestedFileName : `${suggestedFileName}.jsonl`,
      filters: [{ name: 'Replay files', extensions: ['jsonl'] }]
    });

    if (saveDialogResult.canceled || !saveDialogResult.filePath) {
      logger.info('ipc', 'ipc.export.cancelled');
      return { canceled: true };
    }

    await writeFile(saveDialogResult.filePath, serializeEvents(events), 'utf8');
    // Log export save so we can confirm the file was written with the
    // expected event count. Missing exports = broken file dialog or disk full.
    logger.info('ipc', 'ipc.export.saved', { fileName: path.basename(saveDialogResult.filePath), eventCount: events.length });
    return { canceled: false, filePath: saveDialogResult.filePath };
  } catch (error) {
    // Log export failures so we can diagnose permission issues, disk errors,
    // or other file I/O failures that block user-initiated export.
    logger.error('ipc', 'ipc.export.failed', { error });
    return {
      canceled: false,
      error: error instanceof Error ? error.message : 'Unable to export replay JSONL.'
    };
  }
}
