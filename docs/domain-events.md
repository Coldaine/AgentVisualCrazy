# Domain: Event Capture

> **Status: Implementation Reference** — This document describes the full capture
> pipeline targeted by PR #27. Current main has `src/shared/transcript-adapter.ts` and
> `src/persistence/file-replay-store.ts` only. The `src/capture/` directory is on the
> feature branch.

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
