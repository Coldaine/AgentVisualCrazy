import { CanonicalEvent, SessionRecord } from './schema';

export function serializeEvents(events: CanonicalEvent[]): string {
  return events.map((event) => JSON.stringify(event)).join('\n');
}

export function parseReplay(text: string): CanonicalEvent[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CanonicalEvent);
}

export function buildSessionRecord(events: CanonicalEvent[], title = 'Observed session'): SessionRecord {
  const first = events[0];
  const last = events[events.length - 1];
  return {
    sessionId: first?.sessionId ?? 'unknown',
    title,
    startedAt: first?.timestamp ?? new Date(0).toISOString(),
    updatedAt: last?.timestamp ?? new Date(0).toISOString(),
    source: first?.source ?? 'replay',
    eventCount: events.length
  };
}
