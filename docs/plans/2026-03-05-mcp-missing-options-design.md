# Design: MCP Missing Options (Context Filtering + Summary Length)

**Date:** 2026-03-05
**Scope:** Additive wiring of 6 CLI options into MCP tool schemas and handlers

---

## Problem

The MCP server exposes `sidecar_start` and `sidecar_continue` tools but is missing several CLI options that users need to control context size and output verbosity. These options are fully implemented in the CLI but never exposed through the MCP interface.

## Scope

**Not included:** `--mcp`, `--mcp-config`, `--no-mcp`, `--exclude-mcp` (MCP-within-MCP not needed for Cowork users). `--all` on `sidecar_list` (the CLI implementation is a stub — `read.js` accepts but ignores the flag).

## Changes

### 1. `src/mcp-tools.js` — Schema additions

**`sidecar_start`** — add 4 fields to `inputSchema`:

| Field | Type | Maps to | Default |
|---|---|---|---|
| `contextTurns` | `z.number().optional()` | `--context-turns` | 50 |
| `contextSince` | `z.string().optional()` | `--context-since` | — |
| `contextMaxTokens` | `z.number().optional()` | `--context-max-tokens` | 80000 |
| `summaryLength` | `z.enum(['brief','normal','verbose']).optional()` | `--summary-length` | normal |

**`sidecar_continue`** — add 2 fields to `inputSchema`:

| Field | Type | Maps to | Default |
|---|---|---|---|
| `contextTurns` | `z.number().optional()` | `--context-turns` | — |
| `contextMaxTokens` | `z.number().optional()` | `--context-max-tokens` | 80000 |

### 2. `src/mcp-server.js` — Handler wiring

**`sidecar_start` handler** — 4 new conditional arg pushes after existing args:
```js
if (input.contextTurns)     { args.push('--context-turns', String(input.contextTurns)); }
if (input.contextSince)     { args.push('--context-since', input.contextSince); }
if (input.contextMaxTokens) { args.push('--context-max-tokens', String(input.contextMaxTokens)); }
if (input.summaryLength)    { args.push('--summary-length', input.summaryLength); }
```

**`sidecar_continue` handler** — 2 new conditional arg pushes:
```js
if (input.contextTurns)     { args.push('--context-turns', String(input.contextTurns)); }
if (input.contextMaxTokens) { args.push('--context-max-tokens', String(input.contextMaxTokens)); }
```

## Testing (TDD — Red First)

### `tests/mcp-tools.test.js`
- Schema presence tests for each of the 6 new fields
- Verify correct Zod types and optionality

### `tests/mcp-server.test.js`
- Spawn arg tests using `jest.isolateModulesAsync` + `jest.doMock`
- Verify `--context-turns`, `--context-since`, `--context-max-tokens`, `--summary-length` appear in spawned CLI args for `sidecar_start`
- Verify `--context-turns`, `--context-max-tokens` appear in spawned CLI args for `sidecar_continue`

## No New Files, No New Modules

This is purely additive wiring. The CLI already validates all values — invalid inputs will cause the spawned CLI process to exit with an error and the session metadata will not be created (detectable via `sidecar_status`).
