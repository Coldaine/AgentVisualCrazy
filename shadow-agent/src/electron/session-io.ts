import { dialog, type BrowserWindow } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deriveState } from '../shared/derive';
import { paymentRefactorSession } from '../shared/fixtures/payment-refactor-session';
import { buildSessionRecord, parseReplay, serializeEvents } from '../shared/replay-store';
import type { CanonicalEvent, ExportResult, LoadedSource, SnapshotPayload } from '../shared/schema';
import { parseClaudeTranscriptJsonl } from '../shared/transcript-adapter';

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function inferTitle(events: CanonicalEvent[], fallback: string): string {
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

export function createSnapshot(events: CanonicalEvent[], source: LoadedSource): SnapshotPayload {
  const title = inferTitle(events, source.label);
  const record = buildSessionRecord(events, title);
  return {
    source,
    record,
    state: deriveState(events, record.title),
    events
  };
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
      // Keep scanning for a decisive replay marker.
    } catch {
      // Try later lines. JSONL may contain non-JSON prelude lines.
    }
  }

  return 'transcript';
}

export async function loadSnapshotFromFile(filePath: string): Promise<SnapshotPayload> {
  const raw = await readFile(filePath, 'utf8');
  const primaryFormat = detectReplayFormat(raw);
  const secondaryFormat = primaryFormat === 'replay' ? 'transcript' : 'replay';
  const fileName = path.basename(filePath);

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

    throw new Error(
      `No events could be read from ${fileName}. ` +
        `Primary parser (${primaryFormat}) ${primaryDetail}. ` +
        `Secondary parser (${secondaryFormat}) ${secondaryDetail}.`
    );
  }

  return createSnapshot(events, {
    kind: format,
    label: fileName,
    path: filePath
  });
}

export function buildFixtureSnapshot(): SnapshotPayload {
  return createSnapshot(paymentRefactorSession, {
    kind: 'fixture',
    label: 'Built-in replay fixture'
  });
}

export async function pickOpenFile(mainWindow: BrowserWindow | null): Promise<string | undefined> {
  const result = await dialog.showOpenDialog(mainWindow ?? null!, {
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

export async function saveReplayFile(
  mainWindow: BrowserWindow | null,
  events: CanonicalEvent[],
  suggestedFileName = 'shadow-agent-replay.jsonl'
): Promise<ExportResult> {
  try {
    const result = await dialog.showSaveDialog(mainWindow ?? null!, {
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
