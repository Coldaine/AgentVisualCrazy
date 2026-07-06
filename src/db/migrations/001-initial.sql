CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Observed session',
  started_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'replay',
  event_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id)
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  source TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  actor TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  harness_id TEXT,
  driver_version TEXT,
  correlation_id TEXT,
  offset INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind);

CREATE TABLE IF NOT EXISTS interpretations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  kind TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'model',
  confidence REAL NOT NULL DEFAULT 0.0,
  scope TEXT NOT NULL DEFAULT 'session',
  summary TEXT NOT NULL DEFAULT '',
  structured_payload TEXT DEFAULT '{}',
  provider TEXT,
  model TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_interpretations_session ON interpretations(session_id);

CREATE TABLE IF NOT EXISTS interpretation_evidence (
  interpretation_id TEXT NOT NULL REFERENCES interpretations(id),
  event_id TEXT NOT NULL REFERENCES events(id),
  PRIMARY KEY (interpretation_id, event_id)
);

CREATE TABLE IF NOT EXISTS presentations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  state_json TEXT NOT NULL DEFAULT '{}',
  active_pattern_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id)
);

CREATE TABLE IF NOT EXISTS presentation_mutations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  mutation_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  applied_by TEXT NOT NULL DEFAULT 'shadow',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mutations_session ON presentation_mutations(session_id);

CREATE TABLE IF NOT EXISTS patterns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'crafted',
  status TEXT NOT NULL DEFAULT 'draft',
  trigger_json TEXT NOT NULL DEFAULT '{}',
  visual_json TEXT NOT NULL DEFAULT '{}',
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pattern_applications (
  pattern_id TEXT NOT NULL REFERENCES patterns(id),
  session_id TEXT NOT NULL REFERENCES sessions(session_id),
  applied_at TEXT NOT NULL DEFAULT (datetime('now')),
  outcome TEXT,
  PRIMARY KEY (pattern_id, session_id)
);
