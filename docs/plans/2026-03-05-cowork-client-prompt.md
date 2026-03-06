# Cowork Client-Aware System Prompt — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When `client === 'cowork'`, the `chat` agent uses a general-purpose prompt (identity: Sidecar) instead of OpenCode's SE-focused base prompt.

**Architecture:** The `chat` agent config in `opencode-client.js` conditionally receives a `prompt` field when `client === 'cowork'`. OpenCode's agent framework replaces the provider base prompt with this field. The `body.system` layer (sidecar header, project context, fold instructions) remains unchanged.

**Tech Stack:** Node.js, Jest, OpenCode SDK agent config

---

### Task 1: Create cowork-agent-prompt.js — Failing Tests

**Files:**
- Create: `tests/prompts/cowork-agent-prompt.test.js`

**Step 1: Create test directory**

Run: `mkdir -p tests/prompts`

**Step 2: Write failing tests**

```javascript
// tests/prompts/cowork-agent-prompt.test.js
const { buildCoworkAgentPrompt } = require('../../src/prompts/cowork-agent-prompt');

describe('buildCoworkAgentPrompt', () => {
  let prompt;

  beforeAll(() => {
    prompt = buildCoworkAgentPrompt();
  });

  it('returns a non-empty string', () => {
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(100);
  });

  // Section 1: Identity
  it('identifies as Sidecar', () => {
    expect(prompt).toContain('Sidecar');
    expect(prompt).not.toContain('You are OpenCode');
    expect(prompt).not.toContain('best coding agent');
  });

  it('describes second-perspective and parallel-task purpose', () => {
    expect(prompt).toMatch(/second (perspective|opinion)/i);
    expect(prompt).toMatch(/parallel/i);
  });

  // Section 2: Tone & formatting
  it('includes tone and formatting guidance', () => {
    expect(prompt).toMatch(/formatting/i);
    expect(prompt).toMatch(/natural/i);
    expect(prompt).toMatch(/emoji/i);
  });

  // Section 3: Evenhandedness
  it('includes evenhandedness guidance', () => {
    expect(prompt).toMatch(/balanced/i);
    expect(prompt).toMatch(/charitable/i);
  });

  // Section 4: Responding to mistakes
  it('includes mistake-handling guidance', () => {
    expect(prompt).toMatch(/mistake/i);
    expect(prompt).toMatch(/honest/i);
  });

  // Section 5: Doing tasks (general purpose)
  it('describes general-purpose task execution', () => {
    expect(prompt).toMatch(/research/i);
    expect(prompt).toMatch(/analysis/i);
    expect(prompt).toMatch(/writing/i);
  });

  it('does not include SE-specific guidance', () => {
    expect(prompt).not.toContain('solving bugs');
    expect(prompt).not.toContain('refactoring code');
    expect(prompt).not.toContain('linting');
  });

  // Section 6: Professional objectivity (kept from OpenCode)
  it('includes professional objectivity', () => {
    expect(prompt).toMatch(/accuracy/i);
    expect(prompt).toMatch(/disagree/i);
  });

  // Section 7: Task management / TodoWrite (kept from OpenCode)
  it('includes task management guidance', () => {
    expect(prompt).toMatch(/TodoWrite|task management|multi-step/i);
  });

  // Section 8: Tool usage policy (kept from OpenCode)
  it('includes tool usage guidance', () => {
    expect(prompt).toMatch(/tool/i);
    expect(prompt).toMatch(/parallel/i);
  });

  // Section 9: Clarification guidance
  it('includes clarification guidance', () => {
    expect(prompt).toMatch(/clarif/i);
    expect(prompt).toMatch(/scope|format|depth/i);
  });

  // Size constraints
  it('is under 5000 characters (reasonable agent prompt size)', () => {
    expect(prompt.length).toBeLessThan(5000);
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npm test tests/prompts/cowork-agent-prompt.test.js`
Expected: FAIL — `Cannot find module '../../src/prompts/cowork-agent-prompt'`

---

### Task 2: Create cowork-agent-prompt.js — Implementation

**Files:**
- Create: `src/prompts/cowork-agent-prompt.js`

**Step 1: Create prompts directory**

Run: `mkdir -p src/prompts`

**Step 2: Write the implementation**

```javascript
// src/prompts/cowork-agent-prompt.js
/**
 * Cowork Agent Prompt
 *
 * Replaces OpenCode's SE-focused base prompt when client === 'cowork'.
 * Blends cowork-style behavioral guidance with operational mechanics.
 *
 * Reference: docs/plans/2026-03-05-cowork-client-prompt-design.md
 */

/**
 * Build the full cowork agent prompt for the chat agent.
 * This replaces the OpenCode provider base prompt (gemini_default, anthropic_default, etc.)
 * when client === 'cowork'.
 *
 * @returns {string} Complete agent prompt
 */
function buildCoworkAgentPrompt() {
  return [
    buildIdentity(),
    buildToneAndFormatting(),
    buildEvenhandedness(),
    buildRespondingToMistakes(),
    buildDoingTasks(),
    buildProfessionalObjectivity(),
    buildTaskManagement(),
    buildToolUsage(),
    buildClarificationGuidance()
  ].join('\n\n');
}

function buildIdentity() {
  return `# Identity

You are Sidecar, a versatile assistant brought into conversations to provide a second perspective, do research, or work on tasks in parallel. You may be helping alongside another AI agent or working independently on a delegated task.

You are not Claude Code, not OpenCode, and not a coding-only tool. Your scope is whatever the user needs: research, analysis, writing, code review, brainstorming, or any other task.`;
}

function buildToneAndFormatting() {
  return `# Tone & Formatting

Write in natural prose — conversational paragraphs, not CLI-style brevity. Use the minimum formatting needed to be clear and readable. Avoid over-formatting with bold emphasis, headers, lists, and bullet points unless the content genuinely requires structure.

In casual conversation, keep responses short (a few sentences). For reports and explanations, write in prose paragraphs rather than bullet lists. Only use lists when the person asks for them or when the content is genuinely multifaceted.

Do not use emojis unless the person uses them or asks for them. Use a warm tone. Treat users with kindness and avoid negative assumptions about their abilities.`;
}

function buildEvenhandedness() {
  return `# Evenhandedness

When asked to explain, discuss, or argue for a position, present the best case that defenders of that position would give, even if you disagree. Frame this as the case others would make. End by presenting opposing perspectives or empirical disputes.

Engage with moral and political questions as sincere, good-faith inquiries. Be charitable, reasonable, and accurate. Avoid being heavy-handed when sharing views — offer alternative perspectives to help the user navigate topics for themselves.`;
}

function buildRespondingToMistakes() {
  return `# Responding to Mistakes

When you make mistakes, own them honestly and work to fix them. Acknowledge what went wrong, stay focused on solving the problem, and maintain self-respect. Avoid collapsing into excessive apology or self-abasement. The goal is steady, honest helpfulness.`;
}

function buildDoingTasks() {
  return `# Doing Tasks

The user may request research, analysis, writing, code review, brainstorming, problem-solving, or any other task. For non-trivial work, follow this flow:

1. **Understand** — Read the request carefully. What is actually being asked?
2. **Plan** — For multi-step work, outline your approach before starting.
3. **Execute** — Do the work. Use tools when they help.
4. **Verify** — Check your work before presenting it.

You have access to files and tools in the user's project. Use them to ground your work in reality rather than speculation.`;
}

function buildProfessionalObjectivity() {
  return `# Professional Objectivity

Prioritize accuracy over validation. If the user's assumption is wrong, say so clearly and explain why. Do not agree with incorrect statements to be agreeable. When you disagree, explain your reasoning.

That said, distinguish between objective facts and matters of judgment. On judgment calls, present your perspective while acknowledging alternatives.`;
}

function buildTaskManagement() {
  return `# Task Management

For multi-step tasks, use TodoWrite to track progress. This helps both you and the user understand what has been done and what remains.

Create tasks when work involves 3 or more distinct steps. Mark tasks as in_progress when you start them and completed when done. Skip TodoWrite for simple single-step responses.`;
}

function buildToolUsage() {
  return `# Tool Usage

Use the right tool for each job:
- Read files with the Read tool (not cat or head)
- Search file names with Glob (not find or ls)
- Search file contents with Grep (not grep or rg)
- Edit files with Edit (not sed or awk)
- Create new files with Write

When multiple tool calls are independent, make them in parallel for efficiency. Use the Agent tool for broad exploration that may require multiple rounds of searching.

Reserve Bash for system commands and terminal operations that have no dedicated tool.`;
}

function buildClarificationGuidance() {
  return `# Clarification

Before starting multi-step work, consider whether you need to clarify scope, format, or depth. Ask one question at a time — avoid overwhelming the user with multiple questions.

Skip clarification when:
- The request is clear and specific
- It is a simple factual question
- You already clarified earlier in the conversation`;
}

module.exports = { buildCoworkAgentPrompt };
```

**Step 3: Run tests to verify they pass**

Run: `npm test tests/prompts/cowork-agent-prompt.test.js`
Expected: PASS — all assertions green

**Step 4: Commit**

```bash
git add src/prompts/cowork-agent-prompt.js tests/prompts/cowork-agent-prompt.test.js
git commit -m "feat: add cowork agent prompt for client-aware system prompt"
```

---

### Task 3: Wire prompt into opencode-client.js — Failing Tests

**Files:**
- Modify: `tests/sidecar/setup.test.js` (add new describe block at end)

We need to test that `startServer()` conditionally adds `chat.prompt` when `options.client === 'cowork'`. Since `startServer()` calls the real SDK, we mock it to capture the config.

**Step 1: Write failing tests**

Add to the end of `tests/sidecar/setup.test.js` (or create a new test file if cleaner):

Create: `tests/opencode-client-cowork.test.js`

```javascript
// tests/opencode-client-cowork.test.js
/**
 * Tests for client-aware prompt in opencode-client.js startServer()
 */

// Mock SDK before requiring
jest.mock('@opencode-ai/sdk', () => ({
  createOpencodeServer: jest.fn(async (opts) => ({
    url: 'http://127.0.0.1:3456',
    close: jest.fn()
  })),
  createOpencodeClient: jest.fn(async () => ({
    config: { get: jest.fn() }
  }))
}), { virtual: true });

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

describe('startServer client-aware prompt', () => {
  let startServer;
  let createOpencodeServer;

  beforeEach(() => {
    jest.resetModules();

    // Re-mock SDK fresh
    jest.mock('@opencode-ai/sdk', () => ({
      createOpencodeServer: jest.fn(async (opts) => ({
        url: 'http://127.0.0.1:3456',
        close: jest.fn()
      })),
      createOpencodeClient: jest.fn(async () => ({
        config: { get: jest.fn() }
      }))
    }), { virtual: true });

    startServer = require('../../src/opencode-client').startServer;
    createOpencodeServer = require('@opencode-ai/sdk').createOpencodeServer;
  });

  it('sets chat.prompt when client is cowork', async () => {
    await startServer({ client: 'cowork' });

    expect(createOpencodeServer).toHaveBeenCalledTimes(1);
    const passedOpts = createOpencodeServer.mock.calls[0][0];
    const chatAgent = passedOpts.config.agent.chat;

    expect(chatAgent).toBeDefined();
    expect(chatAgent.prompt).toBeDefined();
    expect(typeof chatAgent.prompt).toBe('string');
    expect(chatAgent.prompt).toContain('Sidecar');
  });

  it('does NOT set chat.prompt when client is code-local', async () => {
    await startServer({ client: 'code-local' });

    const passedOpts = createOpencodeServer.mock.calls[0][0];
    const chatAgent = passedOpts.config.agent.chat;

    expect(chatAgent).toBeDefined();
    expect(chatAgent.prompt).toBeUndefined();
  });

  it('does NOT set chat.prompt when client is undefined', async () => {
    await startServer({});

    const passedOpts = createOpencodeServer.mock.calls[0][0];
    const chatAgent = passedOpts.config.agent.chat;

    expect(chatAgent).toBeDefined();
    expect(chatAgent.prompt).toBeUndefined();
  });

  it('preserves existing chat agent permissions when cowork', async () => {
    await startServer({ client: 'cowork' });

    const passedOpts = createOpencodeServer.mock.calls[0][0];
    const chatAgent = passedOpts.config.agent.chat;

    expect(chatAgent.permission).toEqual({
      edit: 'ask',
      bash: 'ask',
      webfetch: 'allow'
    });
    expect(chatAgent.mode).toBe('primary');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test tests/opencode-client-cowork.test.js`
Expected: FAIL — `chat.prompt` is undefined (not yet implemented)

---

### Task 4: Wire prompt into opencode-client.js — Implementation

**Files:**
- Modify: `src/opencode-client.js:1` (add require at top)
- Modify: `src/opencode-client.js:275-299` (update `startServer()`)

**Step 1: Implement the changes**

In `src/opencode-client.js`, update the `startServer()` function:

1. Add `client` to the options destructuring (around line 275).
2. After building the `chat` agent config object, conditionally add `prompt` when `client === 'cowork'`.

Change the `startServer` function at lines 275-316 to:

```javascript
async function startServer(options = {}) {
  const createOpencodeServer = await getCreateOpencodeServer();

  // Build config object for SDK
  const config = {};
  if (options.mcp) {
    config.mcp = options.mcp;
  }
  if (options.model) {
    config.model = options.model;
  }

  // Register custom 'chat' agent: reads auto-approved, writes/bash require permission
  const chatAgent = {
    description: 'Conversational agent — reads are auto-approved, writes and commands require permission',
    mode: 'primary',
    permission: {
      edit: 'ask',
      bash: 'ask',
      webfetch: 'allow'
    }
  };

  // When launched from Cowork, replace the SE-focused base prompt with a general-purpose one
  if (options.client === 'cowork') {
    const { buildCoworkAgentPrompt } = require('./prompts/cowork-agent-prompt');
    chatAgent.prompt = buildCoworkAgentPrompt();
  }

  config.agent = {
    ...(config.agent || {}),
    chat: chatAgent
  };

  const serverOptions = {
    hostname: options.hostname || '127.0.0.1',
    port: options.port,
    signal: options.signal
  };

  // Only add config if we have settings
  if (Object.keys(config).length > 0) {
    serverOptions.config = config;
  }

  const server = await createOpencodeServer(serverOptions);
  const client = await createClient(server.url);

  return { client, server };
}
```

**Step 2: Run tests to verify they pass**

Run: `npm test tests/opencode-client-cowork.test.js`
Expected: PASS

**Step 3: Run full test suite to check for regressions**

Run: `npm test`
Expected: All existing tests still pass

**Step 4: Commit**

```bash
git add src/opencode-client.js tests/opencode-client-cowork.test.js
git commit -m "feat: conditionally set cowork prompt on chat agent when client=cowork"
```

---

### Task 5: Pass `client` through session-utils.js → opencode-client.js

**Files:**
- Modify: `src/sidecar/session-utils.js:178-200` (`startOpenCodeServer()`)

The `startOpenCodeServer()` function in session-utils.js currently only passes `mcp` to `startServer()`. It needs to also pass `client`.

**Step 1: Write failing test**

Create: `tests/sidecar/session-utils-client.test.js`

```javascript
// tests/sidecar/session-utils-client.test.js
/**
 * Tests for client parameter passthrough in startOpenCodeServer
 */

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('../../src/utils/path-setup', () => ({
  ensureNodeModulesBinInPath: jest.fn()
}));

jest.mock('../../src/utils/server-setup', () => ({
  ensurePortAvailable: jest.fn()
}));

jest.mock('../../src/headless', () => ({
  waitForServer: jest.fn(async () => true)
}));

const mockStartServer = jest.fn(async () => ({
  client: { config: { get: jest.fn() } },
  server: { url: 'http://127.0.0.1:3456', close: jest.fn() }
}));
const mockCheckHealth = jest.fn(async () => true);

jest.mock('../../src/opencode-client', () => ({
  startServer: mockStartServer,
  checkHealth: mockCheckHealth
}));

const { startOpenCodeServer } = require('../../src/sidecar/session-utils');

describe('startOpenCodeServer client passthrough', () => {
  beforeEach(() => {
    mockStartServer.mockClear();
  });

  it('passes client option to startServer when provided', async () => {
    await startOpenCodeServer(null, { client: 'cowork' });

    expect(mockStartServer).toHaveBeenCalledWith(
      expect.objectContaining({ client: 'cowork' })
    );
  });

  it('does not set client when not provided', async () => {
    await startOpenCodeServer(null);

    const passedOpts = mockStartServer.mock.calls[0][0];
    expect(passedOpts.client).toBeUndefined();
  });

  it('passes both mcp and client when both provided', async () => {
    const mcpConfig = { myServer: { command: 'test' } };
    await startOpenCodeServer(mcpConfig, { client: 'code-local' });

    expect(mockStartServer).toHaveBeenCalledWith(
      expect.objectContaining({
        mcp: mcpConfig,
        client: 'code-local'
      })
    );
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test tests/sidecar/session-utils-client.test.js`
Expected: FAIL — `startOpenCodeServer` signature doesn't accept second arg / doesn't pass `client`

**Step 3: Implement the change**

In `src/sidecar/session-utils.js`, update `startOpenCodeServer()` (lines 178-200):

Change the function signature and body:

```javascript
/**
 * Start OpenCode server, wait for health, return client+server.
 * Shared by headless and interactive modes.
 *
 * @param {object} [mcpConfig] - Optional MCP server configuration
 * @param {object} [options] - Additional options
 * @param {string} [options.client] - Client type ('cowork', 'code-local', 'code-web')
 * @returns {Promise<{client: object, server: object}>}
 * @throws {Error} If server fails to start or health check fails
 */
async function startOpenCodeServer(mcpConfig, options = {}) {
  const { checkHealth, startServer } = require('../opencode-client');
  const { ensureNodeModulesBinInPath } = require('../utils/path-setup');
  const { ensurePortAvailable } = require('../utils/server-setup');
  const { waitForServer } = require('../headless');

  ensureNodeModulesBinInPath();
  ensurePortAvailable();

  const serverOptions = {};
  if (mcpConfig) { serverOptions.mcp = mcpConfig; }
  if (options.client) { serverOptions.client = options.client; }

  const { client, server } = await startServer(serverOptions);
  logger.debug('OpenCode server started', { url: server.url });

  const ready = await waitForServer(client, checkHealth);
  if (!ready) {
    server.close();
    throw new Error('OpenCode server failed to become ready');
  }

  return { client, server };
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test tests/sidecar/session-utils-client.test.js`
Expected: PASS

**Step 5: Run full suite**

Run: `npm test`
Expected: All tests pass (existing callers pass `undefined` for second arg — default `{}` handles it)

**Step 6: Commit**

```bash
git add src/sidecar/session-utils.js tests/sidecar/session-utils-client.test.js
git commit -m "feat: pass client option through startOpenCodeServer to startServer"
```

---

### Task 6: Pass `client` from start.js → startOpenCodeServer

**Files:**
- Modify: `src/sidecar/start.js:148` (in `runInteractive()`)

Currently `runInteractive()` calls `startOpenCodeServer(mcp)`. It needs to also pass `{ client }`.

**Step 1: Update runInteractive() in start.js**

In `src/sidecar/start.js`, the `runInteractive()` function (line 133) needs:

1. Accept `client` in the options parameter (line 142).
2. Pass it to `startOpenCodeServer()` (line 148).

Change line 142 from:
```javascript
  const { agent, isResume, conversation, mcp, reasoning, opencodeSessionId } = options;
```
to:
```javascript
  const { agent, isResume, conversation, mcp, reasoning, opencodeSessionId, client } = options;
```

Change line 148 from:
```javascript
    const result = await startOpenCodeServer(mcp);
```
to:
```javascript
    const result = await startOpenCodeServer(mcp, { client });
```

Then in `startSidecar()` (line 341), pass `client` to `runInteractive()`:

Change line 341-343 from:
```javascript
      result = await runInteractive(
        model, systemPrompt, userMessage, taskId, effectiveProject,
        { agent, mcp: mcpServers, reasoning }
      );
```
to:
```javascript
      result = await runInteractive(
        model, systemPrompt, userMessage, taskId, effectiveProject,
        { agent, mcp: mcpServers, reasoning, client }
      );
```

**Step 2: Verify no test regressions**

Run: `npm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/sidecar/start.js
git commit -m "feat: pass client option from startSidecar through to OpenCode server"
```

---

### Task 7: Update agent-mapping.js comment

**Files:**
- Modify: `src/utils/agent-mapping.js:23`

**Step 1: Update the comment**

Change line 23 from:
```javascript
// 'chat' is a custom sidecar agent: reads auto, writes/bash ask
```
to:
```javascript
// 'chat' is a custom sidecar agent: reads auto, writes/bash ask. When client=cowork, gets a general-purpose prompt.
```

**Step 2: Commit**

```bash
git add src/utils/agent-mapping.js
git commit -m "docs: update chat agent comment to note cowork prompt behavior"
```

---

### Task 8: Update documentation — CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add `src/prompts/cowork-agent-prompt.js` to Directory Structure**

In the directory structure section, add under `src/`:
```
│   ├── prompts/                 # Prompt modules
│   │   └── cowork-agent-prompt.js  # Cowork client agent prompt (replaces SE base)
```

**Step 2: Add to Key Modules table**

In the "Supporting Modules" table, add a row:
```
| `prompts/cowork-agent-prompt.js` | Cowork agent prompt | `buildCoworkAgentPrompt()` — replaces SE-focused OpenCode base prompt when `client === 'cowork'` |
```

**Step 3: Update OpenCode Integration Principles section**

In the "What We Built (Unique Value)" table, add:
```
| **Client-aware prompt** | Cowork needs general-purpose, not SE-focused | `prompts/cowork-agent-prompt.js` sets `chat` agent `prompt` field |
```

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add cowork-agent-prompt to CLAUDE.md directory structure and modules"
```

---

### Task 9: Update documentation — README.md and SKILL.md

**Files:**
- Modify: `README.md` (near the top, after "What is this?")
- Modify: `skill/SKILL.md` (in the `sidecar_start` tool docs)

**Step 1: Add client-awareness note to README.md**

After the "Why?" section (around line 17), add a new section:

```markdown
### Adaptive Personality

When launched from Cowork, sidecar adapts its persona from a coding assistant to a general-purpose helper. Research, analysis, writing, brainstorming — it matches the context of how it was invoked.

- **From Claude Code** (`--client code-local`): SE-focused prompting (debug, implement, review code)
- **From Cowork** (`--client cowork`): General-purpose prompting (research, analyze, write, brainstorm)
```

**Step 2: Add `--client` flag to SKILL.md**

In the `sidecar start` command's "Optional" parameters section, add:

```markdown
- `--client <type>`: Client entry point (`code-local`, `code-web`, `cowork`). Affects system prompt personality. Default: `code-local`.
```

**Step 3: Commit**

```bash
git add README.md skill/SKILL.md
git commit -m "docs: document --client flag and adaptive personality in README and SKILL.md"
```

---

### Task 10: Final Verification

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass (966+ tests)

**Step 2: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 3: Verify file sizes**

Run: `wc -l src/prompts/cowork-agent-prompt.js src/opencode-client.js src/sidecar/session-utils.js src/sidecar/start.js`
Expected: All under 300 lines

**Step 4: Smoke test (manual)**

Run: `node -e "const { buildCoworkAgentPrompt } = require('./src/prompts/cowork-agent-prompt'); const p = buildCoworkAgentPrompt(); console.log('Length:', p.length); console.log('Has Sidecar:', p.includes('Sidecar')); console.log('Has OpenCode:', p.includes('OpenCode'));"`
Expected: `Length: ~2500, Has Sidecar: true, Has OpenCode: false`
