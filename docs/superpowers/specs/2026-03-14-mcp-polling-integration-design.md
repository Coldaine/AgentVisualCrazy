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
} else {
  // existing startServer() logic unchanged
}
```

**2. Server shutdown (lines ~465, ~518):**
If using an external server, skip `server.close()`. The `SharedServerManager` manages the shared server's lifecycle.

```javascript
if (!externalServer) { server.close(); }
```

Apply this guard in BOTH cleanup paths (normal exit and catch block).

**3. Watchdog (lines ~147-156):**
If `options.watchdog` is provided, use it instead of creating a new one. The MCP handler already created a per-session watchdog via `SharedServerManager.addSession()`.

```javascript
let watchdog;
if (options.watchdog) {
  watchdog = options.watchdog;
} else {
  watchdog = new IdleWatchdog({ mode: 'headless', ... }).start();
}
```

Everything else stays the same: session creation, prompt sending, polling, progress tracking, conversation JSONL writing, fold detection, finalization.

### Changes to MCP handler (`src/mcp-server.js`)

Replace the current shared server path (which calls `sendPromptAsync` directly) with a fire-and-forget `runHeadless()` call:

```javascript
if (sharedServer.enabled && input.noUi) {
  const { server, client } = await sharedServer.ensureServer();

  // Write initial metadata
  fs.mkdirSync(sessionDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(metaPath, JSON.stringify({
    taskId, status: 'running', pid: process.pid,
    goPid: server.goPid || null,
    createdAt: new Date().toISOString(),
    headless: true, model: input.model,
  }, null, 2), { mode: 0o600 });

  // Register session with idle eviction
  sharedServer.addSession(sessionId, onEvictCallback);
  const watchdog = sharedServer.getSessionWatchdog(sessionId);

  // Fire-and-forget: runHeadless with shared server's client
  runHeadless(input.model, systemPrompt, userMessage, taskId, cwd,
    timeoutMs, agent, {
      client, server, watchdog,
      mcp: mcpServers,
    }
  ).catch(err => {
    logger.error('Shared server session failed', { taskId, error: err.message });
    // Mark session as error in metadata
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      meta.status = 'error';
      meta.reason = err.message;
      meta.completedAt = new Date().toISOString();
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), { mode: 0o600 });
    } catch { /* ignore metadata write errors */ }
  });

  // Return immediately
  return { content: [{ type: 'text', text: body }] };
} else {
  // Per-process spawn (interactive, or shared server disabled)
  // existing spawnSidecarProcess logic unchanged
}
```

Key points:
- `runHeadless()` is called WITHOUT `await` (fire-and-forget)
- `.catch()` handles unhandled rejections by marking session as error
- The handler returns immediately so the MCP caller gets a response
- `runHeadless()` runs in the background, writing progress/conversation/metadata to disk
- `sidecar_status` reads those files as usual (no changes needed)

### Prompt construction

`runHeadless()` accepts `systemPrompt` and `userMessage` as parameters. The MCP handler needs to construct these the same way the CLI path does. The existing MCP handler already has prompt construction logic for the per-process path (building CLI args). For the shared server path, we construct the prompts directly:

- `systemPrompt`: built via `buildPrompts()` from `prompt-builder.js` (same as CLI path)
- `userMessage`: the user's input prompt (from `input.prompt`)

### Files to modify

| File | Change |
|------|--------|
| `src/headless.js` | Add 3 guard points for external client/server/watchdog |
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
6. Unit tests pass (75/75 suites)
