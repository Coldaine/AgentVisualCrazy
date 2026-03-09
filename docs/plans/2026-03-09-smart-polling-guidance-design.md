# Smart Polling Guidance for MCP Sidecar

**Date:** 2026-03-09
**Status:** Approved

## Problem

When the calling LLM (Claude) uses sidecar MCP tools, it must decide when to poll `sidecar_status` for completion. Currently there's no guidance, so the LLM polls too frequently (e.g., every 5-10 seconds) even for tasks that take minutes. Each poll is a full tool-call round-trip that consumes tokens.

Additionally, interactive mode doesn't need polling at all since the user controls when to Fold, but nothing tells the LLM this.

## Solution

Three coordinated changes, all text/guidance-based with no new schema parameters:

### 1. Mode-Dependent Response Text in `sidecar_start`

**Interactive mode** (`noUi: false`): Response tells the LLM not to poll. Instead, tell the user to let it know when they've clicked Fold.

```json
{
  "taskId": "abc-123",
  "status": "running",
  "mode": "interactive",
  "message": "Sidecar opened in interactive mode. Do NOT poll for status. Tell the user: 'Let me know when you're done with the sidecar and have clicked Fold.' Then wait for the user to tell you. Use sidecar_read to get results once they confirm."
}
```

**Headless mode** (`noUi: true`): Response includes complexity tier guidance so the LLM can self-classify and pick an appropriate polling interval.

```json
{
  "taskId": "abc-123",
  "status": "running",
  "mode": "headless",
  "message": "Sidecar started in headless mode. Estimate task complexity before polling: quick tasks (questions, lookups) - first poll at 20s, then every 15-20s. Medium tasks (code review, debugging) - first poll at 30s, then every 30s. Heavy tasks (implementation, test generation, large refactors) - first poll at 45s, then every 45s. Use sidecar_status to check progress."
}
```

No `recommendedFirstPoll` or `recommendedInterval` fields. The LLM reads its own briefing, self-classifies, and applies the right tier. Hard numbers in structured fields risk anchoring the LLM on a single value regardless of actual complexity.

### 2. Dual Nudge for Interactive Mode

**Calling LLM side:** The `sidecar_start` response instructs the LLM to tell the user to inform it when the sidecar is done. If the user starts typing in the parent conversation without mentioning the sidecar, the LLM can infer they're likely done and either ask or call `sidecar_read`.

**Sidecar UI side (Electron):** After Fold is clicked and the summary is generated, a brief overlay/toast appears before the window closes:

> "Summary saved. Tell Claude you're done with the sidecar so it can read the results."

Shows for 2-3 seconds before window closes.

### 3. Guide Text and Tool Description Updates

**`sidecar_start` tool description** updated to mention mode-dependent behavior:

> "Returns a task ID immediately. For headless mode (noUi: true), estimate task complexity and poll sidecar_status accordingly. For interactive mode, do not poll. Wait for the user to tell you they've clicked Fold."

**`sidecar_guide` Async Workflow section** replaced with mode-split guidance:

```markdown
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

**`sidecar_status` tool description** updated to clarify it's primarily for headless mode.

## Files to Change

| File | Change |
|------|--------|
| `src/mcp-server.js` | Update `sidecar_start` handler response: mode-dependent message text |
| `src/mcp-tools.js` | Update `sidecar_start` description, `sidecar_status` description, `getGuideText()` async workflow section |
| `electron/main.js` | Add post-Fold overlay: "Summary saved. Tell Claude you're done..." (2-3s before close) |
| `skill/SKILL.md` | Update workflow sections to reflect interactive vs headless differences |
| `tests/mcp-server.test.js` | Update response text assertions for new messages |
| `tests/mcp-tools.test.js` | Update description/guide text assertions |

## What We're NOT Changing

- No new parameters to `sidecar_start` schema
- No changes to `sidecar_status` handler logic or response shape
- No changes to `headless.js` internal polling loop
- No changes to CLI mode behavior

## Complexity Tiers Reference

| Tier | Examples | First Poll | Interval |
|------|----------|------------|----------|
| Quick | Questions, lookups, short analysis | 20s | 15-20s |
| Medium | Code review, debugging, research | 30s | 30s |
| Heavy | Implementation, test generation, large refactors | 45s | 45s |

The LLM self-classifies based on the briefing it wrote. No structured complexity parameter needed.
