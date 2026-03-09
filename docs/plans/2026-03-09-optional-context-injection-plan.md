# Optional Context Injection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the calling LLM skip parent conversation history when sidecar tasks are self-contained, saving up to 80k tokens per call.

**Architecture:** Add `includeContext` boolean (default `true`) to the MCP schema and `--no-context` CLI flag. When false, skip `buildContext()` entirely in `startSidecar()`. Update the guide and skill with red-flag rules for when context must be included.

**Tech Stack:** Node.js, Zod (MCP schemas), Jest

---

### Task 1: MCP Schema - Add `includeContext` to `sidecar_start`

**Files:**
- Modify: `src/mcp-tools.js:93` (after `summaryLength` field)
- Test: `tests/mcp-tools.test.js`

**Step 1: Write the failing test**

Add to `tests/mcp-tools.test.js` inside the `describe('sidecar_start')` block (after the `summaryLength` test at line 116):

```js
    test('has includeContext in input schema', () => {
      expect(startTool.inputSchema).toHaveProperty('includeContext');
    });

    test('includeContext defaults to true', () => {
      const schema = startTool.inputSchema.includeContext;
      expect(schema._def.typeName).toBe('ZodDefault');
      expect(schema._def.defaultValue()).toBe(true);
    });
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/mcp-tools.test.js`
Expected: 2 FAIL - `includeContext` not found in schema

**Step 3: Write minimal implementation**

In `src/mcp-tools.js`, add after the `summaryLength` field (line 82):

```js
      includeContext: z.boolean().optional().default(true).describe(
        'Whether to include parent conversation history as context. '
        + 'Default: true. Set to false when the briefing is self-contained '
        + 'and does not depend on prior conversation. See sidecar_guide for guidance.'
      ),
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/mcp-tools.test.js`
Expected: PASS

**Step 5: Update tool description**

In `src/mcp-tools.js`, update the `sidecar_start` description (line 35-41) to append:

```
' Pass includeContext: false when the briefing is fully self-contained.'
```

Append to the end of the existing description string.

**Step 6: Commit**

```bash
git add src/mcp-tools.js tests/mcp-tools.test.js
git commit -m "feat: add includeContext field to sidecar_start MCP schema"
```

---

### Task 2: CLI - Add `--no-context` flag

**Files:**
- Modify: `src/cli.js:85-97` (isBooleanFlag), `src/cli.js:346-371` (usage text)
- Test: `tests/cli.test.js`

**Step 1: Write the failing tests**

Add to `tests/cli.test.js` inside the `describe('parseArgs')` block, as a new sub-describe after the `--thinking option` block (line 295):

```js
    describe('--no-context flag', () => {
      it('should parse --no-context as boolean flag', () => {
        const result = parseArgs(['start', '--no-context']);
        expect(result['no-context']).toBe(true);
      });

      it('should default --no-context to undefined when not specified', () => {
        const result = parseArgs(['start', '--model', 'x', '--prompt', 'y']);
        expect(result['no-context']).toBeUndefined();
      });

      it('should parse --no-context alongside other options', () => {
        const result = parseArgs([
          'start', '--model', 'gemini', '--prompt', 'test', '--no-context', '--no-ui'
        ]);
        expect(result['no-context']).toBe(true);
        expect(result['no-ui']).toBe(true);
        expect(result.model).toBe('gemini');
      });
    });
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/cli.test.js`
Expected: FAIL - `--no-context` parsed as `true` (value-taking option) instead of boolean, or `undefined`

**Step 3: Write minimal implementation**

In `src/cli.js`, add `'no-context'` to the `booleanFlags` array in `isBooleanFlag()` (line 85-97):

```js
function isBooleanFlag(key) {
   const booleanFlags = [
     'no-ui',
     'no-mcp',
     'no-context',
     'setup',
     'all',
     // 'summary', // summary is now an option with a value
     'conversation',
     'json',
     'version',
     'help',
     'api-keys'
   ];
  return booleanFlags.includes(key);
}
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/cli.test.js`
Expected: PASS

**Step 5: Update usage text**

In `src/cli.js`, add to the usage text (in the `Options for 'start'` section, after the `--no-ui` line):

```
  --no-context                   Skip parent conversation history context
```

**Step 6: Add usage text test**

Add to `tests/cli.test.js` inside `describe('usage text includes new options')` (after line 850):

```js
    test('--no-context appears in usage', () => {
      const { getUsage } = require('../src/cli');
      const usage = getUsage();
      expect(usage).toContain('--no-context');
    });
```

**Step 7: Run all CLI tests**

Run: `npm test tests/cli.test.js`
Expected: ALL PASS

**Step 8: Commit**

```bash
git add src/cli.js tests/cli.test.js
git commit -m "feat: add --no-context CLI flag to skip parent conversation history"
```

---

### Task 3: Start Flow - Skip `buildContext()` when `includeContext` is false

**Files:**
- Modify: `src/sidecar/start.js:143-178` (startSidecar function)
- Test: `tests/sidecar/start.test.js`

**Step 1: Write the failing tests**

Add a new `describe` block at the end of `tests/sidecar/start.test.js`:

```js
describe('startSidecar includeContext option', () => {
  let buildContextMock;

  beforeEach(() => {
    jest.resetModules();
    // Mock all heavy dependencies so startSidecar doesn't actually run a sidecar
    jest.mock('../../src/sidecar/context-builder', () => ({
      buildContext: jest.fn(() => 'mocked context')
    }));
    jest.mock('../../src/prompt-builder', () => ({
      buildPrompts: jest.fn(() => ({
        system: 'sys', userMessage: 'user', context: ''
      }))
    }));
    jest.mock('../../src/sidecar/session-utils', () => ({
      SessionPaths: {
        sessionDir: jest.fn(() => '/tmp/test-session'),
        metadataFile: jest.fn(() => '/tmp/test-session/metadata.json')
      },
      saveInitialContext: jest.fn(),
      finalizeSession: jest.fn(),
      outputSummary: jest.fn(),
      createHeartbeat: jest.fn(() => ({ stop: jest.fn() })),
      HEARTBEAT_INTERVAL: 5000
    }));
    jest.mock('../../src/sidecar/interactive', () => ({
      runInteractive: jest.fn(() => ({ summary: 'done' })),
      checkElectronAvailable: jest.fn()
    }));
    jest.mock('../../src/headless', () => ({
      runHeadless: jest.fn(() => ({ summary: 'done' }))
    }));
    jest.mock('../../src/opencode-client', () => ({
      loadMcpConfig: jest.fn(() => null),
      parseMcpSpec: jest.fn(() => null)
    }));
    jest.mock('../../src/utils/agent-mapping', () => ({
      mapAgentToOpenCode: jest.fn(() => ({ agent: 'Build' }))
    }));
    jest.mock('../../src/utils/config', () => ({
      checkConfigChanged: jest.fn(() => ({ changed: false }))
    }));
    jest.mock('../../src/utils/mcp-discovery', () => ({
      discoverParentMcps: jest.fn(() => null)
    }));
    jest.mock('fs', () => ({
      ...jest.requireActual('fs'),
      existsSync: jest.fn(() => false),
      mkdirSync: jest.fn(),
      writeFileSync: jest.fn(),
      readFileSync: jest.fn(() => '{}')
    }));

    buildContextMock = require('../../src/sidecar/context-builder').buildContext;
  });

  it('calls buildContext when includeContext is true', async () => {
    const { startSidecar } = require('../../src/sidecar/start');
    await startSidecar({
      model: 'gemini', prompt: 'test', noUi: true, includeContext: true
    });
    expect(buildContextMock).toHaveBeenCalled();
  });

  it('calls buildContext when includeContext is omitted (default true)', async () => {
    const { startSidecar } = require('../../src/sidecar/start');
    await startSidecar({
      model: 'gemini', prompt: 'test', noUi: true
    });
    expect(buildContextMock).toHaveBeenCalled();
  });

  it('skips buildContext when includeContext is false', async () => {
    const { startSidecar } = require('../../src/sidecar/start');
    const { buildPrompts } = require('../../src/prompt-builder');
    await startSidecar({
      model: 'gemini', prompt: 'test', noUi: true, includeContext: false
    });
    expect(buildContextMock).not.toHaveBeenCalled();
    // Verify the sentinel string was passed to buildPrompts
    const contextArg = buildPrompts.mock.calls[0][1];
    expect(contextArg).toContain('Context excluded');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/sidecar/start.test.js`
Expected: FAIL - `includeContext` not recognized, `buildContext` always called

**Step 3: Write minimal implementation**

In `src/sidecar/start.js`, modify the `startSidecar` function:

1. Add `includeContext = true` to destructured options (line 148, after `coworkProcess`):

```js
    client, sessionDir, noMcp, excludeMcp, opencodePort, coworkProcess, includeContext = true
```

2. Replace line 175:

```js
  const rawContext = buildContext(effectiveProject, effectiveSession, { contextTurns, contextSince, contextMaxTokens, sessionDir, client, coworkProcess });
```

With:

```js
  const rawContext = includeContext !== false
    ? buildContext(effectiveProject, effectiveSession, { contextTurns, contextSince, contextMaxTokens, sessionDir, client, coworkProcess })
    : '[Context excluded by caller - briefing is self-contained]';
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/sidecar/start.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/sidecar/start.js tests/sidecar/start.test.js
git commit -m "feat: skip buildContext when includeContext is false"
```

---

### Task 4: MCP Server - Pass `--no-context` to CLI args

**Files:**
- Modify: `src/mcp-server.js:57-103` (sidecar_start handler)
- Test: `tests/mcp-server.test.js`

**Step 1: Write the failing test**

Add to `tests/mcp-server.test.js` inside the `describe('sidecar_start context and summary args')` block (after the `--summary-length` test at line 782):

```js
  it('passes --no-context to CLI when includeContext is false', async () => {
    let capturedArgs = [];
    await jest.isolateModulesAsync(async () => {
      jest.doMock('child_process', () => ({
        spawn: (_cmd, args, _opts) => {
          capturedArgs = args;
          return { pid: 1234, unref: jest.fn(), stdout: { on: jest.fn() }, stderr: { on: jest.fn() } };
        }
      }));
      jest.doMock('fs', () => ({
        ...jest.requireActual('fs'),
        mkdirSync: jest.fn(),
        writeFileSync: jest.fn(),
        existsSync: jest.fn(() => false)
      }));
      const { handlers } = require('../src/mcp-server');
      await handlers.sidecar_start({ prompt: 'self-contained task', includeContext: false }, '/tmp/proj');
    });
    expect(capturedArgs).toContain('--no-context');
  });

  it('does NOT pass --no-context when includeContext is true', async () => {
    let capturedArgs = [];
    await jest.isolateModulesAsync(async () => {
      jest.doMock('child_process', () => ({
        spawn: (_cmd, args, _opts) => {
          capturedArgs = args;
          return { pid: 1234, unref: jest.fn(), stdout: { on: jest.fn() }, stderr: { on: jest.fn() } };
        }
      }));
      jest.doMock('fs', () => ({
        ...jest.requireActual('fs'),
        mkdirSync: jest.fn(),
        writeFileSync: jest.fn(),
        existsSync: jest.fn(() => false)
      }));
      const { handlers } = require('../src/mcp-server');
      await handlers.sidecar_start({ prompt: 'needs context', includeContext: true }, '/tmp/proj');
    });
    expect(capturedArgs).not.toContain('--no-context');
  });

  it('does NOT pass --no-context when includeContext is omitted', async () => {
    let capturedArgs = [];
    await jest.isolateModulesAsync(async () => {
      jest.doMock('child_process', () => ({
        spawn: (_cmd, args, _opts) => {
          capturedArgs = args;
          return { pid: 1234, unref: jest.fn(), stdout: { on: jest.fn() }, stderr: { on: jest.fn() } };
        }
      }));
      jest.doMock('fs', () => ({
        ...jest.requireActual('fs'),
        mkdirSync: jest.fn(),
        writeFileSync: jest.fn(),
        existsSync: jest.fn(() => false)
      }));
      const { handlers } = require('../src/mcp-server');
      await handlers.sidecar_start({ prompt: 'default behavior' }, '/tmp/proj');
    });
    expect(capturedArgs).not.toContain('--no-context');
  });
```

**Step 2: Run test to verify it fails**

Run: `npm test tests/mcp-server.test.js`
Expected: FAIL - `--no-context` never appears in args

**Step 3: Write minimal implementation**

In `src/mcp-server.js`, add to the `sidecar_start` handler, after the `summaryLength` check (line 78) and before the `coworkProcess` check (line 79):

```js
    if (input.includeContext === false) { args.push('--no-context'); }
```

**Step 4: Run test to verify it passes**

Run: `npm test tests/mcp-server.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/mcp-server.js tests/mcp-server.test.js
git commit -m "feat: MCP handler passes --no-context to CLI when includeContext is false"
```

---

### Task 5: Guide Updates - Red-flag rules and self-contained briefing template

**Files:**
- Modify: `src/mcp-tools.js` (getGuideText function, line 236-283)

**Step 1: Update `getGuideText()` in `src/mcp-tools.js`**

Add the following sections to the guide text, before the closing backtick (before `## Existing Sessions`):

```js
## Context Control (includeContext)

By default, sidecar includes your parent conversation history as context. Set \`includeContext: false\` to skip this and save tokens when the briefing is self-contained.

### MUST Include Context (Red Flags)
- Task references prior conversation ("the code we discussed", "that bug", "the approach you suggested")
- Fact checking or second opinions on recent work
- Code review of changes made in this session
- "Does this look right?" or validation requests
- Continuing a debugging thread
- Any task where the sidecar needs to understand what happened before

### Safe to Skip Context
- Greenfield tasks with explicit file paths and instructions
- General knowledge or research questions
- Tasks fully scoped in the briefing (files, criteria, constraints all specified)
- Independent analysis unrelated to current conversation

### Self-Contained Briefing Template
When setting \`includeContext: false\`, write a richer briefing:

\`\`\`
**Objective:** [Specific goal]
**Files to read:** [Exact paths]
**Relevant code:** [Paste key snippets if needed]
**Success criteria:** [How to know when done]
**Constraints:** [Scope limits, things to avoid]
\`\`\`

The sidecar has NO other context. Everything it needs must be in the briefing.
```

**Step 2: Run guide text tests to verify no regressions**

Run: `npm test tests/mcp-tools.test.js`
Expected: PASS (existing guide tests still pass)

**Step 3: Commit**

```bash
git add src/mcp-tools.js
git commit -m "docs: add context control guidance to sidecar_guide"
```

---

### Task 6: Skill Updates - Add `--no-context` to SKILL.md

**Files:**
- Modify: `skill/SKILL.md`

**Step 1: Add `--no-context` to Optional flags**

In `skill/SKILL.md`, add to the Optional flags list (after `--no-ui` at line 177):

```
- `--no-context`: Skip parent conversation history. Use when the briefing is self-contained and includes all necessary file paths, code snippets, and criteria. Default: context is included.
```

**Step 2: Add Context Control section**

In `skill/SKILL.md`, add a new section after "Generating the Briefing" (after line 481, before `## Agent Modes`):

```markdown
## Context Control

By default, sidecar includes your parent conversation history (up to 80k tokens). Skip this with `--no-context` when the task is self-contained.

### When You MUST Include Context
- Task references something from the current conversation ("that bug", "the approach you suggested")
- Fact checking, second opinions, or code review of recent work
- "Does this look right?" or validation requests
- Continuing a debugging thread

### When You Can Skip Context
- Greenfield tasks with explicit file paths and instructions
- General knowledge or research questions
- Tasks fully described in the briefing (files, criteria, constraints all specified)
- Independent analysis unrelated to current conversation

### Self-Contained Briefing Example

```bash
sidecar start \
  --model gemini \
  --no-context \
  --prompt "## Task Briefing

**Objective:** Add retry logic with exponential backoff to the HTTP client

**Files to read:**
- src/api/client.ts (current implementation)
- src/utils/retry.ts (existing retry utility, if any)

**Success criteria:**
- Retries up to 3 times on 5xx errors
- Exponential backoff: 1s, 2s, 4s
- No retry on 4xx errors
- Add unit tests

**Constraints:** Don't modify the public API surface"
```

**Step 3: Commit**

```bash
git add skill/SKILL.md
git commit -m "docs: add --no-context flag and context control guidance to skill"
```

---

### Task 7: Full Test Suite + CLAUDE.md Update

**Step 1: Run full test suite**

Run: `npm test`
Expected: ALL PASS

**Step 2: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 3: Update CLAUDE.md if needed**

No new files are being added or removed. Only existing files are modified. CLAUDE.md update not required unless architecture changed (it didn't).

**Step 4: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "chore: fixups from full test suite run"
```

Only commit if there are actual changes to commit.

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/mcp-tools.js` | Add `includeContext` field + update description + guide text |
| `src/cli.js` | Add `no-context` to boolean flags + usage text |
| `src/sidecar/start.js` | Conditional `buildContext()` skip |
| `src/mcp-server.js` | Pass `--no-context` in CLI args |
| `skill/SKILL.md` | Add `--no-context` flag + Context Control section |
| `tests/mcp-tools.test.js` | Schema field + default tests |
| `tests/cli.test.js` | Flag parsing + usage text tests |
| `tests/sidecar/start.test.js` | `buildContext` skip/call tests |
| `tests/mcp-server.test.js` | CLI arg passthrough tests |
