import { CanonicalEvent, SessionRecord } from './schema';

export function serializeEvents(events: CanonicalEvent[]): string {
  return events.map((event) => JSON.stringify(event)).join('\n');
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
