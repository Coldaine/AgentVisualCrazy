# MCP Shared Server Polling Integration - Design Spec

**Date:** 2026-03-14
**Status:** Draft
**Branch:** feature/memory-leak
**Depends on:** Process Lifecycle spec (same branch)

## Problem Statement

The MCP `sidecar_start` handler's shared server path creates sessions on the shared OpenCode server and sends prompts via `sendPromptAsync`, but lacks the polling/finalization loop that the per-process spawn path provides. Sessions start but never reach `complete` status because nobody polls for results, writes conversation data, or finalizes metadata.

## Design

Reuse `runHeadless()` from the shared server MCP path. `runHeadless()` already handles 20+ edge cases: fold detection, stable polls, timeout, abort, conversation JSONL writing, progress tracking, and session finalization. Rather than reimplementing this logic, we modify `runHeadless()` to accept an existing client/server and call it as a background async task from the MCP handler.

### Scope

- **Shared server path:** headless MCP sessions only (`noUi: true`)
- **Per-process spawn path:** interactive sessions (already clean via Electron close handler + IdleWatchdog) and headless when shared server disabled
- Interactive mode does not leak because `server.close()` fires on Electron close, and the 60-min IdleWatchdog provides a safety net

### Changes to `runHeadless()` (`src/headless.js`)

Three guard points where we check for an externally-provided client/server:

**1. Server startup (lines ~106-125):**
If `options.client` and `options.server` are provided, skip `startServer()` and `waitForServer()`. The shared server is already running and healthy.

```javascript
const externalServer = !!(options.client && options.server);
let client, server;

if (externalServer) {
  client = options.client;
  server = options.server;
  // Skip waitForServer() health check - shared server is already healthy
} else {
  // existing startServer() + waitForServer() logic unchanged
}
```

**2. Server shutdown (3 locations):**
If using an external server, skip ALL `server.close()` calls. The `SharedServerManager` manages the shared server's lifecycle.

Locations to guard (all `server.close()` calls in `runHeadless()`):
- Health check failure (~line 139): `if (!externalServer) { server.close(); }`
- Watchdog `onTimeout` callback (~line 154): must NOT call `server.close()` or `process.exit(0)` when running on shared server (see guard point 3)
- Normal exit path (~line 467): `if (!externalServer) { server.close(); }`
- Catch block (~line 520): `if (!externalServer) { server.close(); }`

**3. Watchdog (lines ~147-156):**
If `options.watchdog` is provided, use it instead of creating a new one. The MCP handler already created a per-session watchdog via `SharedServerManager.addSession()`.

**Critical:** The default watchdog's `onTimeout` calls `server.close()` and `process.exit(0)`. When running inside the MCP server process (shared server path), `process.exit(0)` would kill the entire MCP server. For the external server path, the watchdog must NOT call `process.exit()`. Instead, it should finalize the session metadata and let the `SharedServerManager` handle session eviction.

```javascript
let watchdog;
if (options.watchdog) {
  watchdog = options.watchdog;
  // External watchdog's onTimeout is managed by SharedServerManager.addSession()
  // It calls removeSession() which cancels the watchdog - no process.exit() needed
} else {
  watchdog = new IdleWatchdog({
    mode: 'headless',
    onTimeout: () => {
      server.close();    // OK for standalone mode
      process.exit(0);   // OK for standalone mode
    },
  }).start();
}
```

**4. Session ID (new guard point):**
If `options.sessionId` is provided, skip `createSession(client)` and use the existing session. The MCP handler creates the session before calling `runHeadless()` to avoid orphaned sessions.

```javascript
let sessionId;
if (options.sessionId) {
  sessionId = options.sessionId;
} else {
  sessionId = await createSession(client);
}
```

**Metadata ownership:** When `externalServer` is true, the MCP handler owns metadata setup (directory creation, initial metadata write). `runHeadless()` skips its own directory creation and initial metadata write when `externalServer` is true, but still writes progress, conversation JSONL, and finalization as usual.

Everything else stays the same: prompt sending, polling, progress tracking, conversation JSONL writing, fold detection, finalization.

### Changes to MCP handler (`src/mcp-server.js`)

Replace the current shared server path (which calls `sendPromptAsync` directly) with a fire-and-forget `runHeadless()` call:

```javascript
if (sharedServer.enabled && input.noUi) {
  const { server, client } = await sharedServer.ensureServer();
  const { createSession } = require('./opencode-client');
  const { buildPrompts } = require('./prompt-builder');

  // Create session on shared server
  const sessionId = await createSession(client);

  // Write initial metadata (MCP handler owns this, not runHeadless)
  fs.mkdirSync(sessionDir, { recursive: true, mode: 0o700 });
  const metaPath = path.join(sessionDir, 'metadata.json');
  fs.writeFileSync(metaPath, JSON.stringify({
    taskId, status: 'running', pid: process.pid,
    opencodeSessionId: sessionId,
    goPid: server.goPid || null,
    createdAt: new Date().toISOString(),
    headless: true, model: input.model,
  }, null, 2), { mode: 0o600 });

  // Build context from parent conversation (unless --no-context)
  let context = null;
  if (input.includeContext !== false) {
    const { buildContext } = require('./sidecar/context-builder');
    context = await buildContext({
      project: cwd,
      parentSession: input.parentSession,
      coworkProcess: input.coworkProcess,
      contextTurns: input.contextTurns,
      contextSince: input.contextSince,
      contextMaxTokens: input.contextMaxTokens,
    });
  }

  // Build prompts with context (same as CLI path)
  const { system: systemPrompt, userMessage } = buildPrompts(
    input.prompt, context, cwd, true, agent, input.summaryLength
  );

  // Register session with idle eviction
  sharedServer.addSession(sessionId, (_evictedId) => {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      meta.status = 'idle-timeout';
      meta.completedAt = new Date().toISOString();
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), { mode: 0o600 });
    } catch (err) {
      logger.warn('Failed to update evicted session metadata', { error: err.message });
    }
  });
  const watchdog = sharedServer.getSessionWatchdog(sessionId);

  // Fire-and-forget: runHeadless with shared server's client
  runHeadless(input.model, systemPrompt, userMessage, taskId, cwd,
    timeoutMs, agent, {
      client, server, watchdog, sessionId,
      mcp: mcpServers,
    }
  ).then((result) => {
    // Session complete - finalize metadata and remove from tracking
    const { finalizeSession } = require('./sidecar/session-utils');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    finalizeSession(sessionDir, result.summary || '', cwd, meta);
    sharedServer.removeSession(sessionId);
  }).catch(err => {
    logger.error('Shared server session failed', { taskId, error: err.message });
    sharedServer.removeSession(sessionId);
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      meta.status = 'error';
      meta.reason = err.message;
      meta.completedAt = new Date().toISOString();
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), { mode: 0o600 });
    } catch (writeErr) {
      logger.warn('Failed to write error metadata', { error: writeErr.message });
    }
  });

  // Return immediately
  return { content: [{ type: 'text', text: body }] };
} else {
  // Per-process spawn (interactive, or shared server disabled)
  // existing spawnSidecarProcess logic unchanged
}
```

Key points:
- Session is created by MCP handler, passed to `runHeadless()` via `options.sessionId`
- `runHeadless()` is called WITHOUT `await` (fire-and-forget)
- `.then()` removes the session from `SharedServerManager` tracking on completion
- `.catch()` handles errors by removing session and marking metadata as error
- Metadata write errors are logged (not silently swallowed)
- The handler returns immediately so the MCP caller gets a response
- `runHeadless()` runs in the background, writing progress/conversation/metadata to disk
- `sidecar_status` reads those files as usual (no changes needed)
- Prompts are built via `buildPrompts()` from `prompt-builder.js` (same as CLI path)

### Context and prompt construction

The MCP handler builds context and prompts before calling `runHeadless()`, matching the CLI path in `src/sidecar/start.js`:

```javascript
// 1. Build context from parent conversation (unless --no-context)
const { buildContext } = require('./sidecar/context-builder');
const context = (input.includeContext !== false)
  ? await buildContext({ project: cwd, parentSession: input.parentSession, ... })
  : null;

// 2. Build prompts with context
const { buildPrompts } = require('./prompt-builder');
const { system: systemPrompt, userMessage } = buildPrompts(
  input.prompt, context, cwd, true /* headless */, agent, input.summaryLength
);
```

Without context building, the sidecar would have no parent conversation history and couldn't respond to references like "that bug we discussed."

### Session finalization

When `runHeadless()` completes, the MCP handler's `.then()` block must call `finalizeSession()` to:
- Set `status: 'complete'` in metadata
- Write `completedAt` timestamp
- Save `summary.md` to the session directory

Without this, `sidecar_status` would show "running" indefinitely and `sidecar_read` would fail. The standalone CLI path handles finalization in `startSidecar()` (`src/sidecar/start.js`); the MCP handler must do the same.

### Files to modify

| File | Change |
|------|--------|
| `src/headless.js` | Add 4 guard points: external client/server, shutdown, watchdog, sessionId |
| `src/mcp-server.js` | Replace shared server path with fire-and-forget `runHeadless()` |

No new files.

### E2E test

The existing `tests/shared-server-e2e.integration.test.js` already tests the right flow: fire 3 concurrent Gemini sessions, poll until done, read results. With `runHeadless()` handling the full lifecycle, sessions should now complete.

### Success criteria

1. E2E test passes: 3 concurrent Gemini sessions via MCP all reach `complete` status
2. `sidecar_status` shows progress (messages > 0) during execution
3. `sidecar_read` returns LLM output after completion
4. Process count stays low (shared server, not N separate servers)
5. Memory stays bounded (RSS < 512MB for 3 sessions)
6. All unit tests pass
