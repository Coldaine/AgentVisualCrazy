# Master Plan A — Must-Do Forward Items

> Last updated: 2026-04-19 (status refresh after PRs #29, #31, #32, #34, #35 merged)
> Derived from: Architecture critique investigation + PR review audit + Documentation audit
> Scope: Everything that MUST happen before the project can ship
>
> **Status snapshot:** PRs #29, #31, #32, #34, #35 are merged. Remaining open PRs are
> #26 (Canvas2D renderer), #27 (live capture), #28 (inference engine — *note:*
> inference scaffolding actually landed via PR #28 on 2026-04-12; see history log),
> #30 (observability), and #33 (docs/finish-line). The RepoVis archival and domain
> status-header work called out in [the Documentation Remediation section](#3-documentation-remediation-must-do)
> below are **done** and kept here for historical traceability — do not re-execute.

---

## Executive Summary

After investigating all 9 architectural critique claims against the actual codebase:
- **5 of 9 claims are ALREADY ADDRESSED** (Electron coupling, third-party boundaries,
  typed contracts, privacy/redaction, prompt sync mechanism)
- **3 of 9 are PARTIALLY ADDRESSED** (fs.watch lives on PR #27 branch, ring buffer
  lives on PR #27 branch, watcher tests deferred to Phase 2)
- **1 is VALID** (documentation describes Phase 2+ features as if they exist on main)

The codebase is architecturally sound. The gap is between what exists on feature branches
vs. what's merged to main, and between documentation aspirations vs. current state.

---

## 1) PR Comment Remediation (per-PR fix lists)

These are the actionable review comments that MUST be addressed before merge.

### PR #29 — Fixtures + Phase 1 Tests (merge FIRST)
| Fix | Files | Severity |
|-----|-------|----------|
| Replace `import.meta.dirname` with `fileURLToPath(import.meta.url)` | 4 test files | Medium — portability |
| Make `makeEvent()` deterministic (counter IDs, fixed timestamps) | `tests/derive.test.ts` | Low — flake risk |
| Fix fixture README event count: "~12" → "9" | `tests/fixtures/README.md` | Low — accuracy |
| Add out-of-order + duplicate-ID derive test cases | `tests/derive.test.ts` | Medium — coverage gap |
| Fix risk-escalation fixture `is_error` field | `tests/fixtures/transcripts/risk-escalation.jsonl` | Low |

### PR #26 — Canvas2D Renderer
| Fix | Files | Severity |
|-----|-------|----------|
| **D3 tick closure stale nodes** (P1) — use `simRef.current.nodes()` | `CanvasRenderer.tsx:389` | HIGH — rendering bug |
| **ctx.stroke(hex)** (P1) — stroke the Path2D explicitly | `CanvasRenderer.tsx:131` | HIGH — visual bug |
| Move module-scope mutable state to component refs | `CanvasRenderer.tsx:282` | Medium — HMR/strict-mode |
| Keep riskLevelRef/latestInsightRef synced via useEffect | `CanvasRenderer.tsx:292` | Medium — stale props |
| DPR-aware canvas resize (devicePixelRatio) | `CanvasRenderer.tsx:418` | Medium — blurry HiDPI |
| Stop D3 simulation on unmount cleanup | `CanvasRenderer.tsx:425` | Medium — CPU leak |
| Remove dead `stateWaiting` color or wire through consistently | `theme/colors.ts:16` | Low — dead code |
| CSS grid selector clash on `.panel--graph` | `styles.css:848` | Medium — layout |
| Use `getShadowAgentBridge()` instead of direct `window.shadowAgent` | `App.tsx:152` | Low — error quality |
| Deduplicate formatClock/toLabel/safeFileName helpers | `App.tsx:11` | Low — DRY |
| Fix `dialog.showOpenDialog(null!)` → `undefined` | `session-io.ts:149,173` | Medium — Electron crash |
| Evaluate `.npmrc legacy-peer-deps` necessity | `.npmrc` | Low |

### PR #31 — Renderer Tests
| Fix | Files | Severity |
|-----|-------|----------|
| Protect `globalThis.window` cleanup with `finally` | `start-main-process.test.ts:190` | Low — test isolation |
| Normalize replay fixture `file_path` → `filePath` | `happy-path.replay.jsonl:5` | Medium — contract |
| Replace `import.meta.dirname` with `fileURLToPath` | `start-main-process.test.ts:117` | Medium — portability |
| Bridge test should exercise real preload | `start-main-process.test.ts:180` | Low — contract drift |
| Fix app-state.ts comment (useReducer lazy initializer) | `app-state.ts:6` | Low — comment accuracy |
| Fix PR description test count 16 → 14 | PR body only | Low |

### PR #32 — Inference Contract Tests
| Fix | Files | Severity |
|-----|-------|----------|
| **payload.tool → payload.toolName** (P1) | `context-packager.ts:78` | HIGH — wrong field |
| **Budget enforcement after final assembly** (P1) | `context-packager.ts:125` | HIGH — oversized packets |
| Fix fixture README event count | `tests/fixtures/README.md` | Low |
| Move FakeInferenceClient to dedicated helper | `inference-contract.test.ts:64` | Medium — side-effect |
| Replace `import.meta.dirname` | `inference-contract.test.ts:245` | Medium — portability |
| Fix test payload shape to use `toolName` not `tool` | `inference-contract.test.ts:214` | Medium — contract |
| Extract inline parser to production code or import real | `inference-contract.test.ts:314` | Low — test drift |

### PR #33 — Finish-Line Plan
| Fix | Files | Severity |
|-----|-------|----------|
| Add `cd shadow-agent` to npm commands | `plan-finish-line.md` | Low — accuracy |
| Fix markdown ordered-list numbering | `plan-finish-line.md:74` | Low — lint |

### PRs #27, #28, #30 — No blocking inline comments found
These have REVIEW_REQUIRED status. No actionable code fixes needed — just need review approval.

### Stream B — Doc Coordination & PR #34

- **PR #34 (`fix/master-plan-remediation`)** contains the consolidated Master Plans A and B.
- **Decision**: PR #34 should be **retargeted to `main`**. 
- It represents the definitive architectural response and go-forward plan for the entire project.
- Merging it to `main` establishes the "Command & Control" center for all subsequent feature branch merges.

---

## 2) Merge Sequence (dependency-safe)

```
#29 (fixtures)
  ├─→ #26 (canvas renderer)
  │     └─→ #31 (renderer tests)
  ├─→ #27 (capture pipeline)
  │     └─→ #28 (inference engine)
  │           └─→ #32 (inference tests)
  └─→ #30 (observability)
                    └─→ #33 (docs)
```

For each PR: address comments → rebase on main → `npm test` + `npm run build` → merge.

---

## 3) Documentation Remediation (must-do)

### High Priority — DONE 2026-04-18/19 (kept for audit trail)
1. ~~Remove empty temp file `docs/plans/temp/restructure-plan.md`~~ — done, directory removed.
2. ~~Archive RepoVis docs~~ — done. Files live at `docs/plans/archives/repovis/`
   (`README.md`, `repovis-build-prompts.md`, `repovis-original-spec.md`,
   `repovis-creative-alternatives.md`).
3. ~~Add implementation status headers to domain docs~~ — done and subsequently
   normalized to a unified schema (`Status: Planned` / `Status: Partial on main` /
   `Status: Landed on main`) in the drift-remediation pass.

### Medium Priority
4. **Update `docs/history/log.md`** with entries since 2026-04-01:
   - PRs #26-#33 opened
   - Architecture critique received and investigated
   - Master coordination plan written
5. **Reconcile `docs/todo.md`** — mark items that have PRs as "in progress" with PR links
6. **Add architecture.md "Current Phase" section** distinguishing Phase 1 (implemented)
   from Phase 2+ (planned/in-PR)

### Low Priority (post-merge)
7. Add `docs/getting-started.md` (setup, test, run)
8. Archive `visual-inspiration-catalog.md` and `visual-patterns-citadel.md` after PR #26
   lands and patterns are evaluated

---

## 4) Pre-Commit / CI — RESOLVED

Previously the `prompts:check` pre-commit hook at `.husky/pre-commit` was failing
because `docs/prompts/shadow-system-prompt.md` was out of date. Resolved via
PR #34 (regenerated prompt artifacts) and PR #35 (hook now also runs
`npm test --prefix shadow-agent`). The active hook still lives at
`.husky/pre-commit`; see [`AGENTS.md`](../../AGENTS.md) for the prompt-sync
workflow. No further action required here.

---

## 5) Missing Issue PRs (#21 and #24)

After merge sequence completes:
- **Issue #21** (Phase 2 capture tests): Branch from main (post-#27 merge), write
  watcher/parser/buffer tests, open + merge PR
- **Issue #24** (Canvas2D command tests): Branch from main (post-#26 merge), write
  Canvas2D recorded-context + visual regression tests, open + merge PR

---

## Definition of Done

- [x] Documentation cleaned up (RepoVis archived, status headers added, history updated — drift-remediation pass)
- [x] `npm test` and `npm run build` pass on main (PR #35)
- [x] `npm run prompts:check` passes (pre-commit hook unblocked — PR #34/#35)
- [x] `docs/todo.md` reconciled, `docs/history/log.md` current (drift-remediation pass)
- [ ] Remaining open PRs (#26 canvas renderer, #27 live capture, #30 observability, #33 docs finish-line) have review comments addressed
- [ ] #26 and #27 merged to main — these are the actual product features
- [ ] Issues #21 and #24 implemented via new PRs and merged (blocked on #26/#27)
- [ ] All 18 original issues (#8-#25) closed
