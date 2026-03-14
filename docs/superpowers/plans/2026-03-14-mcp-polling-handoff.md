# MCP Shared Server Polling Integration - Handoff

**Date:** 2026-03-14
**Branch:** feature/memory-leak
**Worktree:** /Users/john_renaldi/claude-code-projects/sidecar-memory-leak

## Problem

The shared server MCP path (`sidecar_start` handler in `src/mcp-server.js`) creates sessions on the shared OpenCode server and sends prompts via `sendPromptAsync`, but lacks the polling/finalization loop that the per-process spawn path provides.

**Result:** Sessions start, the LLM processes them, but `sidecar_status` never sees completion because:
1. No background polling writes conversation data to disk
2. No progress tracking (messages, stage, latest activity)
3. No session finalization (status never transitions from 'running' to 'complete')
4. No summary extraction or fold detection

The per-process spawn path works by spawning a CLI process that runs `runHeadless()`, which handles ALL of this internally. The shared server path bypasses `runHeadless()` entirely.

## What's Done

All 3 layers of process lifecycle management are implemented:
- Layer 1 (Shared Server): `SharedServerManager` class works, lazy start, session tracking, supervisor
- Layer 2 (IdleWatchdog): Fully integrated into headless, interactive, opencode-client
- Layer 3 (Resume/Locks): Session locks, dead-process detection, crash handler cleanup

The gap is specifically in the MCP `sidecar_start` handler's shared server path.

## Options to Explore

### Option A: Background Polling Task per Session
Run a background polling loop (like `runHeadless()` does) for each session on the shared server. Would live in the MCP handler or a new module.

### Option B: Delegate to runHeadless() with Shared Server
Modify `runHeadless()` to accept an existing client/server instead of starting its own. The MCP handler would call `runHeadless()` but pass the shared server's client.

### Option C: SDK-Level Event Streaming
If the OpenCode SDK supports event streaming or completion callbacks, use those instead of polling.

## Key Constraint

The MCP handler must return immediately after `sidecar_start` (fire-and-forget). The polling must happen in the background, writing results to disk so `sidecar_status` can read them.
