# MCP Missing Options Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 6 missing CLI options to the MCP tool schemas and handlers so Cowork users can control context size and output verbosity when calling `sidecar_start` and `sidecar_continue`.

**Architecture:** Purely additive — add Zod schema fields to `src/mcp-tools.js` and wire conditional `args.push()` calls in `src/mcp-server.js`. No new modules. The CLI already validates all values, so invalid inputs cause the spawned process to fail gracefully.

**Tech Stack:** Node.js (CommonJS), Zod (schema validation), Jest (tests), `jest.isolateModulesAsync` + `jest.doMock` for spawn arg tests.

---

## Background: How MCP spawn arg tests work

The MCP handlers use `child_process.spawn` to run the CLI. Tests intercept spawn by using `jest.doMock` inside `jest.isolateModulesAsync`. This pattern (NOT `jest.mock`) is required because `jest.mock` is hoisted and cannot reference outer-scope variables.

Pattern used in existing tests in `tests/mcp-server.test.js`:

```js
describe('My new tests', () => {
  it('passes --my-flag to CLI', async () => {
    let capturedArgs = [];
    await jest.isolateModulesAsync(async () => {
      jest.doMock('child_process', () => ({
        spawn: (_cmd, args, _opts) => {
          capturedArgs = args;
          return { pid: 1234, unref: jest.fn(), stdout: { on: jest.fn() }, stderr: { on: jest.fn() } };
        }
      }));
      jest.doMock('fs', () => ({ ...jest.requireActual('fs'), mkdirSync: jest.fn(), writeFileSync: jest.fn(), existsSync: jest.fn(() => false) }));
      const { handlers } = require('../src/mcp-server');
      await handlers.sidecar_start({ prompt: 'test', myField: 42 }, '/tmp/proj');
    });
    expect(capturedArgs).toContain('--my-flag');
    expect(capturedArgs).toContain('42');
  });
});
```

---

### Task 1: Failing schema tests for `sidecar_start` new fields

**Files:**
- Modify: `tests/mcp-tools.test.js`

**Step 1: Add the 4 failing schema tests**

Find the existing `describe('sidecar_start')` block in `tests/mcp-tools.test.js` and add these tests inside it:

```js
it('has contextTurns in input schema', () => {
  const tool = TOOLS.find(t => t.name === 'sidecar_start');
  expect(tool.inputSchema.contextTurns).toBeDefined();
});

it('has contextSince in input schema', () => {
  const tool = TOOLS.find(t => t.name === 'sidecar_start');
  expect(tool.inputSchema.contextSince).toBeDefined();
});

it('has contextMaxTokens in input schema', () => {
  const tool = TOOLS.find(t => t.name === 'sidecar_start');
  expect(tool.inputSchema.contextMaxTokens).toBeDefined();
});

it('has summaryLength in input schema', () => {
  const tool = TOOLS.find(t => t.name === 'sidecar_start');
  expect(tool.inputSchema.summaryLength).toBeDefined();
});
```

**Step 2: Run tests to verify they fail**

```bash
cd /Users/john_renaldi/claude-code-projects/sidecar
npm test tests/mcp-tools.test.js -- --testNamePattern="contextTurns|contextSince|contextMaxTokens|summaryLength" 2>&1 | tail -20
```

Expected: 4 FAILs — "expected undefined to be defined"

**Step 3: Add the fields to `sidecar_start` inputSchema in `src/mcp-tools.js`**

Inside the `sidecar_start` tool's `inputSchema` object (after the existing `timeout` field), add:

```js
contextTurns: z.number().optional().describe(
  'Max conversation turns to include from your Claude session. Default: 50.'
),
contextSince: z.string().optional().describe(
  'Time filter for context — include only turns from the last N minutes/hours/days. ' +
  'Format: 30m, 2h, 1d. Overrides contextTurns when set.'
),
contextMaxTokens: z.number().optional().describe(
  'Cap on context size in tokens. Default: 80000.'
),
summaryLength: z.enum(['brief', 'normal', 'verbose']).optional().describe(
  'Fold summary verbosity. brief: key findings only. normal (default): full ' +
  'structured output. verbose: maximum detail.'
),
```

**Step 4: Run tests to verify they pass**

```bash
npm test tests/mcp-tools.test.js -- --testNamePattern="contextTurns|contextSince|contextMaxTokens|summaryLength" 2>&1 | tail -20
```

Expected: 4 PASSes

**Step 5: Commit**

```bash
git add tests/mcp-tools.test.js src/mcp-tools.js
git commit -m "feat: add contextTurns/contextSince/contextMaxTokens/summaryLength to sidecar_start schema"
```

---

### Task 2: Failing schema tests for `sidecar_continue` new fields

**Files:**
- Modify: `tests/mcp-tools.test.js`

**Step 1: Add the 2 failing schema tests**

Find the existing `describe('sidecar_continue')` block and add:

```js
it('has contextTurns in input schema', () => {
  const tool = TOOLS.find(t => t.name === 'sidecar_continue');
  expect(tool.inputSchema.contextTurns).toBeDefined();
});

it('has contextMaxTokens in input schema', () => {
  const tool = TOOLS.find(t => t.name === 'sidecar_continue');
  expect(tool.inputSchema.contextMaxTokens).toBeDefined();
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test tests/mcp-tools.test.js -- --testNamePattern="sidecar_continue" 2>&1 | tail -20
```

Expected: 2 FAILs for the new tests

**Step 3: Add the fields to `sidecar_continue` inputSchema in `src/mcp-tools.js`**

Inside the `sidecar_continue` tool's `inputSchema` object (after the existing `timeout` field), add:

```js
contextTurns: z.number().optional().describe(
  'Max turns from the previous session\'s conversation to include as context. Default: 50.'
),
contextMaxTokens: z.number().optional().describe(
  'Cap on previous session context size in tokens. Default: 80000.'
),
```

**Step 4: Run tests to verify they pass**

```bash
npm test tests/mcp-tools.test.js -- --testNamePattern="sidecar_continue" 2>&1 | tail -20
```

Expected: all `sidecar_continue` tests pass

**Step 5: Commit**

```bash
git add tests/mcp-tools.test.js src/mcp-tools.js
git commit -m "feat: add contextTurns/contextMaxTokens to sidecar_continue schema"
```

---

### Task 3: Failing handler tests — `sidecar_start` passes new flags to CLI

**Files:**
- Modify: `tests/mcp-server.test.js`

**Step 1: Add a new describe block with 4 failing handler tests**

Add this entire describe block to `tests/mcp-server.test.js` (before the closing of the file, alongside other describe blocks):

```js
describe('sidecar_start context and summary args', () => {
  it('passes --context-turns to CLI', async () => {
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
      await handlers.sidecar_start({ prompt: 'test', contextTurns: 25 }, '/tmp/proj');
    });
    expect(capturedArgs).toContain('--context-turns');
    expect(capturedArgs).toContain('25');
  });

  it('passes --context-since to CLI', async () => {
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
      await handlers.sidecar_start({ prompt: 'test', contextSince: '2h' }, '/tmp/proj');
    });
    expect(capturedArgs).toContain('--context-since');
    expect(capturedArgs).toContain('2h');
  });

  it('passes --context-max-tokens to CLI', async () => {
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
      await handlers.sidecar_start({ prompt: 'test', contextMaxTokens: 40000 }, '/tmp/proj');
    });
    expect(capturedArgs).toContain('--context-max-tokens');
    expect(capturedArgs).toContain('40000');
  });

  it('passes --summary-length to CLI', async () => {
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
      await handlers.sidecar_start({ prompt: 'test', summaryLength: 'verbose' }, '/tmp/proj');
    });
    expect(capturedArgs).toContain('--summary-length');
    expect(capturedArgs).toContain('verbose');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test tests/mcp-server.test.js -- --testNamePattern="context-turns|context-since|context-max-tokens|summary-length" 2>&1 | tail -30
```

Expected: 4 FAILs — flags not present in capturedArgs

**Step 3: Wire the 4 new args in the `sidecar_start` handler in `src/mcp-server.js`**

In the `sidecar_start` handler, after the existing `if (input.timeout)` line, add:

```js
if (input.contextTurns)     { args.push('--context-turns', String(input.contextTurns)); }
if (input.contextSince)     { args.push('--context-since', input.contextSince); }
if (input.contextMaxTokens) { args.push('--context-max-tokens', String(input.contextMaxTokens)); }
if (input.summaryLength)    { args.push('--summary-length', input.summaryLength); }
```

**Step 4: Run tests to verify they pass**

```bash
npm test tests/mcp-server.test.js -- --testNamePattern="context-turns|context-since|context-max-tokens|summary-length" 2>&1 | tail -30
```

Expected: 4 PASSes

**Step 5: Commit**

```bash
git add tests/mcp-server.test.js src/mcp-server.js
git commit -m "feat: wire context/summary args from sidecar_start MCP handler to CLI"
```

---

### Task 4: Failing handler tests — `sidecar_continue` passes new flags to CLI

**Files:**
- Modify: `tests/mcp-server.test.js`

**Step 1: Add a new describe block with 2 failing handler tests**

```js
describe('sidecar_continue context args', () => {
  it('passes --context-turns to CLI', async () => {
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
      await handlers.sidecar_continue({ taskId: 'abc123', prompt: 'continue', contextTurns: 10 }, '/tmp/proj');
    });
    expect(capturedArgs).toContain('--context-turns');
    expect(capturedArgs).toContain('10');
  });

  it('passes --context-max-tokens to CLI', async () => {
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
      await handlers.sidecar_continue({ taskId: 'abc123', prompt: 'continue', contextMaxTokens: 20000 }, '/tmp/proj');
    });
    expect(capturedArgs).toContain('--context-max-tokens');
    expect(capturedArgs).toContain('20000');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test tests/mcp-server.test.js -- --testNamePattern="sidecar_continue context" 2>&1 | tail -20
```

Expected: 2 FAILs

**Step 3: Wire the 2 new args in the `sidecar_continue` handler in `src/mcp-server.js`**

In the `sidecar_continue` handler, after the existing `if (input.timeout)` line, add:

```js
if (input.contextTurns)     { args.push('--context-turns', String(input.contextTurns)); }
if (input.contextMaxTokens) { args.push('--context-max-tokens', String(input.contextMaxTokens)); }
```

**Step 4: Run tests to verify they pass**

```bash
npm test tests/mcp-server.test.js -- --testNamePattern="sidecar_continue context" 2>&1 | tail -20
```

Expected: 2 PASSes

**Step 5: Commit**

```bash
git add tests/mcp-server.test.js src/mcp-server.js
git commit -m "feat: wire context args from sidecar_continue MCP handler to CLI"
```

---

### Task 5: Full test suite verification

**Step 1: Run all tests**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests pass, no regressions

**Step 2: Run lint**

```bash
npm run lint 2>&1 | tail -20
```

Expected: no lint errors

**Step 3: Final commit if any lint fixes were needed**

Only commit if lint required changes:

```bash
git add -p
git commit -m "fix: lint cleanup after MCP options wiring"
```
