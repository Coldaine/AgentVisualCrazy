# Test Suite Audit — AgentVisualCrazy

**Generated:** 2026-06-02. **Method:** 4 independent reviewer agents graded every test file across all 49 test files. Each agent read the test *and* the production source it claims to exercise, then assigned a letter grade A–F and a verdict: **REAL** / **WEAK** / **FICTION**.

This audit reflects the state of `main` **after** PR #100 (`test/audit-followup-rewrites`), which addressed the prior audit's worst offenders.

## Headline

- **49 files · 430 test cases (427 regular + 3 live).**
- **REAL 387 (90%) · WEAK 43 (10%) · FICTION 0 (0%).**
- **No FICTION tests remain.** All F/D cases from the prior audit were deleted or rewritten in PR #100.
- The prior audit's claim that "normalizer.ts has zero direct coverage" is **false** — `capture.test.ts`, `normalizer-derive-seam.test.ts`, `e2e-jsonl-to-state.test.ts`, and `harness-driver.test.ts` all directly exercise the normalizer.
- The prior audit's claim that "deriveState payload.args file-path branch never exercised" is **false** — `normalizer-derive-seam.test.ts:12-33` and `e2e-jsonl-to-state.test.ts` both test this path.

## Grade Distribution

| Grade | Files | Description |
|-------|------:|-------------|
| A (Excellent) | 14 | Excellent coverage, meaningful failure modes, edge cases |
| B (Good) | 20 | Good main-path coverage + some edge cases |
| C (Adequate) | 10 | Main paths covered, missing edge cases or shallow assertions |
| D (Minimal) | 4 | Minimal wiring checks, would catch deletions but not regressions |
| F (Broken) | 0 | None |

## Remaining Weak Points

### Grade D/WEAK files (need strengthening)

| File | Grade | Issue |
|------|-------|-------|
| `tests/electron/start-main-process.test.ts` | C/WEAK | Everything mocked. No real Electron IPC exercised. Tests wiring contracts, not behavior. |
| `tests/electron/start-main-process-privacy.test.ts` | C/WEAK | All modules mocked. Single test checks argument flow, not behavioral outcome. |
| `tests/electron/renderer-host.test.ts` | C/WEAK | Bridge entirely hand-mocked. 14 lines of production code under test. |
| `tests/renderer/renderer-surface-adapter.test.ts` | D/REAL | 1 test with identity checks. Would catch deletions but not behavioral regressions. |
| `tests/renderer/host.test.ts` | D/REAL | 1 test for static host. Missing `createBridgeHost` or populated capabilities. |
| `tests/capture/ipc-bridge.test.ts` | D/REAL | 2 tests for `markDirty`. Missing shadow:snapshot, events-since, debounce/push flow for 145-line file. |
| `tests/renderer/record-2d-context.test.ts` | B/WEAK | Tests the test helper itself. 33 tests validate the mock proxy, not src/ code. |

### Logging infrastructure (architectural concern)

`tests/instrumentation-sampling.test.ts` spies on `console.log` to verify log events because:

1. `StructuredLogger` has **no interface** — only a concrete class. Proposes adding `interface Logger`.
2. Modules create loggers at **module scope** (`createLogger()` at import time) — no DI injection point.
3. The memory ring buffer (`getRecent()`) is the cleanest test surface, but test code can't reach the module-scope singleton instances.

The `vi.hoisted` + `SHADOW_LOG_LEVEL=debug` + `console.log` spy is a pragmatic workaround, but a proper `Logger` interface + constructor injection would eliminate it. See `docs/plans/plan-testing-observability.md` for the proposed redesign.

## Previous Audit Comparison

| Metric | Pre-PR #100 | Post-PR #100 | Delta |
|--------|-------------|--------------|-------|
| FICTION tests | 38 (11%) | 0 (0%) | -38 |
| WEAK tests | 124 (35%) | 43 (10%) | -81 |
| D-grade files | 30 | 4 | -26 |
| F-grade files | 11 | 0 | -11 |
| Snapshot size (scene-snapshots) | 19,313 lines | ~5,000 lines | -14,000 |
