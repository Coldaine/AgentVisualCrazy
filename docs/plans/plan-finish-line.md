# Finish-Line Plan (Issue + PR Closeout, Beginning to End)

> Last updated: 2026-04-17
>
> Goal: resolve **all currently open issues** (`#8`–`#25`) and **all currently open PRs**
> (`#26`–`#33`) with a deterministic, dependency-safe sequence.

---

## 1) Success criteria

Project is considered "all the way home" when:
- all open issues `#8`–`#25` are closed with linked merge commits/PRs,
- all open PRs `#26`–`#33` are merged or intentionally closed with rationale,
- both remaining test workstreams (`#21`, `#24`) are implemented and merged,
- `shadow-agent` passes `npm test` and `npm run build` on `main`,
- docs are reconciled (`docs/todo.md` and append-only `docs/history/log.md`).

---

## 2) Live backlog inventory

### Open issue map (full set)

| Issue | Title (short) | Current resolution path | Closure condition |
|---|---|---|---|
| #8 | Canvas2D renderer port | PR #26 (`work/canvas-renderer-v2`) | Merge PR #26 |
| #9 | Live transcript watcher | PR #27 (`work/event-capture`) | Merge PR #27 |
| #10 | Inference auth loader | PR #28 (`work/inference-engine`) | Merge PR #28 |
| #11 | OpenCode inference client | PR #28 (`work/inference-engine`) | Merge PR #28 |
| #12 | Context packager | PR #28 (`work/inference-engine`) | Merge PR #28 |
| #13 | Prompt builder | PR #28 (`work/inference-engine`) | Merge PR #28 |
| #14 | Trigger engine | PR #28 (`work/inference-engine`) | Merge PR #28 |
| #15 | Inference orchestrator | PR #28 (`work/inference-engine`) | Merge PR #28 |
| #16 | Shadow MCP server | PR #28 (`work/inference-engine`) | Merge PR #28 |
| #17 | Anthropic fallback client | PR #28 (`work/inference-engine`) | Merge PR #28 |
| #18 | Logger hardening | PR #30 (`work/observability`) | Merge PR #30 |
| #19 | Instrumentation coverage | PR #30 (`work/observability`) | Merge PR #30 |
| #20 | Phase 1 edge coverage | PR #29 (`work/test-phase1`) | Merge PR #29 |
| #21 | Phase 2 capture tests | **New PR required** (from `work/event-capture`) | Merge new capture-test PR |
| #22 | Electron/renderer contracts | PR #31 (`work/renderer-tests`) | Merge PR #31 |
| #23 | Inference contract tests | PR #32 (`work/inference-tests`) | Merge PR #32 |
| #24 | Canvas2D command/visual tests | **New PR required** (from `work/canvas-renderer-v2`) | Merge new canvas-test PR |
| #25 | Shared fixture corpus | PR #29 (`work/test-phase1`) | Merge PR #29 |

### Open PR map (full set)

| PR | Title (short) | Branch | Planned action |
|---|---|---|---|
| #26 | Canvas2D renderer | `work/canvas-renderer-v2` | Merge after #29 baseline |
| #27 | Live capture pipeline | `work/event-capture` | Merge after #29 baseline |
| #28 | Inference engine + MCP | `work/inference-engine` | Merge after #27 |
| #29 | Fixtures + Phase 1 tests | `work/test-phase1` | Merge first (test/data foundation) |
| #30 | Logger + instrumentation | `work/observability` | Merge after #27 and #28 |
| #31 | Electron/renderer tests | `work/renderer-tests` | Merge after #26 |
| #32 | Inference contract tests | `work/inference-tests` | Merge after #28 |
| #33 | Finish-line docs plan | `docs/finish-line-plan` | Merge after operational work is queued/underway |

---

## 3) Execution sequence (beginning to end)

### Phase A — Foundation merge

1. Rebase PR #29 (`work/test-phase1`) on latest `main` if needed.
2. Run `shadow-agent` test/build gate on branch:
   ```bash
   cd shadow-agent
   npm test
   npm run build
   ```
3. Merge PR #29.
4. Close issues #20 and #25.

### Phase B — Core feature lines

5. Rebase and merge PR #26 (Canvas renderer).
6. Rebase and merge PR #27 (capture runtime).
7. Rebase and merge PR #28 (inference runtime).
   - For all of the above, ensure clean local gate:
     ```bash
     cd shadow-agent
     npm test
     npm run build
     ```

Then close issues:
- #8 (via #26)
- #9 (via #27)
- #10–#17 (via #28)

### Phase C — Observability and contract tests

8. Rebase and merge PR #30 (logger + instrumentation).
9. Rebase and merge PR #31 (renderer/electron contracts).
10. Rebase and merge PR #32 (inference contracts).

Each merge should follow the standard verification:
```bash
cd shadow-agent
npm test
npm run build
```

Then close issues:
- #18–#19 (via #30)
- #22 (via #31)
- #23 (via #32)

### Phase D — Create and land missing issue PRs

11. **Issue #21 (capture tests)**
    1. branch from latest capture line (prefer `work/event-capture` rebased on `main`),
    2. implement required tests from `docs/plans/plan-event-capture.md` and
       `docs/plans/plan-testing-observability.md`,
    3. open PR (new),
    4. run full test/build gate,
    5. merge PR,
    6. close issue #21.

12. **Issue #24 (Canvas2D command/visual regressions)**
    1. branch from latest canvas line (prefer `work/canvas-renderer-v2` rebased on `main`),
    2. implement recorded-2D-command tests + curated snapshot fixtures,
    3. open PR (new),
    4. run full test/build gate,
    5. merge PR,
    6. close issue #24.

### Phase E — Final docs + bookkeeping + hygiene

13. Merge PR #33 (this plan doc).
14. Update `docs/todo.md` entries with dated closure notes (`YYYY-MM-DD: ...`).
15. Append closeout entries to `docs/history/log.md` (append-only).
16. Delete merged remote branches (or mark retained long-lived branches explicitly).
17. Final `main` gate:
    - `npm test`
    - `npm run build`
    - clean working tree (`git status --short` empty)

---

## 4) Dependency constraints

- `#29` should land before `#26`, `#27`, `#31`, `#32` because it establishes shared
  fixtures and test baselines used by later tracks.
- `#31` should land after `#26` (renderer contract relevance).
- `#32` should land after `#28` (inference contract relevance).
- `#21` must be implemented after `#27` is merged (tests target capture runtime).
- `#24` must be implemented after `#26` is merged (tests target Canvas2D runtime).

---

## 5) Risks and mitigation

- **Doc drift**: keep issue/PR references in PR bodies and update `docs/todo.md` immediately after merge.
- **Cross-branch conflicts**: rebase each branch right before merge; do not batch stale merges.
- **Untracked renderer artifacts**: enforce clean-tree checks before and after each branch switch.
- **False-green tests**: run full gate (`npm test` + `npm run build`) on each integration PR before merge.

---

## 6) Closure checklist (single page)

- [ ] PR #29 merged → issues #20, #25 closed
- [ ] PR #26 merged → issue #8 closed
- [ ] PR #27 merged → issue #9 closed
- [ ] PR #28 merged → issues #10–#17 closed
- [ ] PR #30 merged → issues #18–#19 closed
- [ ] PR #31 merged → issue #22 closed
- [ ] PR #32 merged → issue #23 closed
- [ ] New PR for #21 merged → issue #21 closed
- [ ] New PR for #24 merged → issue #24 closed
- [ ] PR #33 merged
- [ ] `docs/todo.md` reconciled with dated entries
- [ ] `docs/history/log.md` appended with closeout log
- [ ] `main` passes full build/test gate
- [ ] no open issue remains in `#8`–`#25`
- [ ] no unresolved open PR remains in `#26`–`#33`
