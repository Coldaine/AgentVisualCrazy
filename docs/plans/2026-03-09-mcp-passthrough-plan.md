# MCP Passthrough Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix `discoverClaudeCodeMcps()` to also read `~/.claude.json` → `mcpServers` (servers added via `claude mcp add`), and add integration + E2E tests proving the full pipeline works.

**Architecture:** `discoverClaudeCodeMcps()` currently only reads the plugin chain. We add a second source (`~/.claude.json` → `mcpServers`) that is merged first — so explicit CLI-added servers take priority over plugin-installed ones on name collision. The function accepts an optional `claudeJsonPath` override for testability. All other pipeline code (`buildMcpConfig`, `buildServerOptions`) is already correct.

**Tech Stack:** Node.js, CommonJS (`require`), Jest, `fs`/`os`/`path` (no new deps)

---

## Context You Need

- **Source to fix:** `src/utils/mcp-discovery.js` — `discoverClaudeCodeMcps(claudeDir)` function (lines 47-119)
- **Existing tests to extend:** `tests/mcp-discovery.test.js` — already tests plugin discovery; add new `describe` blocks for `~/.claude.json` source and merge priority
- **New E2E test file:** `tests/mcp-repomix-e2e.integration.test.js`
- **`~/.claude.json` structure:** Top-level `mcpServers` key, same format as Claude Desktop config: `{ "server-name": { "command": "...", "args": [...] } }`
- **Repomix plugin config** (already on this machine): `{ "command": "npx", "args": ["-y", "repomix@latest", "--mcp"] }` — discoverable via plugin chain in `~/.claude/plugins/cache/repomix/`
- **`sidecar` must always be auto-excluded** from discovered servers to prevent infinite spawn loops
- **Function signature change:** `discoverClaudeCodeMcps(claudeDir, claudeJsonPath)` — add optional second param for testability. Default: `path.join(os.homedir(), '.claude.json')`

---

## Task 1: Add failing tests for `~/.claude.json` source

**Files:**
- Modify: `tests/mcp-discovery.test.js`

Add a new `describe('discoverClaudeCodeMcps — claude.json source')` block inside the existing `describe('MCP Discovery')`. Place it after the existing `discoverClaudeCodeMcps` describe block (after line 317).

**Step 1: Add the failing tests**

Add this block to `tests/mcp-discovery.test.js` inside the outer `describe('MCP Discovery')`:

```javascript
describe('discoverClaudeCodeMcps — claude.json source', () => {
  function makeClaudeDir(claudeDir) {
    // Minimal plugin chain so the function doesn't bail early
    const pluginsDir = path.join(claudeDir, 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, 'settings.json'),
      JSON.stringify({ enabledPlugins: {} })
    );
    fs.writeFileSync(
      path.join(pluginsDir, 'installed_plugins.json'),
      JSON.stringify({ plugins: {} })
    );
  }

  test('reads mcpServers from ~/.claude.json', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    makeClaudeDir(claudeDir);

    const claudeJsonPath = path.join(tmpDir, 'claude.json');
    fs.writeFileSync(claudeJsonPath, JSON.stringify({
      mcpServers: {
        'google-workspace': {
          type: 'stdio',
          command: 'node',
          args: ['/path/to/workspace-server/dist/index.js'],
          env: {}
        }
      }
    }));

    loadModule();
    const result = discoverClaudeCodeMcps(claudeDir, claudeJsonPath);
    expect(result).not.toBeNull();
    expect(result['google-workspace']).toBeDefined();
    expect(result['google-workspace'].command).toBe('node');
  });

  test('claude.json mcpServers win on name collision with plugin', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    const pluginsDir = path.join(claudeDir, 'plugins');
    const installDir = path.join(tmpDir, 'collision-plugin');
    fs.mkdirSync(pluginsDir, { recursive: true });
    fs.mkdirSync(installDir, { recursive: true });

    fs.writeFileSync(
      path.join(claudeDir, 'settings.json'),
      JSON.stringify({ enabledPlugins: { 'collision-plugin': true } })
    );
    fs.writeFileSync(
      path.join(pluginsDir, 'installed_plugins.json'),
      JSON.stringify({ plugins: { 'collision-plugin': { installPath: installDir } } })
    );
    // Plugin registers 'my-server' with command 'plugin-cmd'
    fs.writeFileSync(
      path.join(installDir, '.mcp.json'),
      JSON.stringify({ 'my-server': { command: 'plugin-cmd', args: [] } })
    );

    // claude.json also has 'my-server' with command 'cli-cmd' — should win
    const claudeJsonPath = path.join(tmpDir, 'claude.json');
    fs.writeFileSync(claudeJsonPath, JSON.stringify({
      mcpServers: {
        'my-server': { command: 'cli-cmd', args: [] }
      }
    }));

    loadModule();
    const result = discoverClaudeCodeMcps(claudeDir, claudeJsonPath);
    expect(result).not.toBeNull();
    expect(result['my-server'].command).toBe('cli-cmd');
  });

  test('merges claude.json servers with plugin servers', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    const pluginsDir = path.join(claudeDir, 'plugins');
    const installDir = path.join(tmpDir, 'merge-plugin');
    fs.mkdirSync(pluginsDir, { recursive: true });
    fs.mkdirSync(installDir, { recursive: true });

    fs.writeFileSync(
      path.join(claudeDir, 'settings.json'),
      JSON.stringify({ enabledPlugins: { 'merge-plugin': true } })
    );
    fs.writeFileSync(
      path.join(pluginsDir, 'installed_plugins.json'),
      JSON.stringify({ plugins: { 'merge-plugin': { installPath: installDir } } })
    );
    fs.writeFileSync(
      path.join(installDir, '.mcp.json'),
      JSON.stringify({ 'plugin-server': { command: 'npx', args: ['@plugin/mcp'] } })
    );

    const claudeJsonPath = path.join(tmpDir, 'claude.json');
    fs.writeFileSync(claudeJsonPath, JSON.stringify({
      mcpServers: {
        'cli-server': { command: 'node', args: ['server.js'] }
      }
    }));

    loadModule();
    const result = discoverClaudeCodeMcps(claudeDir, claudeJsonPath);
    expect(result).not.toBeNull();
    expect(result['plugin-server']).toBeDefined();
    expect(result['cli-server']).toBeDefined();
  });

  test('excludes sidecar entry from claude.json', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    makeClaudeDir(claudeDir);

    const claudeJsonPath = path.join(tmpDir, 'claude.json');
    fs.writeFileSync(claudeJsonPath, JSON.stringify({
      mcpServers: {
        'sidecar': { command: 'sidecar', args: ['mcp'] },
        'real-server': { command: 'node', args: ['server.js'] }
      }
    }));

    loadModule();
    const result = discoverClaudeCodeMcps(claudeDir, claudeJsonPath);
    expect(result).not.toBeNull();
    expect(result['sidecar']).toBeUndefined();
    expect(result['real-server']).toBeDefined();
  });

  test('returns plugin servers when claude.json is absent', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    const pluginsDir = path.join(claudeDir, 'plugins');
    const installDir = path.join(tmpDir, 'only-plugin');
    fs.mkdirSync(pluginsDir, { recursive: true });
    fs.mkdirSync(installDir, { recursive: true });

    fs.writeFileSync(
      path.join(claudeDir, 'settings.json'),
      JSON.stringify({ enabledPlugins: { 'only-plugin': true } })
    );
    fs.writeFileSync(
      path.join(pluginsDir, 'installed_plugins.json'),
      JSON.stringify({ plugins: { 'only-plugin': { installPath: installDir } } })
    );
    fs.writeFileSync(
      path.join(installDir, '.mcp.json'),
      JSON.stringify({ 'plugin-only-server': { command: 'npx' } })
    );

    const missingPath = path.join(tmpDir, 'nonexistent.json');

    loadModule();
    const result = discoverClaudeCodeMcps(claudeDir, missingPath);
    expect(result).not.toBeNull();
    expect(result['plugin-only-server']).toBeDefined();
  });

  test('returns null when both claude.json absent and no enabled plugins', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    makeClaudeDir(claudeDir);

    const missingPath = path.join(tmpDir, 'nonexistent.json');

    loadModule();
    const result = discoverClaudeCodeMcps(claudeDir, missingPath);
    expect(result).toBeNull();
  });
});
```

**Step 2: Run tests to confirm they fail**

```bash
cd /Users/john_renaldi/claude-code-projects/sidecar
npm test tests/mcp-discovery.test.js 2>&1 | tail -20
```

Expected: 6 new tests FAIL with something like `TypeError: discoverClaudeCodeMcps is not a function` or wrong result because the implementation doesn't accept a second param yet.

---

## Task 2: Implement the `~/.claude.json` source in `discoverClaudeCodeMcps()`

**Files:**
- Modify: `src/utils/mcp-discovery.js` (lines 47-119)

**Step 1: Update the function signature and add claude.json reading**

Replace the entire `discoverClaudeCodeMcps` function (lines 47-119) with:

```javascript
/**
 * Discover MCP servers from Claude Code's plugin chain AND ~/.claude.json.
 *
 * Discovery sources (merged, in priority order):
 * 1. ~/.claude.json → mcpServers  (servers added via `claude mcp add`)
 * 2. Enabled plugins → .mcp.json entries
 *
 * @param {string} [claudeDir] - Path to ~/.claude directory (for testing)
 * @param {string} [claudeJsonPath] - Path to ~/.claude.json (for testing)
 * @returns {object|null} Merged MCP server configs, or null if none found
 */
function discoverClaudeCodeMcps(claudeDir, claudeJsonPath) {
  const baseDir = claudeDir || path.join(os.homedir(), '.claude');
  const jsonPath = claudeJsonPath || path.join(os.homedir(), '.claude.json');

  // Source 1: ~/.claude.json → mcpServers (servers added via `claude mcp add`)
  let claudeJsonServers = {};
  try {
    if (fs.existsSync(jsonPath)) {
      const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      if (raw.mcpServers && typeof raw.mcpServers === 'object') {
        claudeJsonServers = raw.mcpServers;
        logger.debug('Read MCP servers from ~/.claude.json', {
          serverCount: Object.keys(claudeJsonServers).length
        });
      }
    }
  } catch (err) {
    logger.debug('Failed to read ~/.claude.json', { error: err.message });
  }

  // Source 2: Plugin chain (settings.json → installed_plugins.json → .mcp.json)
  let pluginServers = {};

  try {
    const settingsPath = path.join(baseDir, 'settings.json');
    if (!fs.existsSync(settingsPath)) {
      // No settings.json — skip plugin discovery, may still have claude.json servers
      const merged = { ...claudeJsonServers };
      delete merged.sidecar;
      return Object.keys(merged).length > 0 ? merged : null;
    }
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    const enabledPlugins = settings.enabledPlugins;
    if (!enabledPlugins || typeof enabledPlugins !== 'object') {
      const merged = { ...claudeJsonServers };
      delete merged.sidecar;
      return Object.keys(merged).length > 0 ? merged : null;
    }

    let installedPlugins = {};
    try {
      const pluginsDir = path.join(baseDir, 'plugins');
      const installedPath = path.join(pluginsDir, 'installed_plugins.json');
      if (fs.existsSync(installedPath)) {
        const installed = JSON.parse(fs.readFileSync(installedPath, 'utf-8'));
        installedPlugins = installed.plugins || {};
      }
    } catch (err) {
      logger.debug('Failed to read installed plugins', { error: err.message });
    }

    // Read blocklist
    let blocklist = [];
    try {
      const blocklistPath = path.join(baseDir, 'plugins', 'blocklist.json');
      if (fs.existsSync(blocklistPath)) {
        blocklist = JSON.parse(fs.readFileSync(blocklistPath, 'utf-8'));
        if (!Array.isArray(blocklist)) { blocklist = []; }
      }
    } catch {
      // Ignore blocklist read errors
    }

    for (const [pluginName, isEnabled] of Object.entries(enabledPlugins)) {
      if (!isEnabled) { continue; }
      if (blocklist.includes(pluginName)) {
        logger.debug('Skipping blocklisted plugin', { pluginName });
        continue;
      }

      const pluginInfo = installedPlugins[pluginName];
      if (!pluginInfo || !pluginInfo.installPath) { continue; }

      try {
        const mcpPath = path.join(pluginInfo.installPath, '.mcp.json');
        if (!fs.existsSync(mcpPath)) { continue; }
        const raw = JSON.parse(fs.readFileSync(mcpPath, 'utf-8'));
        const servers = normalizeMcpJson(raw);

        for (const [name, config] of Object.entries(servers)) {
          pluginServers[name] = config;
        }
      } catch (err) {
        logger.debug('Failed to read plugin MCP config', { pluginName, error: err.message });
      }
    }
  } catch (err) {
    logger.debug('Failed to read Claude Code settings', { error: err.message });
  }

  // Merge: plugin servers first, then claude.json overwrites (higher priority)
  const merged = { ...pluginServers, ...claudeJsonServers };

  // Always exclude sidecar itself to prevent recursive spawning
  delete merged.sidecar;

  return Object.keys(merged).length > 0 ? merged : null;
}
```

**Step 2: Run tests to confirm they pass**

```bash
npm test tests/mcp-discovery.test.js 2>&1 | tail -30
```

Expected: All tests PASS (existing + 6 new).

**Step 3: Commit**

```bash
git add src/utils/mcp-discovery.js tests/mcp-discovery.test.js
git commit -m "feat: read ~/.claude.json mcpServers in discoverClaudeCodeMcps

Servers added via 'claude mcp add' are stored in ~/.claude.json → mcpServers.
The function previously only read the plugin chain — now reads both sources,
with ~/.claude.json servers taking priority on name collision.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Add E2E test for real repomix MCP discovery

**Files:**
- Create: `tests/mcp-repomix-e2e.integration.test.js`

This test spawns a real headless sidecar and verifies repomix MCP is available inside it. Skipped when `OPENROUTER_API_KEY` is not set.

**Step 1: Write the E2E test file**

```javascript
/**
 * MCP Repomix E2E Test
 *
 * Proves that MCP servers discovered from the Claude Code plugin chain
 * are actually available and callable inside a headless sidecar session.
 *
 * Requires: OPENROUTER_API_KEY env var
 * Runtime: ~2-3 minutes (real LLM + real MCP tool call)
 * Run: npm run test:e2e:mcp
 */

const { startSidecar } = require('../src/sidecar/start');
const { readSidecar } = require('../src/sidecar/read');
const path = require('path');
const os = require('os');

const SKIP = !process.env.OPENROUTER_API_KEY;
const describeOrSkip = SKIP ? describe.skip : describe;

describeOrSkip('MCP Repomix E2E', () => {
  // 3 minutes — real LLM + real MCP call
  jest.setTimeout(3 * 60 * 1000);

  let taskId;

  test('headless sidecar discovers and calls repomix MCP tool', async () => {
    const result = await startSidecar({
      model: process.env.SIDECAR_E2E_MODEL || 'openrouter/google/gemini-2.5-flash',
      prompt: [
        'You have access to the repomix MCP tool.',
        `Use it to pack the directory: ${path.join(os.homedir(), 'claude-code-projects/sidecar/src')}`,
        'Report: (1) the total number of files packed, (2) the first filename listed in the output.',
        'If you cannot access the repomix tool, say exactly: "repomix tool not available"'
      ].join(' '),
      noUi: true,
      headless: true,
      timeout: 2,
      agent: 'build',
      clientType: 'code',
      project: path.join(os.homedir(), 'claude-code-projects/sidecar'),
      includeContext: false,
    });

    taskId = result?.taskId;

    expect(result).toBeDefined();
    expect(result.status).toBe('complete');
    expect(result.summary).toBeTruthy();

    const summary = result.summary.toLowerCase();
    expect(summary).not.toContain('repomix tool not available');

    // Evidence of actual repomix output: file count number or known repomix text
    const hasRepomixEvidence = (
      /\d+\s+files?/i.test(result.summary) ||
      /packed/i.test(result.summary) ||
      /repomix/i.test(result.summary) ||
      /\.js/i.test(result.summary)
    );
    expect(hasRepomixEvidence).toBe(true);
  });
});
```

**Step 2: Run the test to confirm it's wired up (will skip without key)**

```bash
npm test tests/mcp-repomix-e2e.integration.test.js 2>&1 | tail -10
```

Expected: `1 skipped` (because `OPENROUTER_API_KEY` may not be in the test env). If the key IS set, it runs the full test.

---

## Task 4: Add `test:e2e:mcp` script to `package.json`

**Files:**
- Modify: `package.json`

**Step 1: Add the script**

In `package.json`, inside the `"scripts"` block, add after the `"test"` line:

```json
"test:e2e:mcp": "jest tests/mcp-repomix-e2e.integration.test.js --testTimeout=180000 --forceExit",
```

**Step 2: Verify it runs**

```bash
npm run test:e2e:mcp 2>&1 | tail -10
```

Expected: Test runs (skipped or passing depending on env vars).

**Step 3: Commit**

```bash
git add tests/mcp-repomix-e2e.integration.test.js package.json
git commit -m "test: add MCP repomix E2E test and test:e2e:mcp script

Real headless sidecar E2E that verifies repomix MCP is discoverable and
callable via the Claude Code plugin chain. Skipped without OPENROUTER_API_KEY.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Update CLAUDE.md test file table

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add the new E2E test to the test file table**

Find the section `### What to Unit Test (Core Business Logic)` and the table within it. Add this row after the `mcp-headless-lifecycle.test.js` row:

```markdown
| `mcp-repomix-e2e.integration.test.js` | MCP E2E (real LLM + repomix) | Real discovery → headless sidecar → repomix tool call |
```

Also add a note to the `mcp-discovery.test.js` row to mention it now covers `~/.claude.json`:

Change:
```
| `mcp-discovery.test.js` | ... |
```
To:
```
| `mcp-discovery.test.js` | MCP discovery | Plugin chain, `~/.claude.json` mcpServers, merge priority, sidecar exclusion |
```

**Step 2: Run full test suite to confirm nothing broken**

```bash
npm test 2>&1 | tail -20
```

Expected: All tests pass. No regressions.

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md test table for MCP passthrough tests

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Verification

After all tasks complete, run:

```bash
# Full suite clean pass
npm test

# E2E manually (requires OPENROUTER_API_KEY)
OPENROUTER_API_KEY=<your-key> npm run test:e2e:mcp
```

The E2E test is the definitive proof: if repomix is called and returns file data, the entire pipeline — discovery → merge → normalization → OpenCode SDK → tool execution → fold — is verified working end-to-end.
