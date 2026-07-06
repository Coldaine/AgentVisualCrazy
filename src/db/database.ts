import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CanonicalEvent,
  EventQueueMetrics,
  ShadowInsight,
  SessionRecord
} from '../shared/schema';

const CURRENT_DB_VERSION = 1;
const DB_FILENAME = 'shadow-agent.sqlite';

export interface ShadowDatabase {
  readonly dbPath: string;
  close(): void;

  // Sessions
  saveSession(record: SessionRecord): SessionRecord;
  getSession(sessionId: string): SessionRecord | null;
  listSessions(limit?: number): SessionRecord[];
  deleteSession(sessionId: string): boolean;

  // Events
  insertEvents(events: CanonicalEvent[]): void;
  getEvents(sessionId: string, offset?: number, limit?: number): CanonicalEvent[];
  getAllEvents(sessionId: string): CanonicalEvent[];
  getEventCount(sessionId: string): number;
  deleteEvents(sessionId: string): void;

  // Interpretations
  insertInterpretations(sessionId: string, insights: ShadowInsight[]): void;
  getInterpretations(sessionId: string): ShadowInsight[];
  deleteInterpretations(sessionId: string): void;

  // Presentations
  getPresentationState(sessionId: string): Record<string, unknown>;
  setPresentationState(sessionId: string, state: Record<string, unknown>): void;
  appendMutation(sessionId: string, mutation: {
    mutationType: string;
    targetId: string;
    payload: Record<string, unknown>;
    appliedBy?: string;
  }): void;
  getMutations(sessionId: string, limit?: number): Array<{
    id: string;
    mutationType: string;
    targetId: string;
    payload: Record<string, unknown>;
    appliedBy: string;
    createdAt: string;
  }>;

  // Patterns
  getActivePatterns(): Array<{
    id: string;
    name: string;
    origin: string;
    triggerJson: Record<string, unknown>;
    visualJson: Record<string, unknown>;
  }>;
  getPatternById(patternId: string): Record<string, unknown> | null;
  insertPattern(pattern: {
    name: string;
    origin?: string;
    status?: string;
    triggerJson?: Record<string, unknown>;
    visualJson?: Record<string, unknown>;
    description?: string;
  }): string;
  updatePatternStatus(patternId: string, status: string): void;
  recordPatternApplication(patternId: string, sessionId: string, outcome?: string): void;
  getSeenPatternOutcome(patternId: string, sessionId: string): string | null;
}

function migrationsDir(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return join(__dirname, 'migrations');
}

function loadMigrationSql(version: number): string {
  const filePath = join(migrationsDir(), `${String(version).padStart(3, '0')}-initial.sql`);
  return readFileSync(filePath, 'utf8');
}

export function createDatabase(dbPath?: string): ShadowDatabase {
  const resolvedPath = dbPath ?? join(process.cwd(), DB_FILENAME);

  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run initial migration
  const migrationSql = loadMigrationSql(CURRENT_DB_VERSION);
  db.exec(migrationSql);

  // Prepared statements
  const insertSession = db.prepare(`
    INSERT OR REPLACE INTO sessions (session_id, title, started_at, updated_at, source, event_count)
    VALUES (@sessionId, @title, @startedAt, @updatedAt, @source, @eventCount)
  `);

  const getSessionStmt = db.prepare(`SELECT * FROM sessions WHERE session_id = ?`);

  const listSessionsStmt = db.prepare(`SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?`);

  const deleteSessionStmt = db.prepare(`DELETE FROM sessions WHERE session_id = ?`);

  const insertEvent = db.prepare(`
    INSERT OR REPLACE INTO events (id, session_id, source, timestamp, actor, kind, payload, harness_id, driver_version, correlation_id)
    VALUES (@id, @sessionId, @source, @timestamp, @actor, @kind, @payload, @harnessId, @driverVersion, @correlationId)
  `);

  const getEventsStmt = db.prepare(`SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC, offset ASC LIMIT ? OFFSET ?`);

  const getAllEventsStmt = db.prepare(`SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC, offset ASC`);

  const getEventCountStmt = db.prepare(`SELECT COUNT(*) as count FROM events WHERE session_id = ?`);

  const deleteEventsStmt = db.prepare(`DELETE FROM events WHERE session_id = ?`);

  const deleteMutationsStmt = db.prepare(`DELETE FROM presentation_mutations WHERE session_id = ?`);
  const deletePresStmt = db.prepare(`DELETE FROM presentations WHERE session_id = ?`);
  const deletePatAppStmt = db.prepare(`DELETE FROM pattern_applications WHERE session_id = ?`);

  const insertInterpretation = db.prepare(`
    INSERT OR REPLACE INTO interpretations (id, session_id, kind, source, confidence, scope, summary, structured_payload, provider, model)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const getInterpretationsStmt = db.prepare(`SELECT * FROM interpretations WHERE session_id = ? ORDER BY created_at DESC`);

  const deleteInterpretationsStmt = db.prepare(`DELETE FROM interpretations WHERE session_id = ?`);

  const getPresState = db.prepare(`SELECT * FROM presentations WHERE session_id = ?`);

  const upsertPresState = db.prepare(`
    INSERT INTO presentations (id, session_id, state_json, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(session_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at
  `);

  const insertMutation = db.prepare(`
    INSERT INTO presentation_mutations (id, session_id, mutation_type, target_id, payload, applied_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const getMutationsStmt = db.prepare(`SELECT * FROM presentation_mutations WHERE session_id = ? ORDER BY rowid DESC LIMIT ?`);

  const getActivePatternsStmt = db.prepare(`SELECT * FROM patterns WHERE status = 'active'`);

  const getPatternByIdStmt = db.prepare(`SELECT * FROM patterns WHERE id = ?`);

  const insertPatternStmt = db.prepare(`
    INSERT INTO patterns (id, name, origin, status, trigger_json, visual_json, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const updatePatternStatusStmt = db.prepare(`UPDATE patterns SET status = ?, updated_at = datetime('now') WHERE id = ?`);

  const recordPatternAppStmt = db.prepare(`
    INSERT OR REPLACE INTO pattern_applications (pattern_id, session_id, applied_at, outcome)
    VALUES (?, ?, datetime('now'), ?)
  `);

  const getPatternOutcomeStmt = db.prepare(`SELECT outcome FROM pattern_applications WHERE pattern_id = ? AND session_id = ?`);

  return {
    get dbPath() { return resolvedPath; },

    close() {
      db.close();
    },

    saveSession(record: SessionRecord): SessionRecord {
      insertSession.run(record);
      return record;
    },

    getSession(sessionId: string): SessionRecord | null {
      const row = getSessionStmt.get(sessionId) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        sessionId: String(row.session_id),
        title: String(row.title),
        startedAt: String(row.started_at),
        updatedAt: String(row.updated_at),
        source: String(row.source),
        eventCount: Number(row.event_count),
      };
    },

    listSessions(limit = 50): SessionRecord[] {
      return (listSessionsStmt.all(limit) as Record<string, unknown>[]).map(rowToSession);
    },

    deleteSession(sessionId: string): boolean {
      deleteEventsStmt.run(sessionId);
      deleteInterpretationsStmt.run(sessionId);
      deleteMutationsStmt.run(sessionId);
      deletePresStmt.run(sessionId);
      deletePatAppStmt.run(sessionId);
      const info = deleteSessionStmt.run(sessionId);
      return info.changes > 0;
    },

    insertEvents(events: CanonicalEvent[]): void {
      const insertMany = db.transaction((evts: CanonicalEvent[]) => {
        for (let i = 0; i < evts.length; i++) {
          const e = evts[i];
          insertEvent.run({
            id: e.id,
            sessionId: e.sessionId,
            source: e.source,
            timestamp: e.timestamp,
            actor: e.actor,
            kind: e.kind,
            payload: JSON.stringify(e.payload),
            harnessId: e.harnessId ?? null,
            driverVersion: e.driverVersion ?? null,
            correlationId: e.correlationId ?? null,
          });
        }
      });
      insertMany(events);
    },

    getEvents(sessionId: string, offset = 0, limit = 100): CanonicalEvent[] {
      return (getEventsStmt.all(sessionId, limit, offset) as Record<string, unknown>[]).map(rowToEvent);
    },

    getAllEvents(sessionId: string): CanonicalEvent[] {
      return (getAllEventsStmt.all(sessionId) as Record<string, unknown>[]).map(rowToEvent);
    },

    getEventCount(sessionId: string): number {
      const row = getEventCountStmt.get(sessionId) as { count: number };
      return row.count;
    },

    deleteEvents(sessionId: string): void {
      deleteEventsStmt.run(sessionId);
    },

    insertInterpretations(sessionId: string, insights: ShadowInsight[]): void {
      const insertMany = db.transaction((ins: ShadowInsight[]) => {
        deleteInterpretationsStmt.run(sessionId);
        for (const insight of ins) {
          insertInterpretation.run(
            `${sessionId}-${insight.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            sessionId,
            insight.kind,
            insight.source,
            insight.confidence,
            insight.scope,
            insight.summary,
            insight.structuredPayload ? JSON.stringify(insight.structuredPayload) : '{}',
            null,
            null,
          );
        }
      });
      insertMany(insights);
    },

    getInterpretations(sessionId: string): ShadowInsight[] {
      const rows = getInterpretationsStmt.all(sessionId) as Record<string, unknown>[];
      return rows.map((row) => ({
        kind: String(row.kind) as ShadowInsight['kind'],
        source: String(row.source) as ShadowInsight['source'],
        confidence: Number(row.confidence),
        scope: String(row.scope) as ShadowInsight['scope'],
        summary: String(row.summary),
        evidenceEventIds: [],
        structuredPayload: row.structured_payload ? JSON.parse(String(row.structured_payload)) : undefined,
      }));
    },

    deleteInterpretations(sessionId: string): void {
      deleteInterpretationsStmt.run(sessionId);
    },

    getPresentationState(sessionId: string): Record<string, unknown> {
      const row = getPresState.get(sessionId) as Record<string, unknown> | undefined;
      if (!row) return {};
      return JSON.parse(String(row.state_json));
    },

    setPresentationState(sessionId: string, state: Record<string, unknown>): void {
      const existing = getPresState.get(sessionId) as Record<string, unknown> | undefined;
      const id = existing ? String(existing.id) : `${sessionId}-pres`;
      upsertPresState.run(id, sessionId, JSON.stringify(state));
    },

    appendMutation(sessionId: string, mutation: {
      mutationType: string;
      targetId: string;
      payload: Record<string, unknown>;
      appliedBy?: string;
    }): void {
      const id = `${sessionId}-mut-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      insertMutation.run(id, sessionId, mutation.mutationType, mutation.targetId, JSON.stringify(mutation.payload), mutation.appliedBy ?? 'shadow');
    },

    getMutations(sessionId: string, limit = 50) {
      const rows = getMutationsStmt.all(sessionId, limit) as Record<string, unknown>[];
      return rows.map((row) => ({
        id: String(row.id),
        mutationType: String(row.mutation_type),
        targetId: String(row.target_id),
        payload: JSON.parse(String(row.payload)),
        appliedBy: String(row.applied_by),
        createdAt: String(row.created_at),
      }));
    },

    getActivePatterns() {
      const rows = getActivePatternsStmt.all() as Record<string, unknown>[];
      return rows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        origin: String(row.origin),
        triggerJson: JSON.parse(String(row.trigger_json)),
        visualJson: JSON.parse(String(row.visual_json)),
      }));
    },

    getPatternById(patternId: string): Record<string, unknown> | null {
      const row = getPatternByIdStmt.get(patternId) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        id: String(row.id),
        name: String(row.name),
        origin: String(row.origin),
        status: String(row.status),
        triggerJson: JSON.parse(String(row.trigger_json)),
        visualJson: JSON.parse(String(row.visual_json)),
        description: String(row.description),
      };
    },

    insertPattern(pattern: {
      name: string;
      origin?: string;
      status?: string;
      triggerJson?: Record<string, unknown>;
      visualJson?: Record<string, unknown>;
      description?: string;
    }): string {
      const id = `pat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      insertPatternStmt.run(
        id,
        pattern.name,
        pattern.origin ?? 'crafted',
        pattern.status ?? 'draft',
        JSON.stringify(pattern.triggerJson ?? {}),
        JSON.stringify(pattern.visualJson ?? {}),
        pattern.description ?? '',
      );
      return id;
    },

    updatePatternStatus(patternId: string, status: string): void {
      updatePatternStatusStmt.run(status, patternId);
    },

    recordPatternApplication(patternId: string, sessionId: string, outcome?: string): void {
      recordPatternAppStmt.run(patternId, sessionId, outcome ?? null);
    },

    getSeenPatternOutcome(patternId: string, sessionId: string): string | null {
      const row = getPatternOutcomeStmt.get(patternId, sessionId) as { outcome: string | null } | undefined;
      return row?.outcome ?? null;
    },
  };
}

function rowToSession(row: Record<string, unknown>): SessionRecord {
  return {
    sessionId: String(row.session_id),
    title: String(row.title),
    startedAt: String(row.started_at),
    updatedAt: String(row.updated_at),
    source: String(row.source),
    eventCount: Number(row.event_count),
  };
}

function rowToEvent(row: Record<string, unknown>): CanonicalEvent {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    source: String(row.source),
    timestamp: String(row.timestamp),
    actor: String(row.actor),
    kind: String(row.kind) as CanonicalEvent['kind'],
    payload: JSON.parse(String(row.payload)),
    harnessId: row.harness_id ? String(row.harness_id) : undefined,
    driverVersion: row.driver_version ? String(row.driver_version) : undefined,
    correlationId: row.correlation_id ? String(row.correlation_id) : undefined,
  };
}
