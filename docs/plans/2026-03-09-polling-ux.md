# Polling UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add mode routing guidance to `sidecar_start` description and a `next_poll` field to headless `sidecar_status` responses to prevent over-polling.

**Architecture:** Two isolated changes — (1) text change to `sidecar_start` description in `src/mcp-tools.js`, (2) `computeNextPoll()` helper + metadata `headless` flag + status handler update in `src/mcp-server.js`. No new files needed.

**Tech Stack:** Node.js, Jest, CommonJS modules.

---

### Task 1: Write failing test — sidecar_start description contains mode routing text

**Files:**
- Modify: `tests/mcp-tools.test.js`

**Step 1: Add the failing test**

In `tests/mcp-tools.test.js`, find the `sidecar_start` describe block (around line 71). Add this test inside it, after the existing `includeContext` test:

```javascript
test('description contains mode routing guidance', () => {
  const tool = getTools().find(t => t.name === 'sidecar_start');
  expect(tool.description).toContain('When in doubt, use interactive');
  expect(tool.description).toContain('does NOT need to monitor');
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/john_renaldi/claude-code-projects/sidecar
npm test tests/mcp-tools.test.js -- --testNamePattern="mode routing"
```

Expected: FAIL — "expect(received).toContain(expected)" — description doesn't contain the new text yet.

**Step 3: Commit the failing test**

```bash
git add tests/mcp-tools.test.js
git commit -m "test(mcp-tools): add failing test for mode routing guidance in sidecar_start"
```

---

### Task 2: Implement description change in sidecar_start

**Files:**
- Modify: `src/mcp-tools.js:34-42`

**Step 1: Update the sidecar_start description**

Replace the current `description:` value (lines 34-42) with:

```javascript
description:
  'Spawn a multi-model sidecar conversation with a different LLM ' +
  '(Gemini, GPT, etc.). Returns a task ID immediately. ' +
  'Mode selection: use INTERACTIVE (default, noUi: false) for research, ' +
  'exploration, analysis, and any task where the user benefits from watching ' +
  'progress live — it eliminates the polling problem entirely. ' +
  'Use HEADLESS (noUi: true) only for background automation the user does NOT ' +
  'need to monitor. When in doubt, use interactive. ' +
  'For headless mode, estimate task complexity and poll sidecar_status ' +
  'accordingly \u2014 sidecar_status responses include next_poll timing hints. ' +
  'For interactive mode, do not poll \u2014 wait for the user to tell you ' +
  'they\'ve clicked Fold, then use sidecar_read. ' +
  'Call sidecar_guide first if you need help choosing models or writing a good briefing.' +
  ' Pass includeContext: false when the briefing is fully self-contained.',
```

**Step 2: Run test to verify it passes**

```bash
npm test tests/mcp-tools.test.js -- --testNamePattern="mode routing"
```

Expected: PASS.

**Step 3: Run the full mcp-tools test suite**

```bash
npm test tests/mcp-tools.test.js
```

Expected: All tests pass (no regressions).

**Step 4: Commit**

```bash
git add src/mcp-tools.js
git commit -m "feat(mcp-tools): add mode routing guidance to sidecar_start description"
```

---

### Task 3: Write failing tests — next_poll in sidecar_status

**Files:**
- Modify: `tests/mcp-server.test.js`

**Step 1: Add tests inside the existing `sidecar_status enriched response` describe block**

After the last test in that describe block (around line 476), add:

```javascript
describe('sidecar_status next_poll field', () => {
  test('includes next_poll when headless:true and status:running', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-poll-'));
    const sessDir = path.join(tmpDir, '.claude', 'sidecar_sessions', 'hl1');
    fs.mkdirSync(sessDir, { recursive: true });
    fs.writeFileSync(path.join(sessDir, 'metadata.json'), JSON.stringify({
      taskId: 'hl1', status: 'running', pid: process.pid,
      headless: true, createdAt: new Date().toISOString(),
    }));
    fs.writeFileSync(path.join(sessDir, 'conversation.jsonl'), '');
    try {
      const result = await handlers.sidecar_status({ taskId: 'hl1' }, tmpDir);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveProperty('next_poll');
      expect(parsed.next_poll).toHaveProperty('recommended_wait_seconds');
      expect(parsed.next_poll).toHaveProperty('hint');
      expect(typeof parsed.next_poll.recommended_wait_seconds).toBe('number');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('omits next_poll when headless is false (interactive)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-poll-'));
    const sessDir = path.join(tmpDir, '.claude', 'sidecar_sessions', 'ia1');
    fs.mkdirSync(sessDir, { recursive: true });
    fs.writeFileSync(path.join(sessDir, 'metadata.json'), JSON.stringify({
      taskId: 'ia1', status: 'running', pid: process.pid,
      headless: false, createdAt: new Date().toISOString(),
    }));
    fs.writeFileSync(path.join(sessDir, 'conversation.jsonl'), '');
    try {
      const result = await handlers.sidecar_status({ taskId: 'ia1' }, tmpDir);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).not.toHaveProperty('next_poll');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('omits next_poll when headless is missing (legacy sessions)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-poll-'));
    const sessDir = path.join(tmpDir, '.claude', 'sidecar_sessions', 'leg1');
    fs.mkdirSync(sessDir, { recursive: true });
    fs.writeFileSync(path.join(sessDir, 'metadata.json'), JSON.stringify({
      taskId: 'leg1', status: 'running', pid: process.pid,
      createdAt: new Date().toISOString(),
    }));
    fs.writeFileSync(path.join(sessDir, 'conversation.jsonl'), '');
    try {
      const result = await handlers.sidecar_status({ taskId: 'leg1' }, tmpDir);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).not.toHaveProperty('next_poll');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('omits next_poll when headless:true but status:complete', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-poll-'));
    const sessDir = path.join(tmpDir, '.claude', 'sidecar_sessions', 'hlc1');
    fs.mkdirSync(sessDir, { recursive: true });
    fs.writeFileSync(path.join(sessDir, 'metadata.json'), JSON.stringify({
      taskId: 'hlc1', status: 'complete', headless: true,
      createdAt: new Date().toISOString(),
    }));
    try {
      const result = await handlers.sidecar_status({ taskId: 'hlc1' }, tmpDir);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe('complete');
      expect(parsed).not.toHaveProperty('next_poll');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('recommended_wait_seconds is 30 for prompt_sent stage', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-poll-'));
    const sessDir = path.join(tmpDir, '.claude', 'sidecar_sessions', 'ps1');
    fs.mkdirSync(sessDir, { recursive: true });
    fs.writeFileSync(path.join(sessDir, 'metadata.json'), JSON.stringify({
      taskId: 'ps1', status: 'running', pid: process.pid,
      headless: true, createdAt: new Date().toISOString(),
    }));
    fs.writeFileSync(path.join(sessDir, 'conversation.jsonl'), '');
    // Write progress.json with prompt_sent stage
    fs.writeFileSync(path.join(sessDir, 'progress.json'), JSON.stringify({
      stage: 'prompt_sent', updatedAt: new Date().toISOString(),
    }));
    try {
      const result = await handlers.sidecar_status({ taskId: 'ps1' }, tmpDir);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.next_poll.recommended_wait_seconds).toBe(30);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('recommended_wait_seconds is 45 for receiving stage under 3 minutes', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-poll-'));
    const sessDir = path.join(tmpDir, '.claude', 'sidecar_sessions', 'rc1');
    fs.mkdirSync(sessDir, { recursive: true });
    // Session just started (elapsed < 3 min)
    fs.writeFileSync(path.join(sessDir, 'metadata.json'), JSON.stringify({
      taskId: 'rc1', status: 'running', pid: process.pid,
      headless: true, createdAt: new Date().toISOString(),
    }));
    fs.writeFileSync(path.join(sessDir, 'conversation.jsonl'), '');
    try {
      const result = await handlers.sidecar_status({ taskId: 'rc1' }, tmpDir);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.next_poll.recommended_wait_seconds).toBe(45);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test tests/mcp-server.test.js -- --testNamePattern="next_poll"
```

Expected: All 6 tests FAIL — `next_poll` field does not exist yet.

**Step 3: Commit failing tests**

```bash
git add tests/mcp-server.test.js
git commit -m "test(mcp-server): add failing tests for next_poll in headless sidecar_status"
```

---

### Task 4: Implement — store headless flag + computeNextPoll + status handler update

**Files:**
- Modify: `src/mcp-server.js`

This task implements everything needed to make the tests green in one commit.

**Step 1: Add `computeNextPoll` helper after the `textResult` function (around line 34)**

Add this new function:

```javascript
/**
 * Compute next poll recommendation for headless sessions.
 * @param {number} elapsedMs - Milliseconds since session start
 * @param {string} [stage] - Current lifecycle stage from progress.json
 * @returns {{ recommended_wait_seconds: number, hint: string }}
 */
function computeNextPoll(elapsedMs, stage) {
  let recommended_wait_seconds;
  if (stage === 'prompt_sent') {
    recommended_wait_seconds = 30;
  } else if (elapsedMs < 3 * 60 * 1000) {
    recommended_wait_seconds = 45;
  } else if (elapsedMs < 8 * 60 * 1000) {
    recommended_wait_seconds = 30;
  } else {
    recommended_wait_seconds = 15;
  }
  return {
    recommended_wait_seconds,
    hint: `Task is actively running. Wait ~${recommended_wait_seconds}s before next poll.`,
  };
}
```

**Step 2: Store `headless` flag in sidecar_start metadata write**

In `sidecar_start` handler, find the metadata write block (lines 90-98). Update it to include `headless`:

```javascript
// BEFORE:
fs.writeFileSync(metaPath, JSON.stringify({
  taskId, status: 'running', pid: child.pid, createdAt: new Date().toISOString(),
}, null, 2), { mode: 0o600 });

// AFTER:
fs.writeFileSync(metaPath, JSON.stringify({
  taskId, status: 'running', pid: child.pid, createdAt: new Date().toISOString(),
  headless: !!input.noUi,
}, null, 2), { mode: 0o600 });
```

**Step 3: Add `next_poll` to sidecar_status handler**

In `sidecar_status` handler, find the running progress block (lines 138-141):

```javascript
// BEFORE:
if (metadata.status === 'running') {
  const progress = readProgress(sessionDir);
  Object.assign(response, progress);
}

// AFTER:
if (metadata.status === 'running') {
  const progress = readProgress(sessionDir);
  Object.assign(response, progress);
  if (metadata.headless) {
    response.next_poll = computeNextPoll(ms, progress.stage);
  }
}
```

**Step 4: Run the next_poll tests to verify they pass**

```bash
npm test tests/mcp-server.test.js -- --testNamePattern="next_poll"
```

Expected: All 6 tests PASS.

**Step 5: Run full mcp-server test suite**

```bash
npm test tests/mcp-server.test.js
```

Expected: All tests pass (no regressions).

**Step 6: Commit**

```bash
git add src/mcp-server.js
git commit -m "feat(mcp-server): add next_poll timing hints to headless sidecar_status responses

Store headless flag in session metadata and compute adaptive poll
intervals based on task stage and elapsed time. Only headless sessions
include next_poll — interactive sessions are unaffected."
```

---

### Task 5: Full test suite + verify

**Step 1: Run all tests**

```bash
npm test
```

Expected: All tests pass.

**Step 2: If any failures, fix them before proceeding**

Check the failure output carefully. Common causes:
- The `sidecar_start` tests that mock `fs.writeFileSync` may need updating if they assert the exact JSON written to metadata. Look for tests that check `fs.writeFileSync` call args and add `headless` to the expected object.

**Step 3: Commit any fixes**

```bash
git add -p  # stage only what changed
git commit -m "fix(tests): update metadata mock expectations to include headless flag"
```
