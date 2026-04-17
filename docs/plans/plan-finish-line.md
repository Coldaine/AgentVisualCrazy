# Finish-Line Plan

> Last updated: 2026-04-17
>
> Purpose: capture the current branch / issue state of `shadow-agent`, identify the
> remaining work to finish the repo, and give a clean sequence for closing the last
> open items without creating bookkeeping drift.

---

## Why this exists

The implementation work is no longer a single linear feature branch. It is now a set of
branch-backed workstreams with open PRs, a few remaining test gaps, and some historical
files that can easily drift out of sync if we do not keep a written inventory.

This document is the source of truth for the **finish line**, not the original feature
plans. It tells us:
- what is already committed and pushed,
- which issues are still open,
- where the remaining code lives,
- and what order to finish / validate / merge things in.

---

## Current state snapshot

### Already committed and pushed

| Issue(s) | Branch / PR | Status |
|---|---|---|
| #8 | `work/canvas-renderer-v2` | Canvas2D renderer implementation branch exists; test coverage still pending in #24 |
| #9 | `work/event-capture` | Live capture pipeline branch exists and is pushed |
| #10–#17 | `work/inference-engine` / PR #28 | Inference stack and MCP server are implemented and pushed |
| #18–#19 | `work/observability` / PR #30 | Logger hardening and structured instrumentation are pushed |
| #20, #25 | `work/test-phase1` / PR #29 | Phase 1 edge tests + shared fixture corpus are pushed |
| #22 | `work/renderer-tests` / PR #31 | Electron + renderer contract tests are pushed |
| #23 | `work/inference-tests` / PR #32 | Inference contract tests are pushed |

### Still open

| Issue | What remains |
|---|---|
| #21 | Phase 2 capture tests: incremental parser, session discovery, event buffer, watcher, session manager |
| #24 | Canvas2D command tests + curated visual regression fixtures |

---

## Finish-line sequence

### 1) Close the capture pipeline tests (`#21`)

Work from `work/event-capture` and add the tests the plan already calls for:
- incremental parser coverage for split chunks, CRLF, malformed recovery
- session discovery against a mock `~/.claude/projects/` tree
- event buffer ring behavior: eviction order, `getSince()`, subscriptions
- watcher append / truncate / rotation behavior
- session-manager orchestration with fake IPC

Use the shared fixture corpus under `shadow-agent/tests/fixtures/` so the tests do not invent
one-off data.

### 2) Close the Canvas2D test track (`#24`)

Work from `work/canvas-renderer-v2` and finish the test safety net around the renderer:
- build a recorded 2D context helper
- cover hex nodes, bezier edges, particle trails, simulation timing, and bloom semantics
- add a small curated screenshot set for canonical scenes
- keep the tests headless and deterministic

The existing branch already contains the renderer implementation files; the remaining job is
verification and regression protection, not a wholesale rewrite.

### 3) Reconcile bookkeeping as each branch lands

After each branch is verified:
- update `docs/todo.md` so completed items are not still shown as pending
- append a short note to `docs/history/log.md` with the branch / PR / test result
- keep the branch-to-issue mapping current in the PR body so the next person does not need
  to reverse-engineer the history from commit messages

### 4) Final integration gate

Before calling the project done:
- `npm test`
- `npm run build`
- check that the checkout is clean (`git status --short`)
- verify no stray untracked renderer/canvas artifacts remain in the working tree
- make sure the PR set can be merged in dependency order without cross-branch surprises

---

## Dependency / merge order

A safe order is:
1. `#21` capture tests
2. `#24` canvas command tests / visual regressions
3. final docs / bookkeeping sync
4. merge remaining PRs in dependency order

If any branch needs a rebase, do that before opening review on the dependent branch.

---

## Risks to watch

- **Documentation drift**: plan docs and `docs/todo.md` can fall behind pushed branches.
- **Orphaned working-tree files**: canvas files can appear in the wrong checkout if branch
  switches are not cleaned up.
- **Branch confusion**: multiple work branches are already open; always name the branch and
  issue number in commit messages and PR bodies.
- **Test scope creep**: the remaining work is test-centric. Avoid expanding it into new
  features unless a failing test proves the feature is missing.

---

## Definition of done

The repository is at the finish line when all of the following are true:
- every open issue has a clear branch / PR / status
- the only remaining work is intentional follow-up, not drift
- the checkout is clean
- `npm test` and `npm run build` pass
- docs reflect the actual branch state
- no one has to ask "which branch had that thing again?"

If that last question comes up, the answer should already be in this file.
