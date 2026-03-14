# MCP Shared Server Polling Integration - Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the MCP shared server path to use `runHeadless()` for full session lifecycle (polling, progress, finalization) instead of raw `sendPromptAsync`.

**Architecture:** Add guard points in `runHeadless()` for external client/server/watchdog/sessionId. Rewrite MCP handler's shared server path to fire-and-forget `runHeadless()` with context building and `finalizeSession()` on completion. Only applies to headless MCP sessions.

**Tech Stack:** Node.js (CJS), OpenCode SDK, Jest

**Spec:** `docs/superpowers/specs/2026-03-14-mcp-polling-integration-design.md`

---

## File Structure

### Modified Files

| File | Change |
|------|--------|
| `src/headless.js` | Add 4 guard points: externalServer skip for startup/shutdown, watchdog passthrough, sessionId passthrough |
| `src/mcp-server.js` | Replace shared server `sendPromptAsync` with fire-and-forget `runHeadless()`, add context building and `finalizeSession()` |

No new files.

---

## Chunk 1: All Tasks

### Task 1: Add external server guard points to `runHeadless()`

**Files:**
- Modify: `src/headless.js`
- Create: `tests/headless-external-server.test.js`

- [ ] **Step 1: Write failing source-check tests**

```javascript
// tests/headless-external-server.test.js
'use strict';

const fs = require('fs');
const path = require('path');

describe('headless external server support', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../src/headless.js'), 'utf-8'
  );

  test('checks for externalServer flag', () => {
    expect(src).toContain('externalServer');
  });

  test('skips server.close() when externalServer is true', () => {
    expect(src).toContain('!externalServer');
  });

  test('accepts options.sessionId', () => {
    expect(src).toContain('options.sessionId');
  });

  test('accepts options.watchdog', () => {
    expect(src).toContain('options.watchdog');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/headless-external-server.test.js`
Expected: FAIL (src doesn't contain externalServer yet)

- [ ] **Step 3: Add guard point 1 - Server startup**

In `src/headless.js`, read the file first. At line ~104, replace the server startup block:

```javascript
// Before the existing: let client, server;
const externalServer = !!(options.client && options.server);
let client, server;

if (externalServer) {
  client = options.client;
  server = options.server;
  logger.debug('Using external server (shared server mode)', { url: server.url });
} else {
  try {
    const serverOptions = { port };
    if (options.mcp) { serverOptions.mcp = options.mcp; }
    const result = await startServer(serverOptions);
    client = result.client;
    server = result.server;
    logger.debug('Server started', { url: server.url });
  } catch (error) {
    // ... existing error handling unchanged ...
  }
}
```

- [ ] **Step 4: Skip waitForServer when external**

After the server startup guard, wrap the `waitForServer()` block (lines ~132-147):

```javascript
if (!externalServer) {
  logger.debug('Waiting for OpenCode server to be ready');
  const serverReady = await waitForServer(client, checkHealth);
  logger.debug('Server ready', { serverReady });
  writeProgress(sessionDir, 'server_ready');

  if (!serverReady) {
    server.close();
    return {
      summary: '', completed: false, timedOut: false, taskId,
      error: 'OpenCode server failed to start'
    };
  }
} else {
  writeProgress(sessionDir, 'server_ready');
}
```

- [ ] **Step 5: Add guard point 3 - Watchdog passthrough**

Replace the watchdog creation (lines ~149-157):

```javascript
if (options.watchdog) {
  watchdog = options.watchdog;
} else {
  watchdog = new IdleWatchdog({
    mode: 'headless',
    onTimeout: () => {
      logger.info('Headless idle timeout - shutting down', { taskId });
      server.close();
      process.exit(0);
    },
  }).start();
}
```

- [ ] **Step 6: Add guard point 4 - Session ID passthrough**

Find the `createSession(client)` call (line ~161-172). Replace the entire try/catch:

```javascript
if (options.sessionId) {
  sessionId = options.sessionId;
  logger.debug('Using existing session', { sessionId });
} else {
  try {
    sessionId = await createSession(client);
  } catch (error) {
    if (!externalServer) { server.close(); }
    return {
      summary: '', completed: false, timedOut: false, taskId,
      error: error.message
    };
  }
}
```

This guards the `server.close()` at line 164 (createSession catch). While unreachable when `options.sessionId` is set, it's defensive against future changes.

- [ ] **Step 7: Add guard point 2 - Server shutdown guards**

Find ALL `server.close()` calls and wrap with `if (!externalServer)`:

Location 1 - Normal exit (~line 467):
```javascript
watchdog.cancel();
if (!externalServer) { server.close(); }
```

Location 2 - Catch block (~line 520):
```javascript
if (watchdog) { watchdog.cancel(); }
if (!externalServer) { server.close(); }
```

All 5 `server.close()` locations are now guarded:
1. Health check failure - handled in Step 4 (inside `!externalServer` block)
2. Watchdog `onTimeout` - handled in Step 5 (only standalone watchdog calls it)
3. createSession catch - handled in Step 6 (guarded with `!externalServer`)
4. Normal exit - handled here (line ~467)
5. Catch block - handled here (line ~520)

Note: The `mcp` option is passed as `undefined` to `runHeadless()` in the MCP handler because the shared server is already configured with MCP servers at startup via `ensureServer()`. The per-process spawn path passes MCP config because each process starts its own server.

- [ ] **Step 8: Run tests to verify pass**

Run: `npm test tests/headless-external-server.test.js`
Expected: PASS (4 tests)

- [ ] **Step 9: Run full headless test suite**

Run: `npm test tests/headless.test.js`
Expected: PASS (all existing tests unaffected - they don't pass options.client)

- [ ] **Step 10: Commit**

```bash
git add src/headless.js tests/headless-external-server.test.js
git commit -m "feat: add external server guard points to runHeadless for shared server support"
```

---

### Task 2: Rewrite MCP shared server path to use `runHeadless()`

**Files:**
- Modify: `src/mcp-server.js` (lines ~104-164)

- [ ] **Step 1: Write failing source-check test**

Add to `tests/mcp-shared-server.test.js`:

```javascript
describe('MCP shared server uses runHeadless', () => {
  test('imports runHeadless', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/mcp-server.js'), 'utf-8'
    );
    expect(src).toContain('runHeadless');
    expect(src).toContain('buildContext');
    expect(src).toContain('finalizeSession');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/mcp-shared-server.test.js`
Expected: FAIL (mcp-server.js doesn't contain runHeadless yet)

- [ ] **Step 3: Rewrite the shared server path**

In `src/mcp-server.js`, read the file. Replace the entire `if (sharedServer.enabled)` block (lines ~104-164) with:

```javascript
if (sharedServer.enabled && input.noUi) {
  // Shared server path: headless only, delegates to runHeadless()
  try {
    const { server, client } = await sharedServer.ensureServer();
    const { createSession } = require('./opencode-client');
    const { buildContext } = require('./sidecar/context-builder');
    const { buildPrompts } = require('./prompt-builder');
    const { runHeadless } = require('./headless');
    const { finalizeSession } = require('./sidecar/session-utils');

    const sessionId = await createSession(client);

    // Write initial metadata (MCP handler owns this, runHeadless skips it)
    fs.mkdirSync(sessionDir, { recursive: true, mode: 0o700 });
    const metaPath = path.join(sessionDir, 'metadata.json');
    const serverPort = server.url ? new URL(server.url).port : null;
    fs.writeFileSync(metaPath, JSON.stringify({
      taskId, status: 'running', pid: process.pid,
      opencodeSessionId: sessionId,
      opencodePort: serverPort,
      goPid: server.goPid || null,
      createdAt: new Date().toISOString(),
      headless: true, model: input.model,
    }, null, 2), { mode: 0o600 });

    // Build context from parent conversation (unless --no-context)
    let context = null;
    if (input.includeContext !== false) {
      try {
        context = buildContext(cwd, input.parentSession, {
          contextTurns: input.contextTurns,
          contextSince: input.contextSince,
          contextMaxTokens: input.contextMaxTokens,
          coworkProcess: input.coworkProcess,
        });
      } catch (ctxErr) {
        logger.warn('Failed to build context, proceeding without', { error: ctxErr.message });
      }
    }

    // Build prompts (same as CLI path in start.js)
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

    const timeoutMs = (input.timeout || 15) * 60 * 1000;

    // Fire-and-forget: runHeadless with shared server's client
    runHeadless(input.model, systemPrompt, userMessage, taskId, cwd,
      timeoutMs, agent, {
        client, server, watchdog, sessionId,
        mcp: undefined, // shared server already has MCP config
      }
    ).then((result) => {
      // Session complete - finalize and remove from tracking
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        finalizeSession(sessionDir, result.summary || '', cwd, meta);
      } catch (finErr) {
        logger.warn('Failed to finalize session', { error: finErr.message });
      }
      sharedServer.removeSession(sessionId);
    }).catch((err) => {
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
    const body = JSON.stringify({
      taskId, status: 'running', mode: 'headless',
      message: 'Sidecar started in headless mode. Use sidecar_status to check progress.',
    });
    return { content: [{ type: 'text', text: body }, { type: 'text', text: HEADLESS_START_REMINDER }] };
  } catch (err) {
    logger.warn('Shared server path failed, falling back to spawn', { error: err.message });
    // Fall through to spawn path below
  }
}
```

IMPORTANT: Keep the existing per-process spawn path (the `else` / fallthrough after this block) unchanged.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test tests/mcp-shared-server.test.js`
Expected: PASS

- [ ] **Step 5: Run existing MCP tests**

Run: `npm test tests/mcp-server.test.js`
Expected: PASS (existing tests use the per-process spawn path)

- [ ] **Step 6: Commit**

```bash
git add src/mcp-server.js tests/mcp-shared-server.test.js
git commit -m "feat: MCP shared server path delegates to runHeadless with context and finalization"
```

---

### Task 3: Run full test suite and verify

- [ ] **Step 1: Run full unit test suite**

Run: `npm test`
Expected: All suites pass

- [ ] **Step 2: Run linter**

Run: `npm run lint`
Expected: No new errors (pre-existing cli-handlers.js errors are OK)

- [ ] **Step 3: Commit any cleanup**

```bash
git add src/headless.js src/mcp-server.js
git commit -m "chore: cleanup after MCP polling integration"
```

---

### Task 4: Run E2E integration test

- [ ] **Step 1: Run the shared server e2e test**

Run: `npm run test:integration -- --testPathPattern="shared-server-e2e"`
Expected: Sessions reach `complete` status, `sidecar_read` returns output, memory bounded

- [ ] **Step 2: If e2e fails, debug and fix**

Check stderr output for error details. Common issues:
- `buildContext` may throw if no parent session exists (should be caught by try/catch)
- `finalizeSession` may need the metadata object in a specific format
- `buildPrompts` signature may differ from start.js (check parameter order)

- [ ] **Step 3: Commit any e2e fixes**

```bash
git add src/headless.js src/mcp-server.js
git commit -m "fix: resolve e2e test issues in shared server polling integration"
```
