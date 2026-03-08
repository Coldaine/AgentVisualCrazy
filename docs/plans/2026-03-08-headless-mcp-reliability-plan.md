# Headless MCP Reliability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make headless sidecar requests via MCP reliably report progress, detect crashes, and complete properly.

**Architecture:** Add a shared progress reader module that reads `conversation.jsonl` for live progress. Enhance `sidecar_status` to check PID liveness and auto-correct stale "running" states. Fix PID preservation bug, add stderr capture, and add crash recovery exit handler. Enrich CLI heartbeat with same progress info.

**Tech Stack:** Node.js (CJS), Jest, fs (sync operations for reading conversation.jsonl)

---

### Task 1: Create shared progress reader module

**Files:**
- Create: `src/sidecar/progress.js`
- Test: `tests/sidecar/progress.test.js`

**Step 1: Write the failing tests**

Create `tests/sidecar/progress.test.js`:

```javascript
/**
 * Progress Reader Tests
 *
 * Tests the shared progress reader that extracts status info
 * from conversation.jsonl for MCP status and CLI heartbeat.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { readProgress } = require('../../src/sidecar/progress');

describe('readProgress', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'progress-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns defaults when conversation.jsonl does not exist', () => {
    const result = readProgress(tmpDir);
    expect(result).toEqual({
      messages: 0,
      lastActivity: 'never',
      latest: 'Starting up...',
    });
  });

  test('returns defaults when conversation.jsonl is empty', () => {
    fs.writeFileSync(path.join(tmpDir, 'conversation.jsonl'), '');
    const result = readProgress(tmpDir);
    expect(result).toEqual({
      messages: 0,
      lastActivity: 'never',
      latest: 'Starting up...',
    });
  });

  test('counts assistant messages', () => {
    const lines = [
      JSON.stringify({ role: 'system', content: 'sys prompt', timestamp: '2026-03-08T10:00:00Z' }),
      JSON.stringify({ role: 'assistant', content: 'Hello', timestamp: '2026-03-08T10:00:01Z' }),
      JSON.stringify({ role: 'assistant', content: 'Working...', timestamp: '2026-03-08T10:00:02Z' }),
    ].join('\n') + '\n';
    fs.writeFileSync(path.join(tmpDir, 'conversation.jsonl'), lines);

    const result = readProgress(tmpDir);
    expect(result.messages).toBe(2);
  });

  test('extracts latest from assistant text', () => {
    const lines = [
      JSON.stringify({ role: 'assistant', content: 'Analyzing the authentication flow in detail', timestamp: '2026-03-08T10:00:01Z' }),
    ].join('\n') + '\n';
    fs.writeFileSync(path.join(tmpDir, 'conversation.jsonl'), lines);

    const result = readProgress(tmpDir);
    expect(result.latest).toBe('Analyzing the authentication flow in detail');
  });

  test('truncates latest to 80 chars', () => {
    const longText = 'A'.repeat(120);
    const lines = [
      JSON.stringify({ role: 'assistant', content: longText, timestamp: '2026-03-08T10:00:01Z' }),
    ].join('\n') + '\n';
    fs.writeFileSync(path.join(tmpDir, 'conversation.jsonl'), lines);

    const result = readProgress(tmpDir);
    expect(result.latest.length).toBeLessThanOrEqual(83); // 80 + '...'
    expect(result.latest).toMatch(/\.\.\.$/);
  });

  test('extracts latest from tool_use entry', () => {
    const lines = [
      JSON.stringify({ role: 'assistant', type: 'tool_use', toolCall: { name: 'Read', input: { path: 'src/auth/token.ts' } }, timestamp: '2026-03-08T10:00:01Z' }),
    ].join('\n') + '\n';
    fs.writeFileSync(path.join(tmpDir, 'conversation.jsonl'), lines);

    const result = readProgress(tmpDir);
    expect(result.latest).toBe('Using Read');
  });

  test('uses last entry for latest (not first)', () => {
    const lines = [
      JSON.stringify({ role: 'assistant', content: 'First message', timestamp: '2026-03-08T10:00:01Z' }),
      JSON.stringify({ role: 'assistant', type: 'tool_use', toolCall: { name: 'Bash' }, timestamp: '2026-03-08T10:00:05Z' }),
    ].join('\n') + '\n';
    fs.writeFileSync(path.join(tmpDir, 'conversation.jsonl'), lines);

    const result = readProgress(tmpDir);
    expect(result.latest).toBe('Using Bash');
  });

  test('computes relative lastActivity from file mtime', () => {
    const convPath = path.join(tmpDir, 'conversation.jsonl');
    fs.writeFileSync(convPath, JSON.stringify({ role: 'assistant', content: 'hi', timestamp: new Date().toISOString() }) + '\n');

    const result = readProgress(tmpDir);
    // Should be very recent (0-2s)
    expect(result.lastActivity).toMatch(/^\d+s ago$/);
  });

  test('handles malformed JSONL lines gracefully', () => {
    const lines = [
      JSON.stringify({ role: 'assistant', content: 'Valid', timestamp: '2026-03-08T10:00:01Z' }),
      'not valid json{{{',
      JSON.stringify({ role: 'assistant', content: 'Also valid', timestamp: '2026-03-08T10:00:02Z' }),
    ].join('\n') + '\n';
    fs.writeFileSync(path.join(tmpDir, 'conversation.jsonl'), lines);

    const result = readProgress(tmpDir);
    expect(result.messages).toBe(2);
    expect(result.latest).toBe('Also valid');
  });

  test('skips system and tool_result roles for message count', () => {
    const lines = [
      JSON.stringify({ role: 'system', content: 'sys', timestamp: '2026-03-08T10:00:00Z' }),
      JSON.stringify({ role: 'assistant', content: 'hi', timestamp: '2026-03-08T10:00:01Z' }),
      JSON.stringify({ role: 'tool', type: 'tool_result', content: 'result', timestamp: '2026-03-08T10:00:02Z' }),
      JSON.stringify({ role: 'assistant', type: 'tool_use', toolCall: { name: 'Edit' }, timestamp: '2026-03-08T10:00:03Z' }),
    ].join('\n') + '\n';
    fs.writeFileSync(path.join(tmpDir, 'conversation.jsonl'), lines);

    const result = readProgress(tmpDir);
    expect(result.messages).toBe(2); // only assistant entries
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test tests/sidecar/progress.test.js`
Expected: FAIL with "Cannot find module '../../src/sidecar/progress'"

**Step 3: Write minimal implementation**

Create `src/sidecar/progress.js`:

```javascript
/**
 * Sidecar Progress Reader
 *
 * Shared logic for reading progress from conversation.jsonl.
 * Used by both MCP sidecar_status handler and CLI heartbeat.
 */

const fs = require('fs');
const path = require('path');

const MAX_LATEST_LENGTH = 80;

/**
 * Read progress from a session directory's conversation.jsonl.
 *
 * @param {string} sessionDir - Path to the session directory
 * @returns {{ messages: number, lastActivity: string, latest: string }}
 */
function readProgress(sessionDir) {
  const convPath = path.join(sessionDir, 'conversation.jsonl');

  if (!fs.existsSync(convPath)) {
    return { messages: 0, lastActivity: 'never', latest: 'Starting up...' };
  }

  let content;
  try {
    content = fs.readFileSync(convPath, 'utf-8');
  } catch {
    return { messages: 0, lastActivity: 'never', latest: 'Starting up...' };
  }

  if (!content.trim()) {
    return { messages: 0, lastActivity: 'never', latest: 'Starting up...' };
  }

  const lines = content.trim().split('\n');
  let messages = 0;
  let lastAssistantEntry = null;

  for (const line of lines) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // skip malformed lines
    }

    if (entry.role === 'assistant') {
      messages++;
      lastAssistantEntry = entry;
    }
  }

  const latest = extractLatest(lastAssistantEntry);
  const lastActivity = computeLastActivity(convPath);

  return { messages, lastActivity, latest };
}

/**
 * Extract a short description of the latest activity.
 *
 * @param {object|null} entry - Last assistant JSONL entry
 * @returns {string} Short description
 */
function extractLatest(entry) {
  if (!entry) {
    return 'Starting up...';
  }

  if (entry.type === 'tool_use' && entry.toolCall) {
    return `Using ${entry.toolCall.name}`;
  }

  if (entry.content) {
    const firstLine = String(entry.content).split('\n')[0].trim();
    if (firstLine.length > MAX_LATEST_LENGTH) {
      return firstLine.slice(0, MAX_LATEST_LENGTH) + '...';
    }
    return firstLine;
  }

  return 'Working...';
}

/**
 * Compute relative time since last file modification.
 *
 * @param {string} filePath - Path to the file
 * @returns {string} Relative time string (e.g., "12s ago", "3m ago")
 */
function computeLastActivity(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const diffMs = Date.now() - stat.mtimeMs;
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) {
      return `${diffSec}s ago`;
    }
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
      return `${diffMin}m ago`;
    }
    const diffHr = Math.floor(diffMin / 60);
    return `${diffHr}h ago`;
  } catch {
    return 'never';
  }
}

module.exports = { readProgress, extractLatest, computeLastActivity };
```

**Step 4: Run tests to verify they pass**

Run: `npm test tests/sidecar/progress.test.js`
Expected: PASS (all 9 tests)

**Step 5: Commit**

```bash
git add src/sidecar/progress.js tests/sidecar/progress.test.js
git commit -m "feat: add shared progress reader for conversation.jsonl"
```

---

### Task 2: Fix PID preservation in createSessionMetadata

**Files:**
- Modify: `src/sidecar/start.js:34-59`
- Test: `tests/sidecar/start.test.js` (add tests)

**Step 1: Write the failing test**

Add to `tests/sidecar/start.test.js`:

```javascript
describe('createSessionMetadata PID preservation', () => {
  test('preserves pid from existing metadata written by MCP handler', () => {
    const taskId = 'pidtest1';
    const sessionDir = path.join(tmpDir, '.claude', 'sidecar_sessions', taskId);
    fs.mkdirSync(sessionDir, { recursive: true });

    // Simulate MCP handler writing initial metadata with PID
    fs.writeFileSync(
      path.join(sessionDir, 'metadata.json'),
      JSON.stringify({ taskId, status: 'running', pid: 99999, createdAt: new Date().toISOString() })
    );

    // createSessionMetadata should preserve the pid
    const result = createSessionMetadata(taskId, tmpDir, {
      model: 'gemini', prompt: 'test', noUi: true, agent: 'build',
    });

    const meta = JSON.parse(fs.readFileSync(path.join(result, 'metadata.json'), 'utf-8'));
    expect(meta.pid).toBe(99999);
    expect(meta.model).toBe('gemini');
    expect(meta.status).toBe('running');
  });

  test('works when no existing metadata (no pid to preserve)', () => {
    const taskId = 'nopid1';

    const result = createSessionMetadata(taskId, tmpDir, {
      model: 'gemini', prompt: 'test', noUi: true, agent: 'build',
    });

    const meta = JSON.parse(fs.readFileSync(path.join(result, 'metadata.json'), 'utf-8'));
    expect(meta.pid).toBeUndefined();
    expect(meta.model).toBe('gemini');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/sidecar/start.test.js -- -t "PID preservation"`
Expected: FAIL - `expect(meta.pid).toBe(99999)` fails because pid is undefined (overwritten)

**Step 3: Update createSessionMetadata to preserve PID**

In `src/sidecar/start.js`, modify `createSessionMetadata` (lines 34-59):

```javascript
/** Create session directory and save metadata */
function createSessionMetadata(taskId, project, options) {
  const { model, prompt, briefing, noUi, headless, agent, thinking } = options;

  const sessionDir = SessionPaths.sessionDir(project, taskId);
  fs.mkdirSync(sessionDir, { recursive: true, mode: 0o700 });

  const effectiveBriefing = prompt || briefing;
  const isHeadless = noUi !== undefined ? noUi : headless;

  // Preserve fields from existing metadata (e.g., pid written by MCP handler)
  const metaPath = SessionPaths.metadataFile(sessionDir);
  let existing = {};
  if (fs.existsSync(metaPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    } catch {
      // ignore corrupt metadata
    }
  }

  const metadata = {
    ...existing,
    taskId,
    model,
    project,
    briefing: effectiveBriefing,
    mode: isHeadless ? 'headless' : 'interactive',
    agent: agent || (isHeadless ? 'build' : 'chat'),
    thinking: thinking || 'medium',
    status: 'running',
    createdAt: existing.createdAt || new Date().toISOString()
  };

  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), { mode: 0o600 });

  return sessionDir;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/sidecar/start.test.js -- -t "PID preservation"`
Expected: PASS

**Step 5: Commit**

```bash
git add src/sidecar/start.js tests/sidecar/start.test.js
git commit -m "fix: preserve PID in metadata when CLI process writes session metadata"
```

---

### Task 3: Enhance sidecar_status with progress and PID liveness

**Files:**
- Modify: `src/mcp-server.js:104-117`
- Test: `tests/mcp-server.test.js` (add tests)

**Step 1: Write the failing tests**

Add to `tests/mcp-server.test.js` inside the `'MCP Server Handlers'` describe block:

```javascript
describe('sidecar_status enriched response', () => {
  test('includes messages and lastActivity when running', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-status-'));
    const sessDir = path.join(tmpDir, '.claude', 'sidecar_sessions', 'test01');
    fs.mkdirSync(sessDir, { recursive: true });

    fs.writeFileSync(path.join(sessDir, 'metadata.json'), JSON.stringify({
      taskId: 'test01', status: 'running', pid: process.pid,
      model: 'gemini', createdAt: new Date().toISOString(),
    }));

    // Write some conversation
    const convLines = [
      JSON.stringify({ role: 'assistant', content: 'Reading files...', timestamp: new Date().toISOString() }),
      JSON.stringify({ role: 'assistant', type: 'tool_use', toolCall: { name: 'Read' }, timestamp: new Date().toISOString() }),
    ].join('\n') + '\n';
    fs.writeFileSync(path.join(sessDir, 'conversation.jsonl'), convLines);

    try {
      const result = await handlers.sidecar_status({ taskId: 'test01' }, tmpDir);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.messages).toBe(2);
      expect(parsed.lastActivity).toMatch(/\d+s ago/);
      expect(parsed.latest).toBe('Using Read');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('returns Starting up when no conversation yet', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-status-'));
    const sessDir = path.join(tmpDir, '.claude', 'sidecar_sessions', 'test02');
    fs.mkdirSync(sessDir, { recursive: true });

    fs.writeFileSync(path.join(sessDir, 'metadata.json'), JSON.stringify({
      taskId: 'test02', status: 'running', pid: process.pid,
      model: 'gemini', createdAt: new Date().toISOString(),
    }));

    try {
      const result = await handlers.sidecar_status({ taskId: 'test02' }, tmpDir);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.messages).toBe(0);
      expect(parsed.latest).toBe('Starting up...');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('detects crashed process and updates status', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-status-'));
    const sessDir = path.join(tmpDir, '.claude', 'sidecar_sessions', 'test03');
    fs.mkdirSync(sessDir, { recursive: true });

    // Use a PID that definitely does not exist
    const deadPid = 2147483647;
    fs.writeFileSync(path.join(sessDir, 'metadata.json'), JSON.stringify({
      taskId: 'test03', status: 'running', pid: deadPid,
      model: 'gemini', createdAt: new Date().toISOString(),
    }));

    try {
      const result = await handlers.sidecar_status({ taskId: 'test03' }, tmpDir);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe('crashed');
      expect(parsed.reason).toBeDefined();

      // Verify metadata was updated on disk
      const meta = JSON.parse(fs.readFileSync(path.join(sessDir, 'metadata.json'), 'utf-8'));
      expect(meta.status).toBe('crashed');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('does not include latest/messages for completed sessions', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-status-'));
    const sessDir = path.join(tmpDir, '.claude', 'sidecar_sessions', 'test04');
    fs.mkdirSync(sessDir, { recursive: true });

    fs.writeFileSync(path.join(sessDir, 'metadata.json'), JSON.stringify({
      taskId: 'test04', status: 'complete',
      model: 'gemini', createdAt: new Date().toISOString(),
    }));

    try {
      const result = await handlers.sidecar_status({ taskId: 'test04' }, tmpDir);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe('complete');
      expect(parsed.latest).toBeUndefined();
      expect(parsed.messages).toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test tests/mcp-server.test.js -- -t "sidecar_status enriched"`
Expected: FAIL - parsed.messages is undefined, etc.

**Step 3: Update sidecar_status handler**

In `src/mcp-server.js`, replace the `sidecar_status` handler (lines 104-117):

```javascript
  async sidecar_status(input, project) {
    const cwd = project || getProjectDir(input.project);
    const metadata = readMetadata(input.taskId, cwd);
    if (!metadata) { return textResult(`Session ${input.taskId} not found.`, true); }

    const sessionDir = safeSessionDir(cwd, input.taskId);

    // PID liveness check: detect crashed processes
    if (metadata.status === 'running' && metadata.pid) {
      try {
        process.kill(metadata.pid, 0); // signal 0 = liveness check
      } catch {
        // Process is dead but status says running -> crashed
        metadata.status = 'crashed';
        metadata.crashedAt = new Date().toISOString();
        const metaPath = path.join(sessionDir, 'metadata.json');
        fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), { mode: 0o600 });
      }
    }

    const elapsed = Date.now() - new Date(metadata.createdAt).getTime();
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);

    const response = {
      taskId: metadata.taskId,
      status: metadata.status,
      elapsed: `${mins}m ${secs}s`,
    };

    // Include progress info only for running sessions
    if (metadata.status === 'running') {
      const { readProgress } = require('./sidecar/progress');
      const progress = readProgress(sessionDir);
      response.messages = progress.messages;
      response.lastActivity = progress.lastActivity;
      response.latest = progress.latest;
    }

    // Include reason for error states
    if (metadata.status === 'crashed' || metadata.status === 'error') {
      response.reason = metadata.reason || 'Process exited before completing. Check debug.log in session dir.';
    }

    return textResult(JSON.stringify(response));
  },
```

Also add `require` for `safeSessionDir` at the top of the file if not already imported (it is: line 12).

**Step 4: Run tests to verify they pass**

Run: `npm test tests/mcp-server.test.js -- -t "sidecar_status enriched"`
Expected: PASS (all 4 tests)

**Step 5: Commit**

```bash
git add src/mcp-server.js tests/mcp-server.test.js
git commit -m "feat: enrich sidecar_status with progress, PID liveness, crash detection"
```

---

### Task 4: Add stderr capture and debug.log

**Files:**
- Modify: `src/mcp-server.js:48-60` (spawnSidecarProcess)
- Test: `tests/mcp-server.test.js` (add test)

**Step 1: Write the failing test**

Add to `tests/mcp-server.test.js`:

```javascript
describe('sidecar_start stderr capture', () => {
  test('spawns process with stderr redirected to debug.log', async () => {
    let capturedStdio;
    await jest.isolateModulesAsync(async () => {
      jest.doMock('child_process', () => ({
        spawn: jest.fn((cmd, args, opts) => {
          capturedStdio = opts.stdio;
          return { pid: 12345, unref: jest.fn() };
        }),
      }));
      const { handlers: h } = require('../src/mcp-server');
      await h.sidecar_start({ prompt: 'test', noUi: true }, '/tmp');
    });

    // stdio[2] should be a file descriptor (number), not 'ignore'
    expect(capturedStdio[0]).toBe('ignore'); // stdin
    expect(capturedStdio[1]).toBe('ignore'); // stdout
    expect(typeof capturedStdio[2]).toBe('number'); // stderr -> file
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/mcp-server.test.js -- -t "stderr capture"`
Expected: FAIL - `typeof capturedStdio[2]` is 'string' ('ignore'), not 'number'

**Step 3: Update spawnSidecarProcess**

In `src/mcp-server.js`, modify `spawnSidecarProcess` (lines 48-60). The function needs the sessionDir to know where to write `debug.log`, so add it as a parameter:

```javascript
/** Spawn a sidecar CLI process (detached, fire-and-forget) */
function spawnSidecarProcess(args, sessionDir) {
  const sidecarBin = path.join(__dirname, '..', 'bin', 'sidecar.js');

  // Redirect stderr to debug.log if sessionDir is available
  let stderrFd = 'ignore';
  if (sessionDir) {
    try {
      fs.mkdirSync(sessionDir, { recursive: true, mode: 0o700 });
      stderrFd = fs.openSync(path.join(sessionDir, 'debug.log'), 'w');
    } catch {
      // Fall back to ignore if we can't create the log
    }
  }

  const child = spawn('node', [sidecarBin, ...args], {
    cwd: getProjectDir(),
    stdio: ['ignore', 'ignore', stderrFd],
    detached: true,
    env: { ...process.env, SIDECAR_DEBUG_PORT: '9223' },
  });
  child.unref();
  return child;
}
```

Then update `sidecar_start` handler to pass sessionDir:

```javascript
  async sidecar_start(input, project) {
    const cwd = project || getProjectDir(input.project);
    const { generateTaskId } = require('./sidecar/start');
    const taskId = generateTaskId();

    const sessionDir = path.join(cwd, '.claude', 'sidecar_sessions', taskId);

    const args = ['start', '--prompt', input.prompt, '--task-id', taskId, '--client', 'cowork'];
    if (input.model) { args.push('--model', input.model); }
    if (input.agent) { args.push('--agent', input.agent); }
    if (input.noUi) { args.push('--no-ui'); }
    if (input.thinking) { args.push('--thinking', input.thinking); }
    if (input.timeout) { args.push('--timeout', String(input.timeout)); }
    if (input.contextTurns)     { args.push('--context-turns', String(input.contextTurns)); }
    if (input.contextSince)     { args.push('--context-since', input.contextSince); }
    if (input.contextMaxTokens) { args.push('--context-max-tokens', String(input.contextMaxTokens)); }
    if (input.summaryLength)    { args.push('--summary-length', input.summaryLength); }
    args.push('--cwd', cwd);

    let child;
    try { child = spawnSidecarProcess(args, sessionDir); } catch (err) {
      return textResult(`Failed to start sidecar: ${err.message}`, true);
    }

    // Save PID so sidecar_abort can kill the process
    if (child && child.pid) {
      fs.mkdirSync(sessionDir, { recursive: true, mode: 0o700 });
      const metaPath = path.join(sessionDir, 'metadata.json');
      if (!fs.existsSync(metaPath)) {
        fs.writeFileSync(metaPath, JSON.stringify({
          taskId, status: 'running', pid: child.pid, createdAt: new Date().toISOString(),
        }, null, 2), { mode: 0o600 });
      }
    }

    return textResult(JSON.stringify({
      taskId, status: 'running',
      message: 'Sidecar started. Use sidecar_status to check progress, sidecar_read to get results.',
    }));
  },
```

Also update `sidecar_resume` and `sidecar_continue` to pass sessionDir similarly.

**Step 4: Run tests to verify they pass**

Run: `npm test tests/mcp-server.test.js -- -t "stderr capture"`
Expected: PASS

**Step 5: Run full mcp-server test suite to check for regressions**

Run: `npm test tests/mcp-server.test.js`
Expected: PASS (all existing + new tests)

**Step 6: Commit**

```bash
git add src/mcp-server.js tests/mcp-server.test.js
git commit -m "feat: redirect spawned sidecar stderr to debug.log for crash diagnostics"
```

---

### Task 5: Add crash recovery exit handler

**Files:**
- Modify: `bin/sidecar.js:24-38`
- Test: `tests/sidecar/exit-handler.test.js`

**Step 1: Write the failing test**

Create `tests/sidecar/exit-handler.test.js`:

```javascript
/**
 * Exit Handler Tests
 *
 * Tests that uncaught exceptions in spawned sidecar processes
 * update metadata.json to 'error' status before exiting.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { installCrashHandler } = require('../../src/sidecar/crash-handler');

describe('installCrashHandler', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crash-handler-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('writes error status to metadata on crash', () => {
    const sessDir = path.join(tmpDir, '.claude', 'sidecar_sessions', 'crash1');
    fs.mkdirSync(sessDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessDir, 'metadata.json'),
      JSON.stringify({ taskId: 'crash1', status: 'running', createdAt: new Date().toISOString() })
    );

    // Simulate crash handler writing
    const handler = installCrashHandler('crash1', tmpDir);
    handler(new Error('Something broke'));

    const meta = JSON.parse(fs.readFileSync(path.join(sessDir, 'metadata.json'), 'utf-8'));
    expect(meta.status).toBe('error');
    expect(meta.reason).toBe('Something broke');
    expect(meta.errorAt).toBeDefined();
  });

  test('does nothing if metadata does not exist', () => {
    const handler = installCrashHandler('nonexistent', tmpDir);
    // Should not throw
    expect(() => handler(new Error('test'))).not.toThrow();
  });

  test('does nothing if status is already complete', () => {
    const sessDir = path.join(tmpDir, '.claude', 'sidecar_sessions', 'done1');
    fs.mkdirSync(sessDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessDir, 'metadata.json'),
      JSON.stringify({ taskId: 'done1', status: 'complete', createdAt: new Date().toISOString() })
    );

    const handler = installCrashHandler('done1', tmpDir);
    handler(new Error('late error'));

    const meta = JSON.parse(fs.readFileSync(path.join(sessDir, 'metadata.json'), 'utf-8'));
    expect(meta.status).toBe('complete'); // unchanged
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test tests/sidecar/exit-handler.test.js`
Expected: FAIL - "Cannot find module '../../src/sidecar/crash-handler'"

**Step 3: Write crash handler module**

Create `src/sidecar/crash-handler.js`:

```javascript
/**
 * Sidecar Crash Handler
 *
 * Provides an error handler that updates session metadata to 'error'
 * when the spawned sidecar process crashes with an uncaught exception.
 */

const fs = require('fs');
const { SessionPaths } = require('./session-utils');

/**
 * Install a crash handler that updates metadata on uncaught errors.
 * Returns the handler function for testability.
 *
 * @param {string} taskId - Task ID of the session
 * @param {string} project - Project directory path
 * @returns {Function} The crash handler function
 */
function installCrashHandler(taskId, project) {
  const handler = (err) => {
    try {
      const sessionDir = SessionPaths.sessionDir(project, taskId);
      const metaPath = SessionPaths.metadataFile(sessionDir);

      if (!fs.existsSync(metaPath)) { return; }

      const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));

      // Only update if still running
      if (metadata.status !== 'running') { return; }

      metadata.status = 'error';
      metadata.reason = err.message || 'Unknown error';
      metadata.errorAt = new Date().toISOString();
      fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), { mode: 0o600 });
    } catch {
      // Best-effort: don't let the crash handler itself crash
    }
  };

  return handler;
}

module.exports = { installCrashHandler };
```

**Step 4: Run tests to verify they pass**

Run: `npm test tests/sidecar/exit-handler.test.js`
Expected: PASS (all 3 tests)

**Step 5: Wire the handler into bin/sidecar.js**

In `bin/sidecar.js`, add after the args parsing (after line 26):

```javascript
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  // Install crash handler for MCP-spawned processes (have --task-id)
  if (args['task-id'] && (command === 'start' || command === 'continue')) {
    const { installCrashHandler } = require('../src/sidecar/crash-handler');
    const project = args.cwd || process.cwd();
    const handler = installCrashHandler(args['task-id'], project);
    process.on('uncaughtException', (err) => {
      handler(err);
      process.exit(1);
    });
    process.on('unhandledRejection', (reason) => {
      handler(reason instanceof Error ? reason : new Error(String(reason)));
      process.exit(1);
    });
  }

  // ... rest of main() unchanged
```

**Step 6: Commit**

```bash
git add src/sidecar/crash-handler.js tests/sidecar/exit-handler.test.js bin/sidecar.js
git commit -m "feat: add crash handler to update metadata on uncaught exceptions"
```

---

### Task 6: Enhance CLI heartbeat with progress

**Files:**
- Modify: `src/sidecar/session-utils.js:87-103`
- Test: `tests/sidecar/session-utils.test.js` (add tests)

**Step 1: Write the failing test**

Add to `tests/sidecar/session-utils.test.js`:

```javascript
describe('createHeartbeat with progress', () => {
  let tmpDir;

  beforeEach(() => {
    jest.useFakeTimers();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-'));
  });

  afterEach(() => {
    jest.useRealTimers();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('includes message count and latest activity in heartbeat', () => {
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation();

    // Write conversation data
    const convLines = [
      JSON.stringify({ role: 'assistant', content: 'Reading files', timestamp: new Date().toISOString() }),
      JSON.stringify({ role: 'assistant', type: 'tool_use', toolCall: { name: 'Bash' }, timestamp: new Date().toISOString() }),
    ].join('\n') + '\n';
    fs.writeFileSync(path.join(tmpDir, 'conversation.jsonl'), convLines);

    const heartbeat = createHeartbeat(1000, tmpDir);
    jest.advanceTimersByTime(1000);

    expect(stderrSpy).toHaveBeenCalled();
    const output = stderrSpy.mock.calls[0][0];
    expect(output).toContain('2 messages');
    expect(output).toContain('Using Bash');

    heartbeat.stop();
    stderrSpy.mockRestore();
  });

  test('shows Starting up when no conversation exists', () => {
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation();

    const heartbeat = createHeartbeat(1000, tmpDir);
    jest.advanceTimersByTime(1000);

    const output = stderrSpy.mock.calls[0][0];
    expect(output).toContain('Starting up...');

    heartbeat.stop();
    stderrSpy.mockRestore();
  });

  test('falls back to basic heartbeat when no sessionDir provided', () => {
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation();

    const heartbeat = createHeartbeat(1000);
    jest.advanceTimersByTime(1000);

    const output = stderrSpy.mock.calls[0][0];
    expect(output).toContain('[sidecar]');
    expect(output).toContain('still running');

    heartbeat.stop();
    stderrSpy.mockRestore();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/sidecar/session-utils.test.js -- -t "createHeartbeat with progress"`
Expected: FAIL - output doesn't contain '2 messages'

**Step 3: Update createHeartbeat**

In `src/sidecar/session-utils.js`, replace `createHeartbeat` (lines 87-103):

```javascript
/** Create a heartbeat that writes status to stderr periodically */
function createHeartbeat(interval = HEARTBEAT_INTERVAL, sessionDir) {
  const startTime = Date.now();
  const intervalId = setInterval(() => {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const ts = mins > 0 ? `${mins}m${secs}s` : `${secs}s`;

    if (sessionDir) {
      const { readProgress } = require('./progress');
      const progress = readProgress(sessionDir);
      process.stderr.write(`[sidecar] ${ts} | ${progress.messages} messages | ${progress.latest}\n`);
    } else {
      process.stderr.write(`[sidecar] still running... ${ts} elapsed\n`);
    }
  }, interval);

  return {
    stop() {
      clearInterval(intervalId);
    }
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/sidecar/session-utils.test.js -- -t "createHeartbeat with progress"`
Expected: PASS

**Step 5: Pass sessionDir to createHeartbeat in startSidecar**

In `src/sidecar/start.js`, update the `createHeartbeat` call (around line 336):

Change:
```javascript
const heartbeat = createHeartbeat();
```
To:
```javascript
const heartbeat = createHeartbeat(HEARTBEAT_INTERVAL, sessDir);
```

**Step 6: Run full session-utils test suite**

Run: `npm test tests/sidecar/session-utils.test.js`
Expected: PASS (all existing + new tests)

**Step 7: Commit**

```bash
git add src/sidecar/session-utils.js src/sidecar/start.js tests/sidecar/session-utils.test.js
git commit -m "feat: enrich CLI heartbeat with message count and latest activity"
```

---

### Task 7: Write MCP headless lifecycle integration tests

**Files:**
- Create: `tests/mcp-headless-lifecycle.test.js`

**Step 1: Write all integration tests**

Create `tests/mcp-headless-lifecycle.test.js`:

```javascript
/**
 * MCP Headless Lifecycle Integration Tests
 *
 * End-to-end tests that verify the full MCP headless lifecycle:
 * start -> poll status -> detect completion -> read results.
 *
 * These tests call MCP handlers directly with realistic filesystem state
 * to simulate what happens when a headless sidecar runs via MCP.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

describe('MCP Headless Lifecycle', () => {
  let handlers;
  let tmpDir;

  beforeAll(() => {
    handlers = require('../src/mcp-server').handlers;
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-lifecycle-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Helper: create session directory with metadata */
  function createSession(taskId, meta) {
    const sessDir = path.join(tmpDir, '.claude', 'sidecar_sessions', taskId);
    fs.mkdirSync(sessDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessDir, 'metadata.json'),
      JSON.stringify({ taskId, createdAt: new Date().toISOString(), ...meta }, null, 2)
    );
    return sessDir;
  }

  /** Helper: write conversation lines */
  function writeConversation(sessDir, entries) {
    const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFileSync(path.join(sessDir, 'conversation.jsonl'), lines);
  }

  /** Helper: write summary */
  function writeSummary(sessDir, text) {
    fs.writeFileSync(path.join(sessDir, 'summary.md'), text);
  }

  describe('happy path: start -> poll -> complete -> read', () => {
    test('full lifecycle with simulated session completion', async () => {
      const taskId = 'lifecycle01';
      const sessDir = createSession(taskId, {
        status: 'running', pid: process.pid,
        model: 'gemini', mode: 'headless',
      });

      // Phase 1: status while running
      writeConversation(sessDir, [
        { role: 'assistant', content: 'Analyzing code...', timestamp: new Date().toISOString() },
      ]);

      let result = await handlers.sidecar_status({ taskId }, tmpDir);
      let parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe('running');
      expect(parsed.messages).toBe(1);
      expect(parsed.latest).toBe('Analyzing code...');

      // Phase 2: more progress
      writeConversation(sessDir, [
        { role: 'assistant', content: 'Analyzing code...', timestamp: new Date().toISOString() },
        { role: 'assistant', type: 'tool_use', toolCall: { name: 'Read' }, timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Found the issue', timestamp: new Date().toISOString() },
      ]);

      result = await handlers.sidecar_status({ taskId }, tmpDir);
      parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe('running');
      expect(parsed.messages).toBe(3);
      expect(parsed.latest).toBe('Found the issue');

      // Phase 3: session completes
      const meta = JSON.parse(fs.readFileSync(path.join(sessDir, 'metadata.json'), 'utf-8'));
      meta.status = 'complete';
      meta.completedAt = new Date().toISOString();
      fs.writeFileSync(path.join(sessDir, 'metadata.json'), JSON.stringify(meta, null, 2));
      writeSummary(sessDir, '## Results\n\nFixed the auth bug.');

      result = await handlers.sidecar_status({ taskId }, tmpDir);
      parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe('complete');
      expect(parsed.messages).toBeUndefined(); // not included for complete
      expect(parsed.latest).toBeUndefined();

      // Phase 4: read results
      result = await handlers.sidecar_read({ taskId, mode: 'summary' }, tmpDir);
      expect(result.content[0].text).toContain('Fixed the auth bug');
    });
  });

  describe('crash detection', () => {
    test('detects dead PID and auto-corrects to crashed', async () => {
      const taskId = 'crash01';
      const deadPid = 2147483647;
      createSession(taskId, {
        status: 'running', pid: deadPid, model: 'gemini',
      });

      const result = await handlers.sidecar_status({ taskId }, tmpDir);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe('crashed');
      expect(parsed.reason).toBeDefined();
    });

    test('crashed status persists on subsequent polls', async () => {
      const taskId = 'crash02';
      const deadPid = 2147483647;
      createSession(taskId, {
        status: 'running', pid: deadPid, model: 'gemini',
      });

      // First poll detects crash
      await handlers.sidecar_status({ taskId }, tmpDir);

      // Second poll should still show crashed (not re-check PID)
      const result = await handlers.sidecar_status({ taskId }, tmpDir);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe('crashed');
    });
  });

  describe('abort workflow', () => {
    test('start -> abort -> status shows aborted', async () => {
      const taskId = 'abort01';
      createSession(taskId, {
        status: 'running', pid: process.pid, model: 'gemini',
      });

      // Abort
      let result = await handlers.sidecar_abort({ taskId }, tmpDir);
      let parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe('aborted');

      // Status reflects abort
      result = await handlers.sidecar_status({ taskId }, tmpDir);
      parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe('aborted');
    });
  });

  describe('PID preservation', () => {
    test('createSessionMetadata preserves PID from MCP handler', () => {
      const { createSessionMetadata } = require('../src/sidecar/start');
      const taskId = 'pidpres01';
      const sessDir = createSession(taskId, {
        status: 'running', pid: 42424, model: 'old',
      });

      // CLI process calls createSessionMetadata (simulates what happens after spawn)
      createSessionMetadata(taskId, tmpDir, {
        model: 'gemini', prompt: 'do stuff', noUi: true, agent: 'build',
      });

      const meta = JSON.parse(fs.readFileSync(path.join(sessDir, 'metadata.json'), 'utf-8'));
      expect(meta.pid).toBe(42424);
      expect(meta.model).toBe('gemini');
    });
  });

  describe('debug log capture', () => {
    test('debug.log is readable when present', async () => {
      const taskId = 'debug01';
      const sessDir = createSession(taskId, {
        status: 'error', model: 'gemini',
        reason: 'Server failed to start',
      });
      fs.writeFileSync(path.join(sessDir, 'debug.log'), 'Error: ECONNREFUSED\n  at connect...\n');

      // Status shows error with reason
      const result = await handlers.sidecar_status({ taskId }, tmpDir);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe('error');
      expect(parsed.reason).toBeDefined();

      // debug.log is accessible
      const log = fs.readFileSync(path.join(sessDir, 'debug.log'), 'utf-8');
      expect(log).toContain('ECONNREFUSED');
    });
  });

  describe('no conversation yet', () => {
    test('status returns zero messages and Starting up', async () => {
      const taskId = 'fresh01';
      createSession(taskId, {
        status: 'running', pid: process.pid, model: 'gemini',
      });

      const result = await handlers.sidecar_status({ taskId }, tmpDir);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe('running');
      expect(parsed.messages).toBe(0);
      expect(parsed.latest).toBe('Starting up...');
      expect(parsed.lastActivity).toBe('never');
    });
  });
});
```

**Step 2: Run tests**

Run: `npm test tests/mcp-headless-lifecycle.test.js`
Expected: PASS (all tests) after Tasks 1-6 are implemented. If run before those tasks, tests will fail (validating our design).

**Step 3: Commit**

```bash
git add tests/mcp-headless-lifecycle.test.js
git commit -m "test: add MCP headless lifecycle integration tests"
```

---

### Task 8: Run full test suite and verify no regressions

**Files:** None (verification only)

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass (existing 927+ tests + new tests)

**Step 2: Run lint**

Run: `npm run lint`
Expected: No lint errors

**Step 3: Verify file sizes**

Run: `find src -name "*.js" -exec wc -l {} + | sort -n | tail -10`
Expected: No file exceeds 300 lines

**Step 4: Update CLAUDE.md if needed**

- Add `progress.js` and `crash-handler.js` to Directory Structure and Key Modules tables
- Update test count
- Add `crashed` and `error` to status values in Troubleshooting

**Step 5: Final commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with new modules and status values"
```
