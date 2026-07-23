import { CanonicalEvent, SessionRecord } from './schema';
import { DEFAULT_TRANSCRIPT_PRIVACY_SETTINGS, prepareEventsForStorage } from './privacy';

export function serializeEvents(
  events: CanonicalEvent[],
  options: { storeRawTranscript?: boolean } = {},
  privacy = DEFAULT_TRANSCRIPT_PRIVACY_SETTINGS
): string {
  const prepared = prepareEventsForStorage(events, privacy, options);
  return prepared.map((event) => JSON.stringify(event)).join('\n');
}

/**
 * Sniff whether a raw JSONL blob is an already-normalized CanonicalEvent
 * replay (`.replay.jsonl`) or a raw harness transcript. A CanonicalEvent line
 * always carries a top-level `kind`; a raw transcript line does not. Lives here
 * (next to parseReplay/serializeEvents) rather than in the Electron layer so
 * headless consumers — the replay runner CLI — can reuse it without importing
 * `electron`. Re-exported from `electron/session-io.ts` for the app path.
 */
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

export function parseReplay(text: string): CanonicalEvent[] {
  const events: CanonicalEvent[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    try {
      events.push(JSON.parse(trimmed) as CanonicalEvent);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse replay JSON on line ${index + 1}: ${message}`);
    }
  });

  return events;
}

function getDefaultTimestamp(): string {
  return new Date(0).toISOString();
}

function normalizeTimestamp(timestamp: string | undefined): string | null {
  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }

  return date.toISOString();
}

export function buildSessionRecord(events: CanonicalEvent[], title = 'Observed session'): SessionRecord {
  const first = events[0];
  let startedAt = getDefaultTimestamp();
  let updatedAt = getDefaultTimestamp();

  for (const event of events) {
    const normalizedTimestamp = normalizeTimestamp(event.timestamp);
    if (!normalizedTimestamp) {
      continue;
    }

    if (startedAt === getDefaultTimestamp() || normalizedTimestamp < startedAt) {
      startedAt = normalizedTimestamp;
    }

    if (updatedAt === getDefaultTimestamp() || normalizedTimestamp > updatedAt) {
      updatedAt = normalizedTimestamp;
    }
  }

  return {
    sessionId: first?.sessionId ?? 'unknown',
    title,
    startedAt,
    updatedAt,
    source: first?.source ?? 'replay',
    eventCount: events.length
  };
}
