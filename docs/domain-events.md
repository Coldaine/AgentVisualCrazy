# Domain: Event Capture

The event capture pipeline watches an observed agent's transcript files, parses events
incrementally, normalizes them into a canonical schema, and streams them to the renderer.

Agent-flow event patterns: `docs/research/visual-patterns-agent-flow.md` §4-5
Sidecar session patterns: `docs/research/visual-patterns-sidecar.md` §5-6
Implementation plan: `docs/plans/plan-event-capture.md`

## Transcript Watcher

We watch Claude Code's JSONL transcript files via Node.js `fs.watch`. Claude Code writes
transcripts to `~/.claude/projects/<project-hash>/` as `.jsonl` files. The watcher tracks
byte offset (not line count) to handle partial writes, reads new bytes on change, and
debounces file change events to 100ms to batch reads during heavy tool-calling phases.

The watcher handles edge cases: file truncation (reset offset to 0), file rotation (close
old watcher, open new), and incomplete lines (buffered until newline arrives).

## Canonical Event Schema

All events from any source get normalized into `CanonicalEvent` objects. The schema maps
Claude Code's JSONL structure to a uniform format:

| Claude Code field | CanonicalEvent |
|-------------------|----------------|
| `user` / `assistant` entry | `kind: 'message'`, `actor: 'user'` or `'assistant'` |
| Tool use block | `kind: 'tool_started'`, `payload: { toolName, args }` |
| Tool result block | `kind: 'tool_completed'` or `'tool_failed'` |
| Subagent spawn | `kind: 'subagent_dispatched'` |
| Session start marker | `kind: 'session_started'` |

Each event gets: a generated UUID, session ID from discovery metadata, `source:
'claude-transcript'`, and timestamp (from entry or file modification time as fallback).

## Incremental JSONL Parser

The parser receives raw string chunks and maintains a line buffer. Complete lines (newline-
terminated) are JSON-parsed individually. The last unterminated segment stays in the buffer.
Lines that fail `JSON.parse` are logged and skipped — Claude Code may write incomplete
lines during a crash.

## Session Discovery

On startup and every 30 seconds, we scan `~/.claude/projects/` for `.jsonl` files, sorted
by modification time. The most recently modified file is the "active session." The user can
also specify a path explicitly (setup wizard or CLI arg).

When a new session is detected, the old pipeline tears down and a new one starts. When no
writes arrive for 5 minutes, we emit `session_ended`.

## Session Recovery (Catch-Up)

When shadow-agent starts and a session already has content, we read the entire existing
JSONL file first (bulk parse), push all events into the buffer, run `deriveState()` for
initial state, send the snapshot to the renderer, then switch to incremental watching.
This handles starting shadow-agent after the observed agent has been working for a while.

## Event Buffer

An in-memory ring buffer (default capacity: 2000 events) in the Electron main process.
Supports `push`, `getRecent(n)`, `getAll`, `subscribe(callback)`, and `getSince(eventId)`
for catch-up. Both the renderer and the inference trigger consume from this buffer.

## IPC Bridge

Two patterns connect main process to renderer:

**Push (main → renderer):** New events are batched and debounced at 150ms, sent via
`webContents.send('shadow:events', batch)`. DerivedState rebuilds are debounced at 250ms.

**Pull (renderer → main):** On startup or reconnect, the renderer requests a full
snapshot via `ipcMain.handle('shadow:snapshot')` or incremental catch-up via
`ipcMain.handle('shadow:events-since', eventId)`.

Canvas redraws are governed by requestAnimationFrame (max 60fps, natural throttle).

## Adapters (Future)

The architecture is transport-agnostic. The buffer and IPC bridge don't care where events
come from. Planned adapters beyond the JSONL watcher:

- **HTTP hook server** (Phase 3): Express/Hono on localhost:4098, accepts Claude Code
  hook POSTs, normalizes through the same pipeline. Lower latency than file watching.
- **Codex adapter**: Parse Codex CLI transcripts into CanonicalEvent.
- **OpenCode adapter**: Parse OpenCode session files.

Each adapter implements the same normalizer interface and pushes into the shared buffer.

## File Map

```
src/capture/
  session-discovery.ts     — Find active Claude Code sessions
  transcript-watcher.ts    — FileSystemWatcher on JSONL file
  incremental-parser.ts    — Chunk → parsed JSON objects
  normalizer.ts            — Raw transcript entry → CanonicalEvent
  event-buffer.ts          — Ring buffer with subscriptions
  ipc-bridge.ts            — Main↔renderer IPC
  session-manager.ts       — Orchestrator: discover → watch → parse → normalize → buffer
```

---

## Structured Log Event Catalog

All `StructuredLogger` entries follow the `<subsystem>.<component>.<action>` naming
convention. Redaction is applied automatically to any context key matching the pattern
`/(?:^|[_-])(text|prompt|content)(?:$|[_-])/i`.

### `app` — Electron application lifecycle

| Event | Level | Context keys | Description |
|-------|-------|--------------|-------------|
| `app.ready` | info | — | `app.whenReady()` resolved and the main window was created. |
| `app.window_closed` | info | — | The main `BrowserWindow` emitted `closed`. |
| `app.window_create_failed_on_ready` | error | `error` | Window construction threw; app will quit. |
| `app.when_ready_failed` | error | `error` | `app.whenReady()` itself rejected; app will quit. |
| `app.activate_window_recreated` | info | — | App re-activated with no open windows; new window created. |
| `app.activate_window_create_failed` | error | `error` | Window creation during `activate` threw. |

### `ipc` — IPC / snapshot I/O (`session-io.ts`)

| Event | Level | Context keys | Description |
|-------|-------|--------------|-------------|
| `ipc.snapshot.fixture_built` | info | `eventCount` | Built the built-in fixture snapshot for bootstrap. |
| `ipc.snapshot.created` | info | `sourceKind`, `eventCount` | `createSnapshot()` finished — payload ready to send. |
| `ipc.snapshot.load_started` | info | `fileName`, `detectedFormat` | File read started; primary format detected. |
| `ipc.snapshot.loaded` | info | `fileName`, `format`, `eventCount` | File successfully parsed into a snapshot. |
| `ipc.snapshot.load_failed` | error | `fileName`, `primaryFormat`, `primaryError`, `secondaryFormat`, `secondaryAttempted`, `secondaryError` | Both parsers failed or produced zero events. |
| `ipc.snapshot.format_fallback_used` | info | `fileName`, `fallbackFormat` | Primary parser yielded zero events; fell back to secondary. |
| `ipc.export.cancelled` | info | — | User dismissed the save dialog. |
| `ipc.export.saved` | info | `fileName`, `eventCount` | Replay JSONL successfully written to disk. |
| `ipc.export.failed` | error | `error` | File write or dialog threw during export. |
| `bootstrap_requested` | info | — | Renderer requested the bootstrap snapshot via IPC. |
| `open_replay_cancelled` | info | — | User cancelled the open-file dialog. |
| `open_replay_selected` | info | `fileName` | User picked a file; loading snapshot. |
| `open_replay_failed` | error | `fileName`, `error` | Loading the selected file threw. |
| `export_replay_failed` | error | `suggestedFileName`, `error` | Export IPC handler caught an exception. |

### `persistence` — FileReplayStore (`file-replay-store.ts`)

| Event | Level | Context keys | Description |
|-------|-------|--------------|-------------|
| `persistence.replay.saved` | info | `sessionId`, `eventCount` | Session events and record written to disk. |
| `persistence.replay.appended` | debug | `sessionId`, `kind`, `totalEvents` | Single event appended; triggers a full save. |
| `persistence.replay.load_started` | debug | `sessionId` | `loadSession()` entered. |
| `persistence.replay.loaded` | info | `sessionId`, `eventCount` | Session fully loaded from disk. |
| `persistence.replay.load_failed` | error | `sessionId`, `error` | Reading or parsing threw. |
| `persistence.store.list_started` | debug | `rootDir` | `listSessions()` began scanning. |
| `persistence.store.listed` | info | `sessionCount` | Session listing completed. |

### `capture` — Transcript watcher / capture pipeline

| Event | Level | Context keys | Description |
|-------|-------|--------------|-------------|
| `capture.watcher.started` | info | `watchPath` | File watcher attached to transcript directory. |
| `capture.watcher.rotated` | info | `watchPath`, `newPath` | Transcript file rotated; watcher re-attached. |
| `capture.watcher.error` | error | `watchPath`, `error` | Watcher emitted an error. |
| `capture.parser.line_skipped` | debug | `reason` | Malformed or non-JSON line skipped. |
| `capture.session.started` | info | `sessionId` | New session ID observed in stream. |
| `capture.session.ended` | info | `sessionId`, `eventCount` | `session_ended` marker detected; session flushed. |

### `inference` — Inference orchestrator / MCP server

| Event | Level | Context keys | Description |
|-------|-------|--------------|-------------|
| `inference.triggered` | info | `sessionId`, `phase`, `riskSignalCount` | Inference trigger fired. |
| `inference.request.built` | debug | `sessionId`, `toolCount` | Request payload assembled. |
| `inference.result.received` | info | `sessionId`, `model`, `latencyMs` | Provider returned a result. |
| `inference.result.failed` | error | `sessionId`, `error` | Provider call threw or returned an error. |
| `inference.mcp.tool_called` | info | `toolName`, `sessionId` | MCP server received a tool invocation. |

### Grep cheatsheet

```bash
# All persistence failures
grep '"persistence.replay.load_failed"' shadow-agent.log

# IPC snapshot load flow for a specific file
grep '"ipc.snapshot' shadow-agent.log | grep '"myreplay.jsonl"'

# All error-level events
grep '"level":"error"' shadow-agent.log

# Inference timing
grep '"inference.result.received"' shadow-agent.log
```

