import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildSessionRecord, parseReplay, serializeEvents } from '../shared/replay-store';
import type { CanonicalEvent, SessionRecord } from '../shared/schema';
import { createLogger } from '../shared/logger';

const logger = createLogger();

export interface FileReplayStoreOptions {
  sessionsDirName?: string;
  eventsFileName?: string;
  recordFileName?: string;
}

export interface StoredReplaySession {
  record: SessionRecord;
  events: CanonicalEvent[];
}

const DEFAULT_OPTIONS: Required<FileReplayStoreOptions> = {
  sessionsDirName: 'sessions',
  eventsFileName: 'events.jsonl',
  recordFileName: 'session.json'
};

function encodeSessionId(sessionId: string): string {
  return encodeURIComponent(sessionId);
}

function decodeSessionId(encodedSessionId: string): string {
  return decodeURIComponent(encodedSessionId);
}

function sortSessions(left: SessionRecord, right: SessionRecord): number {
  const updatedAtDiff = right.updatedAt.localeCompare(left.updatedAt);
  if (updatedAtDiff !== 0) {
    return updatedAtDiff;
  }

  return left.sessionId.localeCompare(right.sessionId);
}

export class FileReplayStore {
  private readonly sessionsDir: string;
  private readonly eventsFileName: string;
  private readonly recordFileName: string;

  constructor(private readonly rootDir: string, options: FileReplayStoreOptions = {}) {
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
    this.sessionsDir = join(rootDir, mergedOptions.sessionsDirName);
    this.eventsFileName = mergedOptions.eventsFileName;
    this.recordFileName = mergedOptions.recordFileName;
  }

  private sessionDir(sessionId: string): string {
    return join(this.sessionsDir, encodeSessionId(sessionId));
  }

  private eventsPath(sessionId: string): string {
    return join(this.sessionDir(sessionId), this.eventsFileName);
  }

  private recordPath(sessionId: string): string {
    return join(this.sessionDir(sessionId), this.recordFileName);
  }

  async saveSession(sessionId: string, events: CanonicalEvent[], title?: string): Promise<SessionRecord> {
    const sessionDir = this.sessionDir(sessionId);
    await mkdir(sessionDir, { recursive: true });

    const record = buildSessionRecord(events, title);
    const eventLog = `${serializeEvents(events)}${events.length > 0 ? '\n' : ''}`;
    await writeFile(this.eventsPath(sessionId), eventLog, 'utf8');
    await writeFile(this.recordPath(sessionId), `${JSON.stringify(record, null, 2)}\n`, 'utf8');

    logger.info('persistence', 'persistence.replay.saved', {
      sessionId,
      eventCount: events.length
    });
    return record;
  }

  async appendEvent(sessionId: string, event: CanonicalEvent, title?: string): Promise<SessionRecord> {
    const current = await this.loadSession(sessionId).catch(() => undefined);
    const nextEvents = [...(current?.events ?? []), event];
    logger.debug('persistence', 'persistence.replay.appended', {
      sessionId,
      kind: event.kind,
      totalEvents: nextEvents.length
    });
    return this.saveSession(sessionId, nextEvents, title ?? current?.record.title);
  }

  async loadSession(sessionId: string): Promise<StoredReplaySession> {
    logger.debug('persistence', 'persistence.replay.load_started', { sessionId });
    try {
      const eventsText = await readFile(this.eventsPath(sessionId), 'utf8');
      const events = parseReplay(eventsText);
      const record = await this.loadRecord(sessionId, events);
      logger.info('persistence', 'persistence.replay.loaded', {
        sessionId,
        eventCount: events.length
      });
      return { record, events };
    } catch (error) {
      logger.error('persistence', 'persistence.replay.load_failed', { sessionId, error });
      throw error;
    }
  }

  async loadEvents(sessionId: string): Promise<CanonicalEvent[]> {
    return (await this.loadSession(sessionId)).events;
  }

  async listSessions(): Promise<SessionRecord[]> {
    logger.debug('persistence', 'persistence.store.list_started', { rootDir: this.rootDir });
    let entries: Array<{ name: string }> = [];

    try {
      entries = await readdir(this.sessionsDir, { withFileTypes: false }).then((names) =>
        names.map((name) => ({ name }))
      );
    } catch {
      return [];
    }

    const sessions = await Promise.all(
      entries.map(async ({ name }) => {
        const sessionId = decodeSessionId(name);
        try {
          return (await this.loadSession(sessionId)).record;
        } catch {
          return undefined;
        }
      })
    );

    const result = sessions.filter((session): session is SessionRecord => Boolean(session)).sort(sortSessions);
    logger.info('persistence', 'persistence.store.listed', { sessionCount: result.length });
    return result;
  }

  private async loadRecord(sessionId: string, events: CanonicalEvent[]): Promise<SessionRecord> {
    try {
      const recordText = await readFile(this.recordPath(sessionId), 'utf8');
      const parsed = JSON.parse(recordText) as Partial<SessionRecord>;
      return buildSessionRecord(events, parsed.title ?? undefined);
    } catch {
      return buildSessionRecord(events);
    }
  }
}

export function createFileReplayStore(rootDir: string, options?: FileReplayStoreOptions): FileReplayStore {
  return new FileReplayStore(rootDir, options);
}
