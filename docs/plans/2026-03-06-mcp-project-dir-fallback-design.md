# Design: Smart Project Directory Fallback for MCP Server

**Date:** 2026-03-06
**Status:** Approved
**Problem:** Sidecar MCP server fails in Claude Cowork because `process.cwd()` returns `/` (root), and the VM sandbox blocks writing to `/.claude/sidecar_sessions/`.

## Root Cause

`getProjectDir()` in `mcp-server.js` unconditionally returns `process.cwd()`. Claude Desktop/Cowork spawns the MCP server process without setting a specific working directory, so `cwd` can be `/` or another unwritable location.

## Solution: Fallback Chain

Replace the one-liner `getProjectDir()` with a smart fallback:

```
getProjectDir(explicitProject) ->
  1. explicitProject (if provided and directory exists)
  2. process.cwd() (if not "/" and is writable)
  3. os.homedir() (final fallback)
```

## Changes

### 1. `src/mcp-server.js` - `getProjectDir()`

Replace:
```js
function getProjectDir() { return process.cwd(); }
```

With a function that accepts an optional explicit path and falls through the chain. Log a warning when falling back from `cwd`.

### 2. `src/mcp-tools.js` - Add `project` parameter

Add an optional `project` string parameter to all tools that use a project directory:
- `sidecar_start`
- `sidecar_status`
- `sidecar_read`
- `sidecar_list`
- `sidecar_resume`
- `sidecar_continue`
- `sidecar_abort`

Schema description: "Optional project directory path. Auto-detected if omitted."

### 3. `src/mcp-server.js` - Wire `input.project`

Pass `input.project` to `getProjectDir()` in each handler. Most handlers already accept a `project` parameter internally.

## What Doesn't Change

- CLI behavior (always has a real `cwd`)
- Session directory structure (`<base>/.claude/sidecar_sessions/<taskId>/`)
- Existing local sessions remain project-scoped

## Error Behavior

- `process.cwd()` returns `/` or unwritable -> `logger.warn()` + fall back to `$HOME`
- No hard errors; always resolves to a writable path

## Testing

- Unit test `getProjectDir()` with:
  - Explicit project path (valid, invalid)
  - `process.cwd()` returning `/` (triggers fallback)
  - `process.cwd()` returning valid path (no fallback)
  - No explicit project + bad cwd (falls to `$HOME`)
- Existing MCP server and tool tests should pass unchanged
