import type { CanonicalEvent, SessionRecord } from '../shared/schema';
import { buildSessionRecord } from '../shared/replay-store';
import { createLogger, type Logger } from '../shared/logger';
import type { ShadowDatabase } from '../db/database';

export interface DatabaseReplayStoreOptions {
  logger?: Logger;
}

export interface StoredReplaySession {
  record: SessionRecord;
  events: CanonicalEvent[];
}

export class DatabaseReplayStore {
  private readonly logger: Logger;

  constructor(
    private readonly db: ShadowDatabase,
    options: DatabaseReplayStoreOptions = {},
  ) {
    this.logger = options.logger ?? createLogger();
  }

  async saveSession(
    sessionId: string,
    events: CanonicalEvent[],
    title?: string,
  ): Promise<SessionRecord> {
    const record = buildSessionRecord(events, title);
    this.db.saveSession(record);
    this.db.deleteEvents(sessionId);
    this.db.insertEvents(events);

    this.logger.info('persistence', 'persistence.replay.saved', {
      sessionId,
      eventCount: events.length,
    });
    return record;
  }

  async appendEvent(
    sessionId: string,
    event: CanonicalEvent,
    title?: string,
  ): Promise<SessionRecord> {
    const current = await this.loadSession(sessionId).catch(() => undefined);
    const nextEvents = [...(current?.events ?? []), event];
    this.logger.debug('persistence', 'persistence.replay.appended', {
      sessionId,
      kind: event.kind,
      totalEvents: nextEvents.length,
    });
    return this.saveSession(sessionId, nextEvents, title ?? current?.record.title);
  }

  async loadSession(sessionId: string): Promise<StoredReplaySession> {
    this.logger.debug('persistence', 'persistence.replay.load_started', { sessionId });
    const record = this.db.getSession(sessionId);
    if (!record) {
      const err = new Error(`Session not found: ${sessionId}`);
      this.logger.error('persistence', 'persistence.replay.load_failed', { sessionId, error: err });
      throw err;
    }
    const events = this.db.getAllEvents(sessionId);
    this.logger.info('persistence', 'persistence.replay.loaded', {
      sessionId,
      eventCount: events.length,
    });
    return { record, events };
  }

  async loadEvents(sessionId: string): Promise<CanonicalEvent[]> {
    return (await this.loadSession(sessionId)).events;
  }

  async listSessions(): Promise<SessionRecord[]> {
    this.logger.debug('persistence', 'persistence.store.list_started');
    const sessions = this.db.listSessions(100);
    this.logger.info('persistence', 'persistence.store.listed', { sessionCount: sessions.length });
    return sessions;
  }
}

export function createDatabaseReplayStore(
  db: ShadowDatabase,
  options?: DatabaseReplayStoreOptions,
): DatabaseReplayStore {
  return new DatabaseReplayStore(db, options);
}
