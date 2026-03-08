# Headless MCP Reliability Design

**Date**: 2026-03-08
**Status**: Approved

## Problem

Headless sidecar requests via MCP report `status: "running"` indefinitely. The calling agent has no way to determine whether the sidecar is making progress, stalled, or crashed. Root causes:

1. **PID overwrite bug**: MCP handler saves PID in metadata, then `createSessionMetadata()` overwrites it without preserving PID
2. **No crash detection**: `sidecar_status` reads metadata as-is; if the spawned process died, status stays "running" forever
3. **Stderr swallowed**: Spawned process uses `stdio: ['ignore', 'ignore', 'ignore']`, zero visibility into failures
4. **Minimal status info**: Status response only includes status string and elapsed time, not enough for agents to make decisions

## Design

### 1. Rich Status Response

**Current response** (~30 tokens):
```json
{ "taskId": "abc", "status": "running", "model": "gemini", "elapsed": "5m 30s", "briefing": "..." }
```

**New response** (~40 tokens, normal case):
```json
{
  "taskId": "abc",
  "status": "running",
  "elapsed": "5m 30s",
  "messages": 7,
  "lastActivity": "12s ago",
  "latest": "Using Read src/auth/token.ts"
}
```

**Error case** (adds ~15 tokens):
```json
{
  "taskId": "abc",
  "status": "crashed",
  "elapsed": "2m 15s",
  "messages": 0,
  "lastActivity": "never",
  "reason": "Process exited before producing output. Check debug.log in session dir."
}
```

**`latest` field derivation** (truncated to ~80 chars):
- Last entry is `tool_use` -> `"Using <toolName>"` (e.g., "Using Read", "Using Bash")
- Last entry is assistant text -> First line, truncated
- No conversation yet -> `"Starting up..."`
- Only included when `status === "running"`

**PID liveness check** (server-side, not exposed in response):
```javascript
if (status === "running" && pid) {
  try { process.kill(pid, 0); }
  catch { /* dead */ -> set status to "crashed", write to disk }
}
```

### 2. PID Preservation

Fix `createSessionMetadata()` in `sidecar/start.js`: before writing metadata, check if it already exists and preserve `pid` from the existing file.

### 3. Stderr Capture

Change `spawnSidecarProcess()` in `mcp-server.js`:
```javascript
// Before: stdio: ['ignore', 'ignore', 'ignore']
// After:  stdio: ['ignore', 'ignore', fs.openSync(debugLogPath, 'w')]
```

Debug log path: `<sessionDir>/debug.log`. Only read on error states, not every poll.

### 4. Exit Handler

Add uncaught exception/unhandled rejection handler in `bin/sidecar.js` that writes `status: "error"` and `reason` to metadata.json before exiting. Only active when `--task-id` is passed (MCP-spawned processes).

### 5. Enhanced Heartbeat (CLI Path)

Enrich `createHeartbeat()` in `sidecar/session-utils.js` to include progress:
```
[sidecar] 2m30s | 7 messages | Using Read src/auth/token.ts
[sidecar] 2m45s | 8 messages | Analyzing the authentication flow...
[sidecar] 3m00s | 8 messages | idle 15s
[sidecar] 0m15s | Starting up...
```

Accepts `sessionDir` parameter to read `conversation.jsonl`.

### 6. Shared Progress Reader

New module: `src/sidecar/progress.js`

Shared logic used by both `sidecar_status` handler and `createHeartbeat()`:
- Read `conversation.jsonl` line count
- Extract last entry type and content
- Get file mtime for `lastActivity`
- Format `latest` string

## New Status Values

| Status | Meaning |
|--------|---------|
| `running` | Process alive, work in progress |
| `complete` | Finished successfully |
| `aborted` | User/agent requested abort |
| `crashed` | Process died (detected by PID liveness check) |
| `error` | Process caught uncaught exception (exit handler) |

## Files Changed

| File | Change |
|------|--------|
| `src/mcp-server.js` | Rich status handler, stderr redirect to debug.log |
| `src/sidecar/start.js` | PID preservation in createSessionMetadata |
| `src/sidecar/session-utils.js` | Enhanced heartbeat with progress |
| `src/sidecar/progress.js` | **New**: shared progress reader |
| `bin/sidecar.js` | Exit handler for crash recovery |
| `tests/mcp-headless-lifecycle.test.js` | **New**: 8 integration test cases |

## Integration Test Cases

1. **Happy path**: start(noUi: true) -> poll status -> complete -> read summary
2. **Progress reporting**: status returns growing messages count, recent lastActivity, latest tool/text
3. **Process crash detection**: dead PID -> status returns "crashed" with reason
4. **Timeout**: headless timeout -> metadata updated with timedOut
5. **Abort**: start -> abort -> status returns "aborted"
6. **PID preservation**: MCP handler PID survives createSessionMetadata overwrite
7. **Debug log capture**: spawned process stderr -> debug.log exists with content
8. **No conversation yet**: immediate status -> messages: 0, latest: "Starting up..."
