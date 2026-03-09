# MCP Passthrough Design
<!-- Date: 2026-03-09 -->

## Problem

Sidecar should automatically inherit the MCP servers active in the parent Claude session. There are two distinct parent clients with different config locations, and the current discovery logic is incomplete:

1. **Claude Code CLI** — `discoverClaudeCodeMcps()` only reads the plugins path. It is missing `~/.claude.json` → `mcpServers`, which is the primary location for servers added via `claude mcp add`.
2. **Cowork / Claude Desktop** — `discoverCoworkMcps()` reads `claude_desktop_config.json` correctly. No changes needed.

There are also no tests proving the discovery pipeline works end-to-end.

---

## MCP Source Map (confirmed from local machine scan)

| Client | Source | Location |
|--------|--------|----------|
| Claude Code CLI | Manually added servers | `~/.claude.json` → `mcpServers` |
| Claude Code CLI | Plugin-installed servers | `~/.claude/plugins/cache/<plugin>/<version>/.mcp.json` (enabled plugins only) |
| Cowork / Claude Desktop | Desktop app config | `~/Library/Application Support/Claude/claude_desktop_config.json` → `mcpServers` |

---

## Changes Required

### 1. Fix `discoverClaudeCodeMcps()` in `src/utils/mcp-discovery.js`

Add `~/.claude.json` → `mcpServers` as the **first** discovery source, merged before plugin-installed servers. Explicit CLI-added servers take priority over plugin-installed ones on name collision.

Merge order (highest → lowest priority):
1. `~/.claude.json` → `mcpServers`
2. Enabled plugins → `.mcp.json` entries

Auto-exclude `sidecar` entry in both sources (already done for plugins; add for CLI source).

No changes to `discoverCoworkMcps()`.

### 2. Client routing (already correct in `buildMcpConfig()`)

```
clientType === 'code'    → discoverClaudeCodeMcps()   (fix this function)
clientType === 'cowork'  → discoverCoworkMcps()        (no change)
```

---

## Tests

### Integration test — `tests/mcp-discovery.test.js`

Tests the full pipeline without network or API keys. Runs on every push.

**Test 1 — `discoverClaudeCodeMcps()` reads `~/.claude.json`**
- Write a temp `~/.claude.json`-style fixture with a repomix-style entry
- Call `discoverClaudeCodeMcps({ claudeJsonPath: tempPath })`
- Assert returned object contains the entry

**Test 2 — `discoverClaudeCodeMcps()` merges plugins + claude.json, claude.json wins on collision**
- Fixture: same server name in both sources with different commands
- Assert the `~/.claude.json` version wins

**Test 3 — `discoverCoworkMcps()` reads `claude_desktop_config.json`**
- Write temp config with a repomix entry
- Call `discoverCoworkMcps(tempDir)`
- Assert correct entry returned

**Test 4 — `buildMcpConfig()` with `clientType: 'code'` produces correct merged config**
- Mock `discoverClaudeCodeMcps` to return a known fixture
- Assert `buildMcpConfig()` output includes the fixture entry

**Test 5 — `buildServerOptions()` normalizes Claude Desktop format → OpenCode SDK format**
- Input: `{ tavily: { command: 'npx', args: ['-y', 'tavily-mcp'], env: { TAVILY_API_KEY: 'test' } } }`
- Assert output: `{ tavily: { type: 'local', enabled: true, command: ['npx', '-y', 'tavily-mcp'], env: { TAVILY_API_KEY: 'test' } } }`

**Test 6 — `sidecar` entry is auto-excluded from both sources**
- Include `sidecar` in both `~/.claude.json` fixture and plugin fixture
- Assert it is absent from the final merged config

### E2E test — `tests/mcp-repomix-e2e.integration.test.js`

Proves the tool is reachable inside a real sidecar session. Skipped unless `OPENROUTER_API_KEY` is set. Not run in standard `npm test`.

**Setup:**
- Uses the real `~/.claude.json` on the machine (repomix installed as a plugin, discoverable via CLI path)
- Spawns a headless sidecar with `clientType: 'code'`

**Prompt:**
> "Use the repomix MCP tool to pack the current directory. Report the total number of files packed."

**Assertions:**
- Fold output is non-empty
- Output contains evidence of repomix tool invocation (file count number, or repomix-specific output text)
- Session status is `complete` (not `crashed` or `error`)

**Script:** `npm run test:e2e:mcp` — runs only this file with a 3-minute Jest timeout.

---

## Non-Goals

- Exposing `--mcp` / `--no-mcp` / `--exclude-mcp` as parameters on the `sidecar_start` MCP tool schema (separate feature)
- Reading project-level `.claude/settings.json` for MCP servers (not observed in use)
- Windows path support for Cowork config (out of scope)

---

## Files Changed

| File | Change |
|------|--------|
| `src/utils/mcp-discovery.js` | Add `~/.claude.json` → `mcpServers` source to `discoverClaudeCodeMcps()` |
| `tests/mcp-discovery.test.js` | New — integration tests (6 tests) |
| `tests/mcp-repomix-e2e.integration.test.js` | New — E2E test with real repomix |
| `package.json` | Add `test:e2e:mcp` script |
| `CLAUDE.md` | Update test file table |
