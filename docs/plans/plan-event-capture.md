# Event Capture & Live Integration Plan

> Recommended order across all plans: **GUI Rendering → Event Capture → Inference Engine**
>
> Event capture is second because the renderer needs to exist first (to display live events),
> but can be developed in parallel once the canvas shell is up. The inference engine depends
> on live events flowing through this system.

---

## Scope

Build the live event capture pipeline that watches Claude Code's JSONL transcript files, parses new events incrementally, normalizes them into `CanonicalEvent` objects, and streams them to the renderer via Electron IPC. This replaces the current fixture-only data flow.

Architecture reference: `docs/research/shadow-inference-architecture.md` (architecture diagram), `docs/research/visual-patterns-sidecar.md` §5 (session management), `docs/research/visual-patterns-agent-flow.md` §5 (event pipeline).

---

## 1. File Map

All new files live under `shadow-agent/src/capture/`:

| File | Purpose |
|------|---------|
| `src/capture/session-discovery.ts` | Find active Claude Code sessions by scanning transcript directories |
| `src/capture/transcript-watcher.ts` | FileSystemWatcher on a single JSONL file, emits new lines |
| `src/capture/incremental-parser.ts` | Parse new JSONL lines into raw objects, handle partial lines |
| `src/capture/normalizer.ts` | Transform raw Claude Code transcript entries → `CanonicalEvent` |
| `src/capture/event-buffer.ts` | In-memory ring buffer of recent events, supports subscriptions |
| `src/capture/ipc-bridge.ts` | Bridge between main-process event buffer and renderer via IPC |
| `src/capture/session-manager.ts` | Orchestrator: discover → watch → parse → normalize → buffer → IPC |

---

## 2. Session Discovery

Claude Code writes transcripts to a well-known directory:
- macOS/Linux: `~/.claude/projects/<project-hash>/`
- Windows: `%USERPROFILE%\.claude\projects\<project-hash>\`

Within each project directory, session files are named with timestamps or session IDs (`.jsonl` extension).

`session-discovery.ts` scans these directories:

1. Walk `~/.claude/projects/` for subdirectories
2. In each subdirectory, find `.jsonl` files
3. Sort by modification time (most recent first)
4. Return the most recently modified file as the "active session"
5. Optionally accept a user-specified path (from setup wizard or CLI arg)

Auto-discovery runs on app startup and periodically (every 30 seconds) to detect new sessions.

---

## 3. FileSystemWatcher (Transcript Watcher)

Create `transcript-watcher.ts` using Node.js `fs.watch` (or `chokidar` if cross-platform reliability is needed).

Behavior:
- Watch a single JSONL file for changes
- On change: read new bytes from the last known file offset
- Track file position with a byte offset (not line count — handles partial writes)
- Emit raw string chunks to the incremental parser
- Handle file truncation (offset > file size → reset to 0)
- Handle file rotation (file replaced → close old watcher, open new one)

The watcher must be efficient — Claude Code can write rapidly during tool-heavy phases. Debounce file change events to 100ms to batch reads.

---

## 4. Incremental JSONL Parser

`incremental-parser.ts` receives raw string chunks and produces parsed JSON objects.

The key challenge: chunks may contain partial lines. The parser maintains a line buffer:

1. Append new chunk to the buffer
2. Split on newlines
3. The last segment (if not terminated by newline) stays in the buffer as a partial line
4. All complete lines are JSON-parsed individually
5. If a line fails JSON.parse, log a warning and skip it (Claude Code may write incomplete lines during a crash)

Output: array of raw transcript entry objects (not yet `CanonicalEvent`).

---

## 5. Event Normalizer

`normalizer.ts` transforms raw Claude Code transcript entries into `CanonicalEvent` objects matching the schema in `schema.ts`.

The existing `transcript-adapter.ts` in `src/shared/` already handles bulk transcript parsing. The normalizer reuses that logic but operates on individual entries rather than full files.

Mapping (from Claude Code JSONL structure):

| Claude Code field | CanonicalEvent field |
|-------------------|---------------------|
| Entry type `user` / `assistant` | `kind: 'message'`, `actor: 'user'` / `actor: 'assistant'` |
| Tool use block | `kind: 'tool_started'`, `payload: { toolName, args }` |
| Tool result block | `kind: 'tool_completed'` or `kind: 'tool_failed'` |
| Subagent spawn indicators | `kind: 'subagent_dispatched'` |
| Session start markers | `kind: 'session_started'` |

Each normalized event gets:
- `id`: Generated UUID
- `sessionId`: From the session discovery metadata
- `source`: `'claude-transcript'`
- `timestamp`: From the transcript entry, or file modification time as fallback

---

## 6. Event Buffer

`event-buffer.ts` is an in-memory ring buffer holding the last N events (default: 2000).

Features:
- `push(event)` — add new event, evict oldest if at capacity
- `getRecent(n)` — return last N events
- `getAll()` — return all events in order
- `subscribe(callback)` — register a listener called on every new event
- `getSince(eventId)` — return all events after a given ID (for catch-up)

The buffer is the central data structure that both the renderer and the inference engine consume from. It lives in the Electron main process.

---

## 7. IPC Bridge

`ipc-bridge.ts` connects the main-process event buffer to the renderer process.

Two IPC patterns:

**Push (main → renderer):** When new events arrive, batch them into a debounced update (100–250ms). Send via `webContents.send('shadow:events', batchedEvents)`. The renderer listens and merges into its local state.

**Pull (renderer → main):** On renderer startup or reconnect, request the full current state:
- `ipcMain.handle('shadow:snapshot')` — returns current `SnapshotPayload` built from the event buffer
- `ipcMain.handle('shadow:events-since', eventId)` — returns events after a given ID for incremental catch-up

The bridge also forwards `DerivedState` updates. When new events arrive:
1. Push events to buffer
2. Re-run `deriveState()` on the full buffer (or incrementally — see optimization below)
3. Send updated `SnapshotPayload` to renderer

### Derive optimization

`deriveState()` currently processes the entire event array. For live use, implement incremental derivation: maintain a mutable `DerivedState` and update it with each new event rather than rebuilding from scratch. This is a performance optimization — start with full rebuild and optimize when needed.

---

## 8. Session Manager (Orchestrator)

`session-manager.ts` ties everything together:

1. On startup: run session discovery
2. If active session found: create transcript watcher + parser + normalizer pipeline
3. Pipe normalized events into the event buffer
4. Start IPC bridge to renderer
5. Periodically re-run session discovery to detect session changes
6. On new session detected: tear down old pipeline, start new one
7. On session end (no new writes for 5 minutes): emit `session_ended` event

The session manager is instantiated in `electron/main.ts` at app ready.

---

## 9. Session Recovery (Catch-Up After Restart)

When shadow-agent starts and an active session already has content:

1. Read the entire existing JSONL file (not just new lines)
2. Parse and normalize all entries as a batch
3. Push the full batch into the event buffer
4. Run `deriveState()` on the batch to build initial state
5. Send the initial snapshot to the renderer
6. Then switch to incremental watching (new lines only)

This handles the case where the user starts shadow-agent after Claude Code has already been working for a while.

---

## 10. Debouncing UI Updates

During heavy tool-calling phases, Claude Code can produce dozens of events per second. The renderer should not re-render on every single event.

Debouncing strategy:
- Event buffer push: immediate (no debounce — buffer is cheap)
- IPC send to renderer: debounced at 150ms (batch events into a single update)
- DerivedState rebuild: debounced at 250ms (more expensive)
- Canvas redraw: governed by requestAnimationFrame (max 60fps, natural throttle)

The debounce timers are configurable via a settings object for tuning.

---

## 11. Future: HTTP Hook Server (Phase 3)

Not implemented now, but planned:

Claude Code supports hooks that POST events to an HTTP endpoint. An HTTP hook server would give lower latency than file watching (events arrive as they happen, not when flushed to disk).

Placeholder design:
- Express or Hono server on localhost:4098
- Accepts POST with Claude Code hook payload
- Normalizes to `CanonicalEvent` via the same normalizer
- Pushes into the same event buffer

This can be added later without changing the rest of the architecture — the buffer and IPC bridge are transport-agnostic.

---

## 12. Integration with Electron Main

Changes to `electron/main.ts`:

1. Import `SessionManager` from `src/capture/session-manager.ts`
2. On app ready: instantiate session manager with config (transcript directory, buffer size)
3. Session manager starts discovery + watching automatically
4. Replace the current fixture-based `bootstrap()` handler with live-data flow
5. Keep fixture loading as a fallback (when no active session is found)
6. Register IPC handlers for `shadow:snapshot` and `shadow:events-since`

The current `openReplayFile()` and `exportReplayJsonl()` IPC handlers remain unchanged — replay and export still work alongside live capture.

---

## 13. Implementation Order (Within This Group)

1. Event buffer (`event-buffer.ts`) — standalone, testable data structure
2. Incremental JSONL parser (`incremental-parser.ts`) — standalone, testable with string chunks
3. Event normalizer (`normalizer.ts`) — refactor from existing `transcript-adapter.ts`
4. Session discovery (`session-discovery.ts`) — filesystem scanning, testable with mock directories
5. Transcript watcher (`transcript-watcher.ts`) — file watching, test with a temp JSONL file
6. IPC bridge (`ipc-bridge.ts`) — requires Electron context
7. Session manager orchestrator (`session-manager.ts`) — wires everything together
8. Session recovery logic (batch catch-up on startup)
9. Debounce tuning and performance testing
10. Wire into `electron/main.ts`

Steps 1–5 are independently testable Node.js modules with no Electron dependency. Step 6 introduces the Electron IPC layer. Steps 7–10 are integration work.

---

## Cross-Group Dependencies

- **From GUI Rendering plan**: The IPC bridge pushes `SnapshotPayload` and event batches to the renderer. The renderer must have at least a basic event feed panel and the canvas shell to display incoming events. Specifically, the `EventFeedPanel.tsx` and the IPC listener in the renderer's React code must exist. These are steps 8 (panel layout) in the GUI plan.
- **From Inference Engine plan**: The event buffer is the data source that the inference trigger monitors. The trigger engine (from the inference plan) subscribes to `event-buffer.subscribe()` to decide when to fire inference. The event buffer itself has no dependency on the inference engine — it just stores and emits events.
- **Shared code**: The normalizer reuses logic from `src/shared/transcript-adapter.ts`. Any changes to the Claude Code transcript format affect both the normalizer and the existing batch parser. Keep them in sync or refactor to share a single parsing function.
