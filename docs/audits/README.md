# Test Suite Audit — AgentVisualCrazy

**Generated:** 2026-05-30. **Method:** 6 parallel reviewer agents graded **every test case** across all 49 test files. Each agent read the test *and* the production source it claims to exercise, then assigned:

- a **letter grade** A–F, and
- a **verdict**: **REAL** (drives real code; fails if the code breaks) · **WEAK** (real but shallow / over-mocked / asserts little) · **FICTION** (tautological, tests a mock/constant/test-helper, mislabeled, or would still pass if the implementation were deleted).

## Headline

- **49 files · ~351 test cases.**
- **REAL 189 (54%) · WEAK 124 (35%) · FICTION 38 (11%).**
- **Roughly half the suite is weak or fiction.** 11 outright **F**, 30 **D**.
- The audit **independently rediscovered the exact gap behind today's bug fix**: the live `src/capture/drivers/claude-code/normalizer.ts` had **zero test coverage**, so `deriveState`'s `payload.args` file-path branch was never exercised — "false confidence from legacy-adapter-only tests" (core-shared report). Now fixed and guarded by `tests/live/`.

## By area

| Area | Files | Cases | A | B | C | D | F | REAL | WEAK | FICTION | Report |
|------|------:|------:|--:|--:|--:|--:|--:|-----:|-----:|--------:|--------|
| capture | 7 | 62 | 17 | 27 | 12 | 4 | 2 | 33 | 24 | 5 | [capture.md](capture.md) |
| inference | 9 | 67 | 28 | 18 | 12 | 6 | 3 | 38 | 22 | 7 | [inference.md](inference.md) |
| renderer A | 8 | 58 | 22 | 18 | 8 | 1 | 1 | 28 | 23 | 7 | [renderer-a.md](renderer-a.md) |
| renderer B | 8 | 54 | 22 | 11 | 12 | 7 | 2 | 31 | 17 | 6 | [renderer-b.md](renderer-b.md) |
| core/shared | 8 | 66 | 18 | 19 | 17 | 7 | 0 | 37 | 22 | 7 | [core-shared.md](core-shared.md) |
| electron/integration/live | 9 | 44 | 14 | 12 | 10 | 5 | 3 | 22 | 16 | 6 | [electron-integration-live.md](electron-integration-live.md) |
| **Total** | **49** | **351** | **121** | **105** | **71** | **30** | **11** | **189** | **124** | **38** | |

*(renderer-A and core/shared grouped a few multi-case blocks in their letter tally, so the letter columns sum to 338 vs 351 cases; verdict columns sum to 351.)*

## Systemic patterns (the recurring fiction)

1. **Tests of test-helpers (self-referential).** `record-2d-context.test.ts`, `canvas-draw.test.ts` (`createRecordedContext`), and `inference-contract.test.ts` (`FakeInferenceClient`) grade the test infrastructure, not production code.
2. **Tautologies / asserting constants.** `schema.test.ts` builds an object literal then asserts it has the value it just set; `canvas-draw.test.ts:9` asserts `'#66ccff' === '#66ccff'`; `inference.test.ts` asserts `SHADOW_SYSTEM_PROMPT === SHADOW_SYSTEM_PROMPT`; `renderer-surface-adapter.test.ts` asserts `typeof X === 'function'` (already enforced by TS).
3. **Inline stub instead of production code.** `inference-contract.test.ts:281` calls a *locally defined* `parseInferenceResponse` — deleting the real `response-parser.ts` leaves every assertion green.
4. **Negative/weak assertions that can't meaningfully fail.** `ipc-bridge.test.ts` (`markDirty` no-op) and the 9 `canvas-pulse.test.ts` kind→pulse tests (only assert `boost > 0`, never distinguish burst vs ripple).
5. **Mislabeled — claims X, tests Y.** `discoverActiveSession` "no JSONL files" actually tests an ENOENT; a `start-main-process` test actually tests `renderer-host`; instrumentation "fires after save" tests never observe the logger.
6. **Duplication as coverage.** `phase1-integration.test.ts:110` "all fixtures don't throw" re-smoke-tests the three fixtures already covered by the three preceding tests.
7. **Snapshots without invariants.** `scene-snapshots.test.ts` freezes a *corrupted* command log (the local recorder merges the live `props` bag into every record) — encodes no domain invariant.

## Worst offenders (hall of shame)

- `inference-contract.test.ts:281–343` — F — tests an inline stub parser, not production `parseModelResponse`.
- `phase1-integration.test.ts:110` — F — duplicate "doesn't throw" of already-covered fixtures.
- `canvas-draw.test.ts:9` & `:13` — F — constant tautology + tests the recording helper.
- `record-2d-context.test.ts:241` — F — asserts an assignment to `.length` succeeded.
- `start-main-process.test.ts:228` — D/FICTION — asserts the shape of its own injected bridge literal; mislabeled.
- `renderer-host.test.ts:43` — D/FICTION — structural tautology (`host.x !== bridge.y` always true); never exercises delegation.
- `schema.test.ts:34–95` — D — object-literal assignment passed off as schema validation.
- `instrumentation-sampling.test.ts:40–89, 161` — D/FICTION — "fires"/"naming pattern" tests assert strings the test authored.

## Coverage gaps (missing tests, not bad tests)

- **`claude-code/normalizer.ts`** — the *live* parser — had zero direct coverage (now addressed by `tests/live/` + `tests/capture/normalizer-derive-seam.test.ts`).
- **`view-model.ts`** — `formatClock`, `toLabel`, `safeFileName`, `buildGraphLayout` (incl. cycle detection), `deriveRiskLevel` have no direct unit tests.
- **Live-refresh** — asserts a mock was called, not that the snapshot was dispatched into App state.

## Recommendation

1. **Delete or rewrite the FICTION cases** — they cost maintenance and manufacture false confidence (a green suite that proves little).
2. **Adopt the live-test rule** (`tests/live/`, pre-push, real data) to close the real-path gaps — the normalizer gap proves synthetic fixtures missed what production actually does.
3. **Re-aim the WEAK cases** at behavior (assert *what* rendered/derived, not merely *that a function ran*).
