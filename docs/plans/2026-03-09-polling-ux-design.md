# Design: Polling UX Improvements

**Date:** 2026-03-09
**Status:** Approved

## Problem

In real sessions, Claude pattern-matched "handle this end-to-end" and set `noUi: true` without considering that the user might benefit from watching live. It then polled `sidecar_status` ~40 times in 2.5 minutes (~3s intervals) despite initial guidance recommending 45s intervals.

Two root causes:
1. No structured nudge toward interactive mode in `sidecar_start`
2. `sidecar_status` responses contain no polling reminder — the LLM sees guidance once at launch, then nothing mid-loop

## Solution: Option B

### Change 1: Mode routing guidance in `sidecar_start` description

Add an explicit decision framework at the top of the `sidecar_start` description:

> **Mode selection:** Use interactive (default) for research, exploration, analysis, and any task where the user benefits from watching progress live. Use headless (`noUi: true`) only for background automation the user does NOT need to monitor. When in doubt, use interactive — it eliminates the polling problem entirely.

### Change 2: `next_poll` field in headless status responses

`sidecar_status` adds a `next_poll` object **only when**:
- `metadata.headless === true` (session was started with `noUi: true`)
- `status === 'running'`

Interactive sessions receive no `next_poll` field.

**Adaptive timing:**

| Condition | `recommended_wait_seconds` |
|-----------|---------------------------|
| `stage === 'prompt_sent'` | 30 |
| elapsed < 3 min | 45 |
| elapsed 3–8 min | 30 |
| elapsed ≥ 8 min | 15 |

**Response shape:**
```json
{
  "taskId": "6baaec6f",
  "status": "running",
  "elapsed": "1m 3s",
  "messages": 1,
  "stage": "receiving",
  "next_poll": {
    "recommended_wait_seconds": 45,
    "hint": "Task is actively running. Wait ~45s before next poll."
  }
}
```

### Change 3: Store `headless` flag in session metadata

`metadata.json` gains a `headless: boolean` field, written at session start when `noUi === true`. This allows the status handler to detect headless mode without reading other files.

## Files Changed

| File | Change |
|------|--------|
| `src/mcp-tools.js` | Add mode routing text to `sidecar_start` description |
| `src/mcp-server.js` | Add `next_poll` logic to `sidecar_status` handler |
| `src/sidecar/start.js` or `src/session-manager.js` | Store `headless` flag in metadata at session creation |
| `tests/mcp-tools.test.js` | Assert new description text is present |
| `tests/mcp-server.test.js` | Assert `next_poll` present/absent under correct conditions |

## What Was Rejected

- **Option A (description only):** Doesn't fix in-loop polling; guidance disappears after first tool call
- **Option C (progress estimates):** LLM task progress is hard to estimate accurately; could mislead

## Testing Strategy (TDD)

Tests to write before implementation:
1. `sidecar_start` description contains mode routing text
2. `sidecar_status` includes `next_poll` when `headless: true` + `status: running`
3. `sidecar_status` omits `next_poll` when `headless: false` (interactive)
4. `sidecar_status` omits `next_poll` when `headless: true` + `status: complete`
5. Adaptive timing: `prompt_sent` → 30s, elapsed <3m → 45s, 3-8m → 30s, ≥8m → 15s
