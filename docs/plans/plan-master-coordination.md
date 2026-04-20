# Master Coordination Plan — PR Closeout + Architecture Remediation + Doc Renewal

> Last updated: 2026-04-19 (closed out)
> Status: COMPLETE — all three work streams synthesized into:
>
> - `docs/plans/plan-master-a-must-do.md` (Stream A and doc remediation outputs)
> - `docs/plans/plan-master-b-architecture-opinion.md` (Stream B output)
> - `docs/history/log.md` (chronological record of what shipped)
>
> Preserved here as the audit trail of how the 2026-04-18 coordination was set up.
> Subagents originally appended findings under their designated sections; those
> findings have since been promoted into the two master plan docs above and the
> empty scratchpads removed. Do not treat this file as a live worklist.

---

## 0) Situation

The repo has **8 open PRs** (#26–#33) and **18 open issues** (#8–#25).
An external architecture review (GPT-5 Pro) raised substantive critiques about:

1. **File-tail capture brittleness** — fs.watch unreliable, no backpressure, no persistence
2. **Electron-first coupling** — limits general-purpose distribution
3. **Vendored third_party coupling** — no adapter boundary, maintenance burden
4. **Manual triple-sync of prompts** — brittle, CI-failing pre-commit hook
5. **No typed adapter contracts** — capture → inference → renderer lack formal interfaces
6. **Ring buffer limitations** — no spill-to-disk, no crash recovery
7. **Security/privacy defaults** — transcript redaction, credential storage, telemetry opt-in
8. **Testing gaps** — no watcher integration tests, no visual regression, contract test drift
9. **Documentation sprawl** — 6 research docs, 5 plan docs, 3 domain docs, many stale/overlapping

---

## 1) Work Streams (dispatched in parallel)

### Stream A — PR Review, Rebase & Merge Readiness

**Goal**: For each of the 8 open PRs, review all inline comments, address valid ones,
rebase onto main, and prepare for merge in dependency order.

**PR Review Comment Summary** (gathered from CodeRabbit, Copilot, Codex):

| PR | Status | Key Issues to Address |
|----|--------|----------------------|
| #29 | CHANGES_REQUESTED | import.meta.dirname → fileURLToPath (6 files); makeEvent determinism; fixture README event count (12→9); duplicate-ID/out-of-order derive coverage; risk-escalation fixture is_error field |
| #26 | CHANGES_REQUESTED | D3 tick closure stale nodes (P1); ctx.stroke(hex) (P1); module-scope mutable state → refs; riskLevelRef never updated; DPR-aware canvas resize; stateWaiting dead code; .npmrc legacy-peer-deps; session-io null→undefined; App.tsx direct window.shadowAgent; cleanup missing sim.stop(); CSS grid selector clash |
| #31 | CHANGES_REQUESTED | globalThis.window cleanup in finally; replay fixture file_path→filePath normalization; import.meta.dirname; bridge test doesn't exercise real preload; app-state.ts comment drift; test count 16→14 mismatch |
| #32 | CHANGES_REQUESTED | context-packager payload.tool→payload.toolName (P1); budget enforcement incomplete (P1); fixture README count; FakeInferenceClient side-effect export; import.meta.dirname; test payload shape mismatch; inline parser not production code |
| #33 | CHANGES_REQUESTED | Timestamp format; phrasing nitpick; npm commands need cd shadow-agent; markdown ordered-list lint |
| #27 | REVIEW_REQUIRED | No blocking comments found |
| #28 | REVIEW_REQUIRED | Rate-limited by CodeRabbit; no blocking inline comments found |
| #30 | REVIEW_REQUIRED | Rate-limited by CodeRabbit; no blocking inline comments found |

**Merge Order** (dependency-safe):
1. #29 (fixtures/test foundation)
2. #26 (canvas renderer → #8)
3. #27 (capture pipeline → #9)
4. #28 (inference engine → #10-#17)
5. #30 (observability → #18-#19)
6. #31 (renderer tests → #22)
7. #32 (inference tests → #23)
8. #33 (this plan + docs)

### Stream B — Architecture Critique Investigation

**Goal**: Systematically evaluate the 9 architecture concerns raised by the GPT-5 Pro
review against actual codebase state. Determine which are valid, which are already
addressed, and which need remediation.

**Claims to investigate**:
1. fs.watch reliability — is chokidar needed? What platforms are targeted?
2. Electron coupling — how deeply is Electron wired in? Can renderer be extracted?
3. third_party adapter boundaries — do adapters exist or is it raw coupling?
4. Prompt sync mechanism — what exactly breaks? Is the CI hook sufficient?
5. Typed contracts — do interface files exist between domains?
6. Ring buffer persistence — is spill-to-disk feasible for v1?
7. Privacy/redaction — does any sanitization code exist?
8. Watcher integration tests — what coverage exists in PR #27?
9. Documentation accuracy vs. actual code state

### Stream C — Documentation Audit & Renewal Design

**Goal**: Inventory all docs, identify stale/redundant/contradictory content,
design a unified documentation corpus, and propose removals + rewrites.

**Docs to audit**:
- `docs/north-star.md` — KEEP AS-IS (user requirement)
- `docs/architecture.md` — review for accuracy vs. implemented code
- `docs/domain-events.md` — review vs. capture/ code
- `docs/domain-gui.md` — review vs. renderer/ code
- `docs/domain-inference.md` — review vs. inference/ code
- `docs/todo.md` — reconcile with issue tracker (much is now implemented)
- `docs/plans/` — 5 plan docs + archives; many may be complete
- `docs/research/` — 6 research docs; value vs. maintenance burden
- `docs/prompts/` — generated file; check sync
- `docs/history/log.md` — check if current
- `docs/design/` — repovis-specific; relevance?
- `docs/repovis-build-prompts.md`, `docs/repovis-original-spec.md` — separate product; relevance?
- `AGENTS.md` — accuracy vs. current workflow
- `README.md` — accuracy vs. current state

**Preservation constraint**: `north-star.md` is untouchable.

---

## 2) Deliverables

After parallel streams complete, synthesize into:

### Master Plan A — "Must-Do Forward Items"
Concrete remediation tasks that must happen for the project to ship:
- PR comment fixes + merge sequence
- Critical architecture fixes (adapter contracts, prompt sync)
- Doc cleanup (remove stale, update inaccurate)

### Master Plan B — "Architecture Opinion & Approach"
The subagent's honest assessment of and recommended approach to:
- Whether Electron-first is the right call
- Whether file-tail capture is sufficient
- Whether the vendored third_party approach works
- Recommended architecture for v2
- What the project should NOT do right now

---

## 3) Subagent Scratchpad — promoted

The three parallel streams produced their findings on 2026-04-18 and those were
synthesized into the two master plan docs. The empty scratchpad sections that
previously lived here have been removed; see:

- Stream A (PR review / rebase / merge readiness) →
  [`plan-master-a-must-do.md`](plan-master-a-must-do.md) — the "PR Comment
  Remediation" and "Merge Sequence" sections.
- Stream B (architecture critique) →
  [`plan-master-b-architecture-opinion.md`](plan-master-b-architecture-opinion.md)
  in full.
- Stream C (documentation audit) →
  [`plan-master-a-must-do.md`](plan-master-a-must-do.md) — the "Documentation
  Remediation" section — and the subsequent drift-remediation PR (status
  headers normalized, section-sign cross-refs converted to Markdown links,
  RepoVis archive, history log rewrite).

---

## 4) Round 2 Dispatch — executed

1. ✅ Wrote Master Plan A and Master Plan B to `docs/plans/`.
2. ✅ Dispatched doc renewal work — RepoVis archived, domain status headers added,
   getting-started doc created (2026-04-18 via PR #34) and later normalized in the
   drift-remediation pass (2026-04-19).
3. ✅ Dispatched PR fix work — PRs #29, #31, #32, #34, #35 all merged 2026-04-19.
   Remaining open PRs (#26, #27, #30, #33) carry review-comment TODOs tracked
   under the "PR Comment Remediation" section of
   [`plan-master-a-must-do.md`](plan-master-a-must-do.md).
4. ✅ Final commit + push — closeout PR merged.
