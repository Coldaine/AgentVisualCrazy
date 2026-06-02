# Test Audit — renderer (B)

## Summary

files: 8 | test cases: 54 | grades A: 22  B: 11  C: 12  D: 7  F: 2 | REAL: 31  WEAK: 17  FICTION: 6

### Worst offenders

- `tests/renderer/record-2d-context.test.ts:241` — mutates the shared module-level `UNIMPLEMENTED_METHODS` set by writing `length = 0` directly; the assertion `toHaveLength(0)` is testing that the assignment worked, not that any production behaviour holds.
- `tests/renderer/renderer-surface-adapter.test.ts:6` — asserts `typeof adapter.GraphCanvas === 'function'`; the file is a static object literal with no logic. This would pass even if every component were replaced with `() => null`. It does not exercise the wiring contract at all — it just confirms the module imported.
- `tests/renderer/scene-snapshots.test.ts:81` — the per-scene snapshot loop freezes the full draw-command list as a Vitest inline snapshot. Any change to colours, spacing, or draw order will break all snapshots with no guidance on what invariant was violated. There is no meaningful invariant encoded — it is a change-detector disguised as a test.
- `tests/renderer/theme-helpers.test.ts:21` — asserts `TIMING.glassAnimMs === 200`; this is a hardcoded constant, not a derived value. The test will always pass as long as the constant file is not edited; it adds zero regression coverage.
- `tests/renderer/particle-worker.test.ts:82` — the name says "clamps large dtMs to 48ms" but the assertion compares `dtMs: 500` output against `dtMs: 48` output. Due to the seed-based initial progress values and `Math.imul` arithmetic, both could theoretically wrap differently; the test happens to pass because the deterministic progress + clamped dt lands the same, but the logic is fragile and could silently mislead.

---

## Per file

### `tests/renderer/particle-engine-core.test.ts` — overall grade: A

All three tests call real production logic (`createParticleEngineState`, `advanceParticleEngineState`, `syncParticleEngineState`) with concrete inputs and make falsifiable assertions about numeric output.

| # | Test case | Grade | Verdict | Notes (file:line) |
|---|-----------|-------|---------|-------------------|
| 1 | allocates particles within the selected quality budget | A | REAL | Asserts count = 12 (high tier × 2 edges × 6 particles/edge) and that all edge IDs are covered. Would fail if `buildParticle`, `getQualityProfile`, or the loop logic changed. particle-engine-core.test.ts:15 |
| 2 | disables particles for the low tier | A | REAL | Checks `particleMode: 'disabled'` path produces empty array. Directly tied to the `low` profile constant. particle-engine-core.test.ts:22 |
| 3 | advances particle progress and preserves values for matched particles when the scene is resynced | A | REAL | Verifies three distinct behaviours: progress advances after tick, all values stay in [0,1), and sync preserves existing progress via particle-id merge. Each assertion is falsifiable. particle-engine-core.test.ts:27 |

---

### `tests/renderer/particle-worker.test.ts` — overall grade: B

Solid coverage of the handler dispatch table. The clamping test is structurally unsound and the "clamps to 48ms" name is misleading. The "returns empty snapshot for empty state" test adds minimal value since empty-state early-return is already exercised by the `low` tier test in particle-engine-core.

| # | Test case | Grade | Verdict | Notes (file:line) |
|---|-----------|-------|---------|-------------------|
| 1 | creates an empty state at high quality | B | WEAK | Confirms `createParticleEngineState([], 'high')` returns empty particles and that `qualityTier` is stored. The initial quality of `'high'` is a hardcoded default inside `createInitialWorkerState`; the assertion just reflects that constant back. particle-worker.test.ts:17 |
| 2 | builds particles from edges within the quality budget (scene) | A | REAL | Checks count, edge coverage, response type, and that `response.particles === state.particles` (reference equality — tests the protocol plumbing). particle-worker.test.ts:26 |
| 3 | resets particles when edges change on a new scene | A | REAL | Advances state then sends a completely different edge set; verifies new count and new edge coverage. particle-worker.test.ts:37 |
| 4 | produces empty particles for low quality tier | A | REAL | Drives the `low` profile path through the handler. particle-worker.test.ts:54 |
| 5 | advances particle progress with fixed dt (tick) | A | REAL | Checks progress increased and stays < 1 after a tick. particle-worker.test.ts:62 |
| 6 | does not change progress when dtMs is zero | A | REAL | `dtMs: 0` → `clampedDt = 0` → no movement. Would fail if the guard was removed. particle-worker.test.ts:71 |
| 7 | clamps large dtMs to 48ms | C | WEAK | Name claims it proves clamping. Implementation compares `dtMs: 500` against `dtMs: 48` outputs. Because initial progress is seeded deterministically the two calls produce the same result, but the test does not independently prove the clamp path was taken — it proves the outputs happen to be equal for this seed. A direct assertion like `expect(clampedDt).toBe(48)` would be cleaner. particle-worker.test.ts:80 |
| 8 | wraps progress past 1.0 back to [0, 1) | A | REAL | Uses `'ultra'` tier with `dtMs: 4000` which triggers the `while (progress >= 1) progress -= 1` wrap. Asserts `[0, 1)` range. particle-worker.test.ts:90 |
| 9 | returns current particles in snapshot response | B | WEAK | Only checks `response.type === 'snapshot'` and `response.particles.length === 12`. The type check is a string literal comparison and length is already proven in earlier tests. particle-worker.test.ts:105 |
| 10 | returns empty snapshot for empty state | C | WEAK | Ticks an empty state. Both assertions (`state.particles.length === 0`, `response.particles.length === 0`) follow trivially from the early-return guard `if (state.particles.length === 0) return state`. Adds negligible signal beyond what prior tests cover. particle-worker.test.ts:112 |
| 11 | re-syncs state with a new quality tier preserving edges | A | REAL | Verifies tier upgrade stores new qualityTier, particle count for `'ultra'` (10/edge × 2 edges = 20), and that `state.edges === edges`. particle-worker.test.ts:123 |
| 12 | downgrading to low produces no particles | A | REAL | Explicitly tests the downgrade-to-disabled path through the handler. particle-worker.test.ts:134 |
| 13 | returns state unchanged for an unrecognised message type at runtime | A | REAL | TypeScript union is exhausted at compile time, but the else-branch exists for runtime safety; test confirms `result.state === advancedState` (reference equality) and that particles are forwarded unchanged. particle-worker.test.ts:142 |
| 14 | does not crash on negative dtMs (clamped to 0) | B | WEAK | Asserts no crash and progress >= 0. `Math.max(0, Math.min(-100, 48)) = 0`, so this is the same as `dtMs: 0`. Could be folded into the zero-dt test with a parametrised case. particle-worker.test.ts:155 |

---

### `tests/renderer/record-2d-context.test.ts` — overall grade: C

**Context:** `record-2d-context` is a _test helper_, not production code. Testing it is legitimate only if the helper has non-trivial logic whose breakage would produce silent wrong test results. Most tests here are circular: they call a helper method and assert the helper recorded it. Since both sides (the call site and the command list) are owned by the same proxy object, a bug that corrupts commands would also corrupt what the test reads. The tests do not exercise any production code path.

The truly valuable tests are those that confirm the Proxy's error-throwing behaviour (unimplemented method/property) and the ordering/clearing invariants — because those protect other tests from silently missing calls.

| # | Test case | Grade | Verdict | Notes (file:line) |
|---|-----------|-------|---------|-------------------|
| 1 | records and retrieves save commands | C | FICTION | Calls `ctx.save()` then reads `ctx.getRecordedCommands()`. Both sides are the same proxy. If the Proxy handler were broken identically for get and set the test would still pass. record-2d-context.test.ts:5 |
| 2 | records and retrieves restore commands | C | FICTION | Same circularity as #1. record-2d-context.test.ts:12 |
| 3 | records save/restore pairs in order | B | REAL | The ordering assertion is worth having: it ensures the command list is a queue not a set, and that interleaving works. record-2d-context.test.ts:20 |
| 4 | records beginPath | C | FICTION | Circular — just confirms the proxy stores `{ type: 'beginPath' }`. record-2d-context.test.ts:30 |
| 5 | records closePath | C | FICTION | Circular. record-2d-context.test.ts:36 |
| 6 | records moveTo | C | FICTION | Circular. Would fail only if the proxy handler for 'moveTo' was deleted. record-2d-context.test.ts:44 |
| 7 | records lineTo | C | FICTION | Circular. record-2d-context.test.ts:51 |
| 8 | records quadraticCurveTo | C | FICTION | Circular. record-2d-context.test.ts:58 |
| 9 | records arc | B | REAL | Verifies the `counterclockwise` default (`false`), a subtle default-argument edge that could be omitted. record-2d-context.test.ts:65 |
| 10 | records arc with counterclockwise | B | REAL | Verifies the optional flag is captured when explicitly passed `true`. record-2d-context.test.ts:72 |
| 11 | records fill | C | FICTION | Circular. record-2d-context.test.ts:79 |
| 12 | records stroke | C | FICTION | Circular. record-2d-context.test.ts:86 |
| 13 | records fillText | B | REAL | Verifies `maxWidth: undefined` is stored when omitted — a subtle correctness point for downstream command replay. record-2d-context.test.ts:93 |
| 14 | records fillText with maxWidth | B | REAL | Verifies `maxWidth` is captured when provided. record-2d-context.test.ts:100 |
| 15 | records setLineDash | C | FICTION | Circular. record-2d-context.test.ts:107 |
| 16 | records setTransform | C | FICTION | Circular. record-2d-context.test.ts:114 |
| 17 | records clearRect | C | FICTION | Circular. record-2d-context.test.ts:121 |
| 18 | records fillRect | C | FICTION | Circular. record-2d-context.test.ts:128 |
| 19 | records translate | C | FICTION | Circular. record-2d-context.test.ts:135 |
| 20 | records scale | C | FICTION | Circular. record-2d-context.test.ts:142 |
| 21 | records createLinearGradient and addColorStop | A | REAL | Verifies gradient-ID assignment, coordinate capture, and that `addColorStop` records against the correct ID. Non-trivial: the `gradientId` counter and cross-object wiring are legitimately testable. record-2d-context.test.ts:149 |
| 22 | records createRadialGradient and addColorStop | A | REAL | Same as #21 for radial form with 6-parameter variant. record-2d-context.test.ts:169 |
| 23 | records state property changes (fillStyle, strokeStyle, lineWidth) | B | REAL | Tests the Proxy `set` trap dispatches `setProperty` commands for known properties. Catches a regression if the `knownProperties` array were trimmed. record-2d-context.test.ts:187 |
| 24 | records shadow property changes | B | REAL | Confirms `shadowColor` and `shadowBlur` are in `knownProperties`. record-2d-context.test.ts:198 |
| 25 | records globalAlpha | B | REAL | Same as #24, narrower scope. record-2d-context.test.ts:207 |
| 26 | records font, textAlign, textBaseline | B | REAL | Confirms the text-layout properties are known. record-2d-context.test.ts:214 |
| 27 | records lineDashOffset | B | REAL | Confirms `lineDashOffset` is in knownProperties. record-2d-context.test.ts:225 |
| 28 | clears recorded commands via clearRecordedCommands | A | REAL | Tests the `clearRecordedCommands` guard — essential for scene-snapshot tests that need a clean baseline. record-2d-context.test.ts:232 |
| 29 | returns empty unimplemented methods set initially | F | FICTION | **Worst case.** Writes `getUnimplementedMethods().length = 0` — this mutates the module-level `UNIMPLEMENTED_METHODS` array returned by the function (since `[...set]` returns a mutable array). Then asserts `.toHaveLength(0)`. This is asserting that `length = 0` worked, not any production behaviour. Also, `UNIMPLEMENTED_METHODS` is a module singleton — if a prior test in the suite triggered an unimplemented call, this assertion silently succeeds because writing to `.length` truncates the array. record-2d-context.test.ts:241 |
| 30 | records a typical production draw flow | A | REAL | End-to-end smoke — calls a realistic draw sequence and verifies the command-type order string. Catches mis-ordering or dropped commands during a real draw flow. record-2d-context.test.ts:246 |
| 31 | records a complete render frame sequence | C | WEAK | Asserts only `calls.length > 0` and `saveCount === restoreCount`. The balance invariant is worth having; `length > 0` is vacuous given 30+ explicit calls. The "complete render frame" label oversells what is actually checked. record-2d-context.test.ts:264 |
| 32 | throws on calling an unimplemented method | A | REAL | Verifies the Proxy throw path for unknown methods. Guards other tests against silently swallowing missing Canvas API calls. record-2d-context.test.ts:315 |
| 33 | throws on setting an unimplemented property | A | REAL | Verifies the Proxy throw path for unknown property sets. record-2d-context.test.ts:322 |

---

### `tests/renderer/renderer-input-adapter.test.ts` — overall grade: A

Both tests exercise real logic across multiple collaborators (`inferRendererInputTitle`, `buildSessionRecord`, `deriveState`, `prepareEventsForStorage`, `resolvePrivacyPolicy`). The privacy default test is particularly good — it verifies that the default policy is `local-only` / `sanitized-by-default` without any opt-in, which is a security-relevant invariant.

| # | Test case | Grade | Verdict | Notes (file:line) |
|---|-----------|-------|---------|-------------------|
| 1 | prefers session labels and user objectives when inferring the renderer title | A | REAL | Tests two priority branches: `session_started` label wins over `message` text; falls back to `message` text when no label event exists. Both are falsifiable. renderer-input-adapter.test.ts:19 |
| 2 | builds renderer input with derived state and default privacy policy | A | REAL | Verifies title resolution, PII sanitisation in event payloads (`[redacted-email]`, `[redacted-path]`), `fileAttention` assembly from `tool_started`, and that the default privacy policy is `local-only`. A regression in any of `deriveState`, `sanitizeCanonicalEvent`, `resolvePrivacyPolicy`, or `buildSessionRecord` would break this. renderer-input-adapter.test.ts:38 |

---

### `tests/renderer/renderer-surface-adapter.test.ts` — overall grade: D

Single test against a static object literal. The module under test has no logic — it is `{ id: '...', GraphCanvas: CanvasRenderer, Timeline: ..., ShadowPanel: ... }`. Checking `typeof x === 'function'` merely confirms that React components are functions (which TypeScript already enforces at compile time). The test would still pass if any component were replaced with `() => null` or even `() => { throw new Error('broken'); }`.

| # | Test case | Grade | Verdict | Notes (file:line) |
|---|-----------|-------|---------|-------------------|
| 1 | exposes surface wiring that resolves to renderable React components | D | FICTION | Tests that three imports are functions and the `id` string literal equals `'default-renderer-surfaces'`. All three assertions are tautologically true given TypeScript's static type system and a static object literal. No production logic is exercised. renderer-surface-adapter.test.ts:5 |

---

### `tests/renderer/scene-snapshots.test.ts` — overall grade: C

The snapshot approach is problematic for a draw-command recorder. Snapshots freeze the entire sequence of canvas commands as a JSON blob. Any colour tweak, spacing change, or refactor of draw order will break all six snapshots simultaneously with no guidance on which visual invariant was violated. There is no encoded domain invariant — "the snapshot matches itself" is the only assertion.

The one explicit structural test (`recording context works`) is vacuous.

The value these tests do provide: regression detection for the draw-call sequence as a whole, which is meaningful for catching accidental deletion of draw steps. That is a D-grade use of snapshots, not an F, because `drawScene` is real production code and the test at least exercises it end-to-end.

The local `createRecordingContext()` duplicates the `record-2d-context` test helper with a different (inferior) implementation — properties are tracked in a shared `props` bag that gets merged into every call record, which corrupts the command log and means the snapshot encodes this artefact rather than what the real renderer would produce.

| # | Test case | Grade | Verdict | Notes (file:line) |
|---|-----------|-------|---------|-------------------|
| 1 | recording context works | F | FICTION | Calls `ctx.snapshot()` immediately after construction and asserts the result is `[]`. This is guaranteed true by construction — the context has had no calls. It tests that `JSON.parse(JSON.stringify([]))` equals `[]`. No production code exercised. scene-snapshots.test.ts:75 |
| 2 | matches the "idle-graph" canonical scene | C | WEAK | Snapshot of draw commands for the idle scene. Freezes current output; no invariant encoded (e.g. "edge draw calls appear before node draw calls"). scene-snapshots.test.ts:82 |
| 3 | matches the "active-tool-burst" canonical scene | C | WEAK | Same criticism — snapshot with particles present. Does confirm `drawParticles` path is reached, but asserts nothing about particle geometry. scene-snapshots.test.ts:82 |
| 4 | matches the "risk-overlay" canonical scene | C | WEAK | Snapshot. Does exercise `drawRiskVignette` with `riskLevel: 'high'`, but the only assertion is "matches stored blob". scene-snapshots.test.ts:82 |
| 5 | matches the "empty-session" canonical scene | C | WEAK | Empty nodes/edges — covers the degenerate path. Still just a snapshot. scene-snapshots.test.ts:82 |
| 6 | matches the "dense-subgraph" canonical scene | C | WEAK | Medium quality tier, particles on two edge types. Snapshot. scene-snapshots.test.ts:82 |
| 7 | matches the "glass-panel-visible" canonical scene | C | WEAK | Ultra tier. Snapshot. scene-snapshots.test.ts:82 |

**Additional issue:** `createRecordingContext()` defined locally at scene-snapshots.test.ts:6 merges current `props` into every call record. This means e.g. after `ctx.fillStyle = '#050510'`, subsequent `stroke()` calls are recorded as `{ method: 'stroke', props: { fillStyle: '#050510', ... } }`. The snapshot encodes this artefact, and differs from what `record-2d-context` (the canonical helper) would produce. The duplicate context should be replaced with the shared helper.

---

### `tests/renderer/theme-helpers.test.ts` — overall grade: C

Two of four tests are real; the other two are value assertions on hard-coded constants.

| # | Test case | Grade | Verdict | Notes (file:line) |
|---|-----------|-------|---------|-------------------|
| 1 | withAlpha appends alpha to partial rgba bases | A | REAL | Verifies the string-assembly logic produces the correct output. Would fail if the trailing-space or closing-paren were lost. theme-helpers.test.ts:7 |
| 2 | withAlpha rejects non-partial bases | A | REAL | Verifies the guard throws for a non-comma-terminated base. Security/correctness fence. theme-helpers.test.ts:11 |
| 3 | getStateColor maps agent node states | C | WEAK | Asserts `getStateColor('active') === colors.stateThinking`. But `colors.stateThinking === '#66ccff'` and `colors.stateIdle === '#66ccff'` — the two states return the same hex value (see colors.ts:10-11). The test would pass even if `'active'` were mapped to `stateIdle` by mistake. It also does not test `'completed'` → `stateComplete` vs `stateError`. The switch default branch (which also returns `stateIdle`) is untested. theme-helpers.test.ts:15 |
| 4 | TIMING.glassAnimMs matches glass card transition | D | FICTION | Asserts a `const` equals `200`. This is a change-detector on an integer literal that provides zero regression coverage — if the intent was to document an integration contract, a comment would be clearer. theme-helpers.test.ts:21 |

---

### `tests/renderer/view-model.test.ts` — overall grade: B

Good coverage of `formatClock`, `toLabel`, `safeFileName`, and the graph layout algorithm (depth assignment, edge generation, cyclic-reference guard). The layout size assertions are one-sided lower bounds only, which is correct for an adaptive layout but means any output larger than the minimum passes.

| # | Test case | Grade | Verdict | Notes (file:line) |
|---|-----------|-------|---------|-------------------|
| 1 | falls back to the original value for invalid clock timestamps | A | REAL | Exercises the `isNaN` guard in `formatClock`. view-model.test.ts:7 |
| 2 | normalizes labels and filenames | A | REAL | Tests both `toLabel` (split-capitalise) and `safeFileName` (slug normalisation). Specific input/output pairs make these falsifiable. view-model.test.ts:11 |
| 3 | builds node layout and parent-child edges deterministically | B | REAL | Verifies depth values, edge list, and minimum dimensions for a 3-node chain. The `depth` assertions are strong (0/1/2 exactly). Width/height are `>=` bounds, which cannot detect regressions that make the canvas larger. view-model.test.ts:16 |
| 4 | handles cyclic parent references without recursion overflow | A | REAL | Sends a `a → b → a` cycle and confirms no stack overflow and that edges are produced for both directions. Guards the `visiting` set in `getDepth`. view-model.test.ts:42 |
