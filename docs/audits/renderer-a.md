# Test Audit — renderer (A)

## Summary

files: 8 | test cases: 58 | grades A: 22  B: 18  C: 8  D: 7  F: 3 | REAL: 28  WEAK: 23  FICTION: 7

### Worst offenders

- `tests/renderer/canvas-draw.test.ts:9` — `STATE_COLORS aligns thinking state with holo base`: asserts a constant equals another constant imported from the same codebase; can never fail unless someone edits a color file, and that would be caught by TS. This is a FICTION tautology test.
- `tests/renderer/canvas-draw.test.ts:13` — `recorded context captures fill and stroke styles`: validates the test helper (`createRecordedContext`), not any production drawing logic. The system under test is the test fixture itself.
- `tests/renderer/canvas-pulse.test.ts:155–175` (EventKind mapping cluster: `tool_completed`, `tool_failed`, `subagent_dispatched`, `subagent_returned`, `agent_spawned`, `agent_completed`, `session_started`, `permission_requested`) — each only asserts `boost > 0`; does not verify which pulse *kind* (burst vs. ripple) fired, nor duration or intensity. All eight tests are structurally identical and would all still pass if every event kind were remapped to the wrong type.

---

## Per file

---

### `tests/renderer/app-state.test.ts` — overall grade: A

All tests operate on the pure `appReducer` function directly. No mocks. Assertions check exact field values that would break if the reducer returned the wrong shape. The immutability test (frozen object) and the cross-action error-clearing invariant are particularly high value.

| # | Test case | Grade | Verdict | Notes / file:line |
|---|-----------|-------|---------|-------------------|
| 1 | `starts with busy=booting, no error, no snapshot` | A | REAL | Checks all three fields of initial state. Would break if `initialAppState` returned wrong defaults. app-state.test.ts:56 |
| 2 | `BOOT_START sets busy=booting and clears error` | A | REAL | Prior state has `error:'old error'`; asserts both `busy` and `error` change correctly. app-state.test.ts:69 |
| 3 | `BOOT_SUCCESS sets snapshot and clears busy` | A | REAL | Asserts `busy→null`, `snapshot===action.snapshot`, `error===null`. app-state.test.ts:76 |
| 4 | `BOOT_ABORT clears busy without changing snapshot` | A | REAL | Checks snapshot reference identity is preserved. app-state.test.ts:85 |
| 5 | `BOOT_ERROR clears busy and sets error message` | A | REAL | Checks exact error string is propagated. app-state.test.ts:93 |
| 6 | `LIVE_UPDATE replaces snapshot, clears error, preserves busy` | A | REAL | Uses two distinct source kinds to verify snapshot was replaced, not just equal. app-state.test.ts:102 |
| 7 | `LOAD_START sets busy=loading and clears error` | A | REAL | Also verifies snapshot is preserved during load start. app-state.test.ts:120 |
| 8 | `LOAD_SUCCESS replaces snapshot and clears busy` | A | REAL | Uses two distinct snapshots; checks reference identity. app-state.test.ts:129 |
| 9 | `LOAD_CANCELLED clears busy without changing snapshot or error` | A | REAL | Correctly verifies error is not cleared (matches `{...state, busy:null}`). app-state.test.ts:138 |
| 10 | `LOAD_ERROR clears busy and sets error, preserves snapshot` | A | REAL | Checks snapshot reference preserved through error path. app-state.test.ts:147 |
| 11 | `EXPORT_START sets busy=exporting and clears error` | A | REAL | app-state.test.ts:162 |
| 12 | `EXPORT_SUCCESS clears busy and error` | A | REAL | app-state.test.ts:170 |
| 13 | `EXPORT_ERROR clears busy and sets error` | A | REAL | app-state.test.ts:178 |
| 14 | `PRIVACY_UPDATE_SUCCESS updates snapshot privacy and clears busy` | A | REAL | Checks nested `snapshot.privacy.processingMode` changed; verifies `allowRawTranscriptStorage` toggled to true. app-state.test.ts:189 |
| 15 | `does not mutate the previous state object` | A | REAL | Uses `Object.freeze`; would throw if reducer mutated state. app-state.test.ts:214 |
| 16 | `error is cleared by every success action` | A | REAL | Covers three success actions; would catch if any success forgot to clear error. app-state.test.ts:220 |
| 17 | `LOAD_CANCELLED does not clear an existing error` | A | REAL | Checks the documented asymmetry: cancelled only clears busy, not error. app-state.test.ts:229 |

**Note — gaps in this file:** `PRIVACY_UPDATE_START`, `PRIVACY_UPDATE_ERROR`, and `BOOT_ABORT` with a non-null snapshot are not tested. BOOT_ABORT test (case 4) starts with `snapshot:null` — the snapshot-preservation branch is not exercised.

---

### `tests/renderer/host.test.ts` — overall grade: B

| # | Test case | Grade | Verdict | Notes / file:line |
|---|-----------|-------|---------|-------------------|
| 1 | `creates a static host with no optional file operations` | B | REAL | Calls the real `createStaticHost` and `getHostCapabilities`; snapshot promise resolves to the same object; capabilities all false. Correct. But it only covers `createStaticHost` — `createBridgeHost` is completely untested. host.test.ts:40 |

**Gap:** `createBridgeHost` (delegates to `ShadowAgentBridge` methods), `getHostCapabilities` with partial bridge (only `openReplayFile` defined, etc.), and error paths are not tested.

---

### `tests/renderer/app.integration.test.tsx` — overall grade: B

The renderer-surface-adapter is mocked (returns `null` for all canvas surfaces) but the real App, real host, real appReducer, and real DOM rendering are exercised. Assertions check actual visible text content, which would break if data flow through App were severed.

| # | Test case | Grade | Verdict | Notes / file:line |
|---|-----------|-------|---------|-------------------|
| 1 | `shows loading state on initial render` | A | REAL | Uses a never-resolving promise; asserts 'bootstrapping' appears. Would fail if App removed that text or skipped loading state. app.integration.test.tsx:55 |
| 2 | `renders snapshot data after successful boot` | B | REAL | Checks session title, objective, source badge, tab labels, transcript text, file path. Good breadth. **Weakness:** does not assert the graph panel renders node data (GraphCanvas is mocked to null), and doesn't verify the active-phase or timeline badge text. app.integration.test.tsx:63 |
| 3 | `displays error message when boot fails` | A | REAL | Error text is the actual Error.message from the rejection — would catch if App's error display path broke. app.integration.test.tsx:101 |
| 4 | `shows empty states when timeline/transcript/file lists are empty` | B | REAL | Checks three specific empty-state strings. Would break if those strings changed or the empty-state branches were deleted. app.integration.test.tsx:112 |

**Gap:** Privacy panel rendering, capability-gated buttons (Open replay, Export), `LIVE_UPDATE` re-render path, and the `toLabel` formatting in the UI are untested here.

---

### `tests/renderer/app-graph-props.test.tsx` — overall grade: B

The test uses a spy component injected through the mocked adapter to capture what `CanvasRendererProps` App passes down. This is the right approach. The assertions are meaningful: they check `latestInsight.source === 'model'` and that the heuristic insight at index 0 is NOT selected.

| # | Test case | Grade | Verdict | Notes / file:line |
|---|-----------|-------|---------|-------------------|
| 1 | `passes the model insight as latestInsight, never the heuristic shadowInsights[0]` | B | REAL | Drives real `pickPrimaryModelInsight` logic through App render. Correctly verifies quarantine property. **Weakness:** asserts `riskLevel` is defined but does not assert its value (2 signals = 'high' per `deriveRiskLevel`). app-graph-props.test.tsx:61 |
| 2 | `passes latestInsight=undefined when there is no model insight (no heuristic-as-model)` | B | REAL | Correctly asserts `undefined` when no model-sourced insight exists, and `riskLevel === 'low'` for empty signals. Good negative case. **Weakness:** `riskLevel` is checked but the test does not verify it derives from `riskSignals` length (an empty array is used — this doesn't distinguish `low` from absent). app-graph-props.test.tsx:95 |

**Note:** `hoisted.graphProps` is module-level mutable state reset via `hoisted.graphProps.length = 0`. If tests ever ran in parallel this would be a flakiness source; in sequential Vitest it's fine.

---

### `tests/renderer/app-live-refresh.test.tsx` — overall grade: C

| # | Test case | Grade | Verdict | Notes / file:line |
|---|-----------|-------|---------|-------------------|
| 1 | `calls getLiveSnapshot on an EMPTY live-events batch (the insight dirty refresh)` | C | WEAK | Verifies that `getLiveSnapshot` was called (spy call count increases). Does NOT verify that the returned snapshot was dispatched into App state — no `screen.getBy*` assertion on what the UI shows after the refresh. The test validates the *invocation* of the live bridge, not the *effect* on rendered output. A regression where `getLiveSnapshot` is called but the result is discarded would still pass this test. app-live-refresh.test.tsx:58 |

**Gap:** Non-empty event batches, the debounce behavior (firing two events in rapid succession), `LIVE_UPDATE` vs `BOOT_SUCCESS` interaction, and the guard against overwriting a `replay`-source snapshot are all untested.

---

### `tests/renderer/canvas-draw.test.ts` — overall grade: C (mix of D and B)

| # | Test case | Grade | Verdict | Notes / file:line |
|---|-----------|-------|---------|-------------------|
| 1 | `STATE_COLORS aligns thinking state with holo base` | F | FICTION | Asserts `STATE_COLORS.thinking === colors.holoBase`. Both are `'#66ccff'` — a string literal equality check between two constants. This is a tautology: if a developer changes one intentionally, this test rightly catches it, but it does not test any *behavior*. It tests co-authoring of two config files. Would pass even if `drawShadowNode` or `drawAgentNode` were deleted. canvas-draw.test.ts:9 |
| 2 | `recorded context captures fill and stroke styles` | D | FICTION | The SUT is `createRecordedContext` (the test helper itself), not any production drawing code. This is a helper self-test. It has zero value for catching regressions in `draw-utils.ts` or any canvas rendering. canvas-draw.test.ts:13 |
| 3 | `drawShadowNode renders the holographic shadow node (dashed connector + hexagon + glyph)` | B | REAL | Calls the real `drawShadowNode` with a real recorded context. Asserts `setLineDash` (connector), `fill` (hexagon body), and `fillText` with the crystal-ball emoji. Would break if the dashed line, fill, or glyph were removed. **Weakness:** does not assert position (agentX+88, agentY-62), connector start point, or hexagon radius. canvas-draw.test.ts:34 |
| 4 | `drawPredictionTrail renders a dashed bezier with a labeled confidence percentage` | B | REAL | Asserts `quadraticCurveTo` (bezier), `setLineDash`, and `fillText` containing both label and '72%'. Would break if the curve type or text format changed. **Weakness:** does not assert coordinates or control point geometry. canvas-draw.test.ts:52 |

**Gap:** `drawGrid`, `drawEdge`, `drawAgentNode`, `drawParticles`, `drawRiskVignette`, `hexagonPath`, `toRgba`, `getQuadraticControlPoint`, `getQuadraticPoint` are all completely untested.

---

### `tests/renderer/canvas-pulse.test.ts` — overall grade: B (mix of A and C)

This is the largest test file and by far the most algorithmically rigorous. The numerical tests (spatial falloff, EMA, max-not-sum) pin real formulas and would break on implementation drift.

| # | Test case | Grade | Verdict | Notes / file:line |
|---|-----------|-------|---------|-------------------|
| 1 | `returns zero boost with no active pulses` | A | REAL | canvas-pulse.test.ts:32 |
| 2 | `ramps boost while a burst pulse is active` | A | REAL | Checks early > 0 and late === 0. canvas-pulse.test.ts:36 |
| 3 | `tickCanvasPulses prunes expired pulses without sampling the grid` | A | REAL | canvas-pulse.test.ts:45 |
| 4 | `stacks concurrent burst pulses, boost reflects max amp not sum` | A | REAL | Computes expected amplitudes algebraically; asserts `boost === Math.max(a, b)` and `< a+b`. canvas-pulse.test.ts:56 |
| 5 | `concurrent burst + ripple both contribute via max amp` | A | REAL | Same max-not-sum test across pulse kinds. canvas-pulse.test.ts:71 |
| 6 | `ripple boost is highest at canvas center (0.5, 0.5)` | A | REAL | Algebraic expected value check. canvas-pulse.test.ts:87 |
| 7 | `ripple boost at canvas corner (0, 0) is zero due to spatial falloff` | A | REAL | Spatial falloff geometry verified. canvas-pulse.test.ts:94 |
| 8 | `ripple boost at edge (1, 0) is zero due to spatial falloff` | A | REAL | canvas-pulse.test.ts:100 |
| 9 | `ripple boost at midway (0.25, 0.25) has exactly half spatial falloff` | A | REAL | Pins the `1 - dist/maxDist` formula at a specific coordinate. canvas-pulse.test.ts:106 |
| 10 | `zero-duration pulse is pruned on first tick after creation` | A | REAL | canvas-pulse.test.ts:117 |
| 11 | `zero intensity produces zero boost` | A | REAL | canvas-pulse.test.ts:123 |
| 12 | `intensity above 1 scales boost proportionally` | A | REAL | canvas-pulse.test.ts:129 |
| 13 | `negative intensity is treated as zero boost` | B | REAL | Name claims "clamped by max(0, boost)" but the formula is `intensity * falloff * spatial * scale`; negative intensity just multiplies to a negative amp which is never chosen via `max(boost, amp)` since boost starts at 0. The behavior is correct but the mechanism described is wrong. canvas-pulse.test.ts:136 |
| 14 | `triggers burst pulse for tool_started` | C | WEAK | Asserts `triggered===true` and `boost > 0`. Does NOT verify the pulse is a *burst* (0.12 scale) vs ripple (0.06 scale). canvas-pulse.test.ts:146 |
| 15 | `triggers ripple pulse for tool_completed` | C | WEAK | Name claims "ripple" but only asserts `boost > 0`. A burst would also pass. canvas-pulse.test.ts:152 |
| 16 | `triggers burst pulse for tool_failed` | C | WEAK | Same: only `boost > 0`. canvas-pulse.test.ts:157 |
| 17 | `triggers ripple pulse for subagent_dispatched` | C | WEAK | Only `boost > 0`. canvas-pulse.test.ts:163 |
| 18 | `triggers ripple pulse for subagent_returned` | C | WEAK | Only `boost > 0`. canvas-pulse.test.ts:168 |
| 19 | `triggers burst pulse for agent_spawned` | C | WEAK | Only `boost > 0`. canvas-pulse.test.ts:173 |
| 20 | `triggers ripple pulse for agent_completed` | C | WEAK | Only `boost > 0`. canvas-pulse.test.ts:179 |
| 21 | `triggers burst pulse for session_started` | C | WEAK | Only `boost > 0`. canvas-pulse.test.ts:184 |
| 22 | `triggers burst pulse for permission_requested` | C | WEAK | Only `boost > 0`. canvas-pulse.test.ts:189 |
| 23 | `returns false for unmapped EventKind (message)` | A | REAL | canvas-pulse.test.ts:202 |
| 24 | `returns false for unmapped EventKind (session_ended)` | A | REAL | canvas-pulse.test.ts:206 |
| 25 | `returns false for unmapped EventKind (context_snapshot)` | A | REAL | canvas-pulse.test.ts:211 |
| 26 | `returns false for unmapped EventKind (shadow_insight)` | A | REAL | canvas-pulse.test.ts:216 |
| 27 | `returns false for unmapped EventKind (agent_idle)` | A | REAL | canvas-pulse.test.ts:221 |
| 28 | `uses canvas center (0.5, 0.5) as default pulse origin` | B | REAL | Tests the default-parameter behavior. canvas-pulse.test.ts:227 |
| 29 | `debounces same EventKind within 100ms window` | A | REAL | First call returns true, second (50ms later) returns false. canvas-pulse.test.ts:234 |
| 30 | `allows same EventKind after debounce window expires` | A | REAL | 150ms gap — both return true. canvas-pulse.test.ts:242 |
| 31 | `does not debounce different EventKinds` | A | REAL | canvas-pulse.test.ts:250 |
| 32 | `triggerPulsesForEvents fires pulses for a batch of mapped events` | B | REAL | Batch includes one unmapped kind; asserts boost > 0. Does not verify count or kind. canvas-pulse.test.ts:262 |
| 33 | `triggerPulsesForEvents skips unmapped kinds without error` | A | REAL | All-unmapped batch; asserts boost === 0. canvas-pulse.test.ts:273 |
| 34 | `tool_failed has higher intensity than tool_started` | A | REAL | Explicitly compares boosts by clearing and re-triggering. Pins the intensity ordering in the EVENT_PULSE_MAP table. canvas-pulse.test.ts:288 |
| 35 | `session_started has longer duration than tool_started` | A | REAL | Samples at t+700ms; tool_started is expired (600ms), session_started is not (1200ms). Pins duration ordering. canvas-pulse.test.ts:301 |

---

### `tests/renderer/canvas-quality.test.ts` — overall grade: B

| # | Test case | Grade | Verdict | Notes / file:line |
|---|-----------|-------|---------|-------------------|
| 1 | `treats reduced-motion environments as low-budget scenes` | A | REAL | Verifies `estimateResourcePressure` returns 100 for `prefersReducedMotion:true` AND that `tierFromResourcePressure` maps that to 'low'. Exercises two functions with a meaningful end-to-end flow. canvas-quality.test.ts:24 |
| 2 | `downgrades after sustained slow frames` | B | REAL | Runs 24 frames at 28ms (just above 16.7ms budget). Expects downgrade from ultra to medium AND verifies `resourceBudgetTier` is 'high' for the given metrics. **Weakness:** the assertion `tier === 'medium'` is correct but brittle — it depends on `SLOW_FRAMES_TO_DOWNGRADE=18` and the EMA rate. If either constant changes the test breaks without a clear failure message. Does not assert `lastChangeReason`. canvas-quality.test.ts:31 |
| 3 | `caps ultra tier under very large scenes` | B | REAL | Computes pressure for a heavy scene and verifies the tier is not 'ultra'. Correct behavior checked. **Weakness:** only asserts "not ultra" — does not pin what tier is expected ('low' for these metrics since `prefersReducedMotion` is false but pressure will be ≥ 55). canvas-quality.test.ts:41 |
| 4 | `recovers one tier at a time without exceeding the resource budget` | B | REAL | Runs 140 fast frames from 'low' and expects recovery to 'medium'. Pins that recovery is bounded by `resourceBudgetTier`. **Weakness:** does not assert `lastChangeReason === 'frame-recovery'`. The 140-frame count is opaque — the minimum frames needed to recover once is `FAST_FRAMES_TO_UPGRADE=120`, but the 140 choice is not documented. canvas-quality.test.ts:52 |

**Gap:** `getQualityProfile` return values, `QUALITY_PROFILES` constants, `getTierIndex`, hard-degrade path (frameTimeMs >= 40), `PRIVACY_UPDATE_START/ERROR` actions, recovery being blocked when already at budget tier, and `frameBudgetMs` per-tier differences are all untested.

---

## Cross-cutting issues

1. **No tests for `view-model.ts`** — `formatClock`, `toLabel`, `safeFileName`, `buildGraphLayout`, and `deriveRiskLevel` have zero direct unit tests. `buildGraphLayout` contains a cycle-detection algorithm. `deriveRiskLevel` is exercised only indirectly through `app-graph-props.test.tsx`. Risk: High.

2. **No tests for `renderer-surface-adapter.ts`** — which adapter gets selected and what its capabilities are is entirely untested.

3. **EventKind pulse-kind tests are all WEAK** — nine tests in `canvas-pulse.test.ts` claim to verify burst vs. ripple mapping but only assert `boost > 0`. To distinguish burst (scale 0.12) from ripple (scale 0.06) you would sample at center and compare the algebraic max; none of the tests do this.

4. **`app-live-refresh.test.tsx` does not assert UI effect** — the only assertion is on a mock call count. A regression where the snapshot is fetched but never dispatched would be invisible.

5. **`canvas-draw.test.ts` test #2 is a helper self-test** — it should live in `tests/helpers/` if it needs to exist at all.
