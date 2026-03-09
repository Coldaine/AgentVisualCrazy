# Smart Polling Guidance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce token waste from LLMs polling `sidecar_status` too frequently by adding mode-dependent polling guidance to MCP tool responses, descriptions, and guide text, plus a post-Fold nudge in the Electron UI.

**Architecture:** Text/guidance-only changes. No new schema parameters. The `sidecar_start` handler returns different response messages for interactive vs headless mode. Tool descriptions and guide text are updated. The Electron fold handler shows a brief nudge overlay before closing.

**Tech Stack:** Node.js (ESM), Jest, Electron BrowserView

---

### Task 1: Update `sidecar_start` handler response text (mcp-server.js)

**Files:**
- Modify: `src/mcp-server.js:99-102` (the `sidecar_start` return statement)

**Step 1: Write the failing test**

Add to `tests/mcp-server.test.js` inside the `describe('sidecar_start', ...)` block:

```javascript
test('returns interactive mode message when noUi is false', async () => {
  let _capturedArgs;
  await jest.isolateModulesAsync(async () => {
    jest.doMock('child_process', () => ({
      spawn: jest.fn((_cmd, args) => {
        _capturedArgs = args;
        return { pid: 12345, unref: jest.fn() };
      }),
    }));
    const { handlers: h } = require('../src/mcp-server');
    const result = await h.sidecar_start({ prompt: 'analyze auth', noUi: false }, '/tmp');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.mode).toBe('interactive');
    expect(parsed.message).toContain('Do NOT poll');
    expect(parsed.message).toContain('clicked Fold');
  });
});

test('returns headless mode message with complexity tiers when noUi is true', async () => {
  let _capturedArgs;
  await jest.isolateModulesAsync(async () => {
    jest.doMock('child_process', () => ({
      spawn: jest.fn((_cmd, args) => {
        _capturedArgs = args;
        return { pid: 12345, unref: jest.fn() };
      }),
    }));
    const { handlers: h } = require('../src/mcp-server');
    const result = await h.sidecar_start({ prompt: 'implement feature', noUi: true }, '/tmp');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.mode).toBe('headless');
    expect(parsed.message).toContain('complexity');
    expect(parsed.message).toContain('20s');
    expect(parsed.message).toContain('30s');
    expect(parsed.message).toContain('45s');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/mcp-server.test.js`
Expected: FAIL - `parsed.mode` is undefined, message doesn't contain the new text.

**Step 3: Write minimal implementation**

In `src/mcp-server.js`, replace lines 99-102 (the return statement in `sidecar_start`):

```javascript
    const isHeadless = !!input.noUi;
    const mode = isHeadless ? 'headless' : 'interactive';
    const message = isHeadless
      ? 'Sidecar started in headless mode. Estimate task complexity before polling: ' +
        'quick tasks (questions, lookups) - first poll at 20s, then every 15-20s. ' +
        'Medium tasks (code review, debugging) - first poll at 30s, then every 30s. ' +
        'Heavy tasks (implementation, test generation, large refactors) - first poll at 45s, then every 45s. ' +
        'Use sidecar_status to check progress.'
      : 'Sidecar opened in interactive mode. Do NOT poll for status. ' +
        "Tell the user: 'Let me know when you're done with the sidecar and have clicked Fold.' " +
        'Then wait for the user to tell you. Use sidecar_read to get results once they confirm.';

    return textResult(JSON.stringify({ taskId, status: 'running', mode, message }));
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/mcp-server.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/mcp-server.js tests/mcp-server.test.js
git commit -m "feat(mcp): mode-dependent polling guidance in sidecar_start response"
```

---

### Task 2: Update tool descriptions (mcp-tools.js)

**Files:**
- Modify: `src/mcp-tools.js:33-41` (`sidecar_start` description)
- Modify: `src/mcp-tools.js:97-101` (`sidecar_status` description)

**Step 1: Write the failing test**

Add to `tests/mcp-tools.test.js` inside the top-level `describe`:

```javascript
describe('polling guidance in descriptions', () => {
  test('sidecar_start description mentions interactive and headless modes', () => {
    const tool = TOOLS.find(t => t.name === 'sidecar_start');
    expect(tool.description).toContain('headless');
    expect(tool.description).toContain('interactive');
    expect(tool.description).toContain('do not poll');
  });

  test('sidecar_status description mentions headless mode', () => {
    const tool = TOOLS.find(t => t.name === 'sidecar_status');
    expect(tool.description).toContain('headless');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/mcp-tools.test.js`
Expected: FAIL - current descriptions don't contain 'interactive' or 'do not poll'.

**Step 3: Write minimal implementation**

In `src/mcp-tools.js`, replace the `sidecar_start` description (lines 34-41):

```javascript
    description:
      'Spawn a multi-model sidecar conversation with a different LLM ' +
      '(Gemini, GPT, etc.). Returns a task ID immediately. ' +
      'For headless mode (noUi: true), estimate task complexity and poll ' +
      'sidecar_status accordingly. For interactive mode (default), ' +
      'do not poll — wait for the user to tell you they\'ve clicked Fold, ' +
      'then use sidecar_read. Call sidecar_guide first if you need help ' +
      'choosing models or writing a good briefing.',
```

Replace the `sidecar_status` description (lines 98-101):

```javascript
    description:
      'Check the status of a running sidecar task. Returns status ' +
      '(running/complete), elapsed time, and progress info. Primarily ' +
      'for headless mode — in interactive mode, wait for the user to ' +
      'tell you the sidecar is done instead of polling.',
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/mcp-tools.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/mcp-tools.js tests/mcp-tools.test.js
git commit -m "feat(mcp): update tool descriptions with mode-dependent polling guidance"
```

---

### Task 3: Update guide text (mcp-tools.js getGuideText)

**Files:**
- Modify: `src/mcp-tools.js:252-257` (the `## Async Workflow` section in `getGuideText()`)

**Step 1: Write the failing test**

Add to `tests/mcp-tools.test.js` inside the `describe('getGuideText', ...)` block:

```javascript
test('contains headless polling tiers', () => {
  const guide = getGuideText();
  expect(guide).toContain('Headless Mode');
  expect(guide).toContain('20s');
  expect(guide).toContain('30s');
  expect(guide).toContain('45s');
  expect(guide).toContain('complexity');
});

test('contains interactive mode no-poll guidance', () => {
  const guide = getGuideText();
  expect(guide).toContain('Interactive Mode');
  expect(guide).toContain('Do NOT poll');
  expect(guide).toContain('clicked Fold');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/mcp-tools.test.js`
Expected: FAIL - current guide text doesn't contain 'Headless Mode' or 'Do NOT poll'.

**Step 3: Write minimal implementation**

In `src/mcp-tools.js`, replace the `## Async Workflow` section in `getGuideText()` (lines 252-257):

```
## Async Workflow

### Headless Mode (noUi: true)
1. sidecar_start with model + prompt + noUi: true -> get task ID
2. Estimate task complexity from your briefing:
   - Quick (questions, lookups, short analysis): first poll at 20s, then every 15-20s
   - Medium (code review, debugging, research): first poll at 30s, then every 30s
   - Heavy (implementation, test generation, large refactors): first poll at 45s, then every 45s
3. sidecar_status to check progress
4. sidecar_read to get the summary once complete
5. Act on findings

### Interactive Mode (noUi: false, default)
1. sidecar_start with model + prompt -> get task ID
2. Tell the user: "Let me know when you're done with the sidecar and have clicked Fold."
3. Do NOT poll sidecar_status. Wait for the user to tell you it's done.
4. If the user starts a new message without mentioning the sidecar, ask if they're done or just call sidecar_read
5. Act on findings
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/mcp-tools.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/mcp-tools.js tests/mcp-tools.test.js
git commit -m "feat(mcp): replace async workflow guide with mode-split polling guidance"
```

---

### Task 4: Add post-Fold nudge overlay (electron/fold.js)

**Files:**
- Modify: `electron/fold.js:55-69` (after `process.stdout.write`, before `mainWindow.close()`)

**Step 1: Write the failing test**

Create `tests/fold-nudge.test.js`:

```javascript
const { createFoldHandler } = require('../electron/fold');

// Mock dependencies
jest.mock('../electron/summary', () => ({
  requestSummaryFromModel: jest.fn().mockResolvedValue('Test summary'),
}));
jest.mock('../src/prompt-builder', () => ({
  getSummaryTemplate: jest.fn().mockReturnValue('template'),
}));
jest.mock('electron', () => ({
  app: { quit: jest.fn() },
}));

describe('Fold nudge message', () => {
  let stdoutSpy;

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  test('shows nudge overlay after fold completes', async () => {
    const executedScripts = [];
    const mockWindow = {
      close: jest.fn(),
      isDestroyed: () => false,
      webContents: {
        executeJavaScript: jest.fn((script) => {
          executedScripts.push(script);
          return Promise.resolve();
        }),
      },
    };
    const mockContentView = {
      webContents: {
        executeJavaScript: jest.fn((script) => {
          executedScripts.push(script);
          return Promise.resolve();
        }),
      },
    };

    const handler = createFoldHandler({
      model: 'gemini', client: 'cowork', cwd: '/tmp',
      sessionId: 'ses_123', taskId: 'task-1', port: 4096,
    });

    await handler.triggerFold(mockWindow, mockContentView);

    const allScripts = executedScripts.join(' ');
    expect(allScripts).toContain('Tell Claude');
    expect(allScripts).toContain('done with the sidecar');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/fold-nudge.test.js`
Expected: FAIL - no script contains 'Tell Claude'.

**Step 3: Write minimal implementation**

In `electron/fold.js`, after the `process.stdout.write(output + '\n')` line (line 55) and the `logger.info('Fold completed', ...)` line (line 56), add a nudge overlay before the window close block. The nudge replaces the existing fold overlay content using `textContent` (safe DOM method, no XSS risk since there is no user input):

```javascript
      // Show nudge overlay before closing
      if (contentView) {
        await contentView.webContents.executeJavaScript(`
          (function() {
            var overlay = document.getElementById('sidecar-fold-overlay');
            if (overlay) {
              while (overlay.firstChild) { overlay.removeChild(overlay.firstChild); }
              var msg = document.createElement('div');
              msg.style.cssText = 'color:#E8E0D8;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:15px;font-weight:500;text-align:center;max-width:320px;';
              msg.textContent = 'Summary saved. Tell Claude you\\u2019re done with the sidecar so it can read the results.';
              overlay.appendChild(msg);
            }
          })();
        `).catch(() => {});
      }

      // Wait 2.5s for user to read the nudge, then close
      await new Promise(resolve => setTimeout(resolve, 2500));
```

This goes right before the existing close block:
```javascript
    // Close the window after fold
    const { app } = require('electron');
    if (mainWindow) {
      mainWindow.close();
    } else {
      app.quit();
    }
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/fold-nudge.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add electron/fold.js tests/fold-nudge.test.js
git commit -m "feat(electron): show post-Fold nudge to tell Claude you're done"
```

---

### Task 5: Update SKILL.md workflow documentation

**Files:**
- Modify: `skill/SKILL.md` (the "Background Execution" section around line 626)

**Step 1: No test needed** (documentation-only change per TDD skip rules)

**Step 2: Update SKILL.md**

Find the `## Background Execution (REQUIRED)` section (around line 626). Replace the content after the heading with guidance that distinguishes interactive vs headless:

```markdown
## Background Execution

### Headless Mode (--no-ui)

**ALWAYS run headless sidecar commands in the background.** Use the Bash tool's `run_in_background: true` parameter for `sidecar start --no-ui`. This ensures no timeout ceiling and you can continue working.

After launching, estimate task complexity to set your polling interval:
- **Quick** (questions, lookups): first poll at 20s, then every 15-20s
- **Medium** (code review, debugging): first poll at 30s, then every 30s
- **Heavy** (implementation, test generation): first poll at 45s, then every 45s

When the background task completes, use `sidecar read <task_id>` to get results.

### Interactive Mode (Default)

When running without `--no-ui`, the Electron GUI opens in a separate window. **Do NOT poll for status.** Instead:

1. Tell the user: "Let me know when you're done with the sidecar and have clicked Fold."
2. Wait for the user to confirm they're done.
3. Use `sidecar read <task_id>` to get the summary.

If the user starts a new message without mentioning the sidecar, ask if they're done or just read the results.
```

Keep the existing "Interactive mode note" and "Important: Warn users about potential file conflicts" paragraphs if they're still relevant.

**Step 3: Commit**

```bash
git add skill/SKILL.md
git commit -m "docs(skill): update SKILL.md with mode-dependent polling guidance"
```

---

### Task 6: Run full test suite and verify

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass, no regressions.

**Step 2: Run linting**

Run: `npm run lint`
Expected: No lint errors.

**Step 3: Verify file sizes**

Run: `node scripts/check-file-sizes.js`
Expected: No files exceed 300 lines.

**Step 4: Validate docs**

Run: `npm run validate-docs`
Expected: No drift warnings (may need CLAUDE.md updates if test count changed).

**Step 5: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: final cleanup after smart polling guidance implementation"
```
