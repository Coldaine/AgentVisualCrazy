# Test Audit — electron / integration / live

## Summary

**Files audited:** 9  
**Test cases:** 44  
**Grades:** A:14  B:12  C:10  D:5  F:3  
**Verdicts:** REAL:22  WEAK:16  FICTION:6

### Worst offenders

- `tests/electron/start-main-process.test.ts:228` — `ShadowAgentBridge surface / exposes the live bridge methods` — installs a hand-rolled bridge on `globalThis.window`, calls `getShadowAgentBridge()`, then asserts each method is a function and that the key set matches a hardcoded list. The test constructs and then immediately reads back its own input; no real logic is exercised. Would pass even if `getShadowAgentBridge` were `return window.shadowAgent`.
- `tests/electron/renderer-host.test.ts:43` — `adapts the preload bridge into the platform-agnostic renderer host` — asserts `host.loadInitialSnapshot !== bridge.bootstrap`, which is true by definition because `createBridgeHost` wraps the bridge in a new object literal (see `renderer/host.ts:44-51`). The inequality is a structural inevitability, not a behavioral assertion. The actual delegation (`bootstrap` call) is never triggered.
- `tests/phase1-integration.test.ts:110` — `all valid fixture replays produce valid DerivedState without throwing` — a pure smoke test over the same three fixtures already covered by the three preceding tests in the same `describe`. Adds zero new signal; it is a subset of what is already proven. Grade F for duplication-as-coverage.

---

## Per file

---

### `tests/electron/start-main-process.test.ts` — overall grade: B

All of Electron is mocked. `session-io` is fully mocked. The test target is `registerIpcHandlers` and its IPC wiring logic, which is the right boundary to test without a real Electron runtime. The mock boundary is honest for an Electron unit test.

| # | Test case | Grade | Verdict | Notes |
|---|-----------|-------|---------|-------|
| 1 | `removes old handlers before registering channels` | A | REAL | Verifies remove-then-register ordering via mock invocation call order. Would fail if the implementation removed the `removeHandler` calls or changed the channel names. Line 76. |
| 2 | `bootstrap handler calls buildFixtureSnapshot and returns result` | A | REAL | Extracts the registered IPC callback and invokes it; asserts delegation to the real mock boundary. Would fail if the bootstrap handler stopped calling `buildFixtureSnapshot`. Line 102. |
| 3 | `open-replay handler returns null when user cancels the dialog` | A | REAL | Exercises the cancel-path branch in the handler. The `null` return is a real code-path choice, not a constant. Line 116. |
| 4 | `open-replay handler loads and returns snapshot for a valid file` | B | REAL | Tests delegation to `loadSnapshotFromFile` with privacy settings forwarding. The `expect.objectContaining` check on privacy fields is meaningful, but mocking `loadSnapshotFromFile` means the actual file-parse path is untested. Line 128. |
| 5 | `open-replay handler re-throws when loadSnapshotFromFile throws` | A | REAL | Verifies error propagation through the IPC handler. Production code must not swallow the error for this to pass. Line 151. |
| 6 | `export-replay handler returns saveReplayFile result on success` | B | REAL | Tests the happy-path return value. `saveReplayFile` is mocked, so the actual file write is not exercised; the delegation wiring is confirmed. Line 162. |
| 7 | `export-replay handler returns error object when saveReplayFile throws` | A | REAL | The error-to-object conversion at line 116-119 of production code is what makes this pass; removing it would break the test. Line 174. |
| 8 | `privacy handlers expose and update the current policy` | B | REAL | Supplies a custom `privacyAccess` shim and verifies that `getPrivacyPolicy` calls `resolvePrivacyPolicy` with the right settings, and that `update-privacy-settings` delegates. The `processingMode` field on the response is derived by real production code (`resolvePrivacyPolicy`), not mocked. Line 187. |
| 9 | `ShadowAgentBridge surface / exposes the live bridge methods` | D | FICTION | Constructs a complete bridge, installs it on `globalThis.window`, calls `getShadowAgentBridge()`, then checks `typeof result.bootstrap === 'function'` and the sorted key set. The test reads back its own input and asserts on its own setup. The `Object.keys` assertion would fail only if the _test's own bridge literal_ had a typo, not if production code were wrong. Also crosses file boundaries (imports from `renderer-host`) while claiming to test `start-main-process`. Line 228. |

---

### `tests/electron/start-main-process-privacy.test.ts` — overall grade: B

Tests `startMainProcess()`, the full startup function, which is significantly more complex than `registerIpcHandlers`. Mocks all collaborators. The privacy-forwarding assertion (test #1 below) is the most important single assertion in the whole Electron suite because it verifies the end-to-end wiring of `loadTranscriptPrivacySettings` → `createSessionManager` → `createInferenceEngine` — wiring that would be impossible to verify through any individual layer test.

| # | Test case | Grade | Verdict | Notes |
|---|-----------|-------|---------|-------|
| 1 | `forwards loaded privacy settings into both capture and inference startup` | B | REAL | The test verifies that the settings loaded by `loadTranscriptPrivacySettings` flow into both `createSessionManager` (via `getPrivacy()`) and `createInferenceEngine` (via `privacy:`). This is the critical wiring test. Grade B not A because `flushStartup` waits only for `createSessionManagerMock` to have been called — if `createInferenceEngine` were called before the waitFor completes there is a race; and the assertions on `inferenceEngineMock.start` and `sessionManagerMock.start` are post-hoc rather than part of the wait condition. The `queuePersistenceRoot` assertion (line 145) exercises a real path join against `getPath` mock. Line 130. |

---

### `tests/electron/session-io.test.ts` — overall grade: A−

This is the strongest Electron-layer test file. It imports and exercises real production code from `session-io.ts` directly with no mocking of the unit under test. The mock boundary is honest: `dialog` (Electron native) is not called here; only pure logic is exercised.

| # | Test case | Grade | Verdict | Notes |
|---|-----------|-------|---------|-------|
| 1 | `detects replay vs transcript input formats` | A | REAL | Calls the real `detectReplayFormat` with several inputs covering the heuristic branches (has `kind`, has `sessionId`/`message`, non-JSON first line, empty). Would fail if the heuristic logic changed. Line 22. |
| 2 | `resolves title precedence correctly` | A | REAL | Drives `inferTitle` (aliased as `inferRendererInputTitle`) through three precedence levels. Asserts specific string values from hand-crafted events. Line 30. |
| 3 | `builds snapshots from canonical events and fixture data` | B | REAL | Exercises `createSnapshot` and `buildFixtureSnapshot` with real data. The `fileAttention` assertion (line 57) is particularly good — it would fail if `extractFilePath` stopped reading the payload. `buildFixtureSnapshot()` call at line 60 is a smoke test only; it asserts `source.kind === 'fixture'` and `events.length > 0`, not anything specific about the fixture content. Line 44. |
| 4 | `preserves parser failure details when neither parser can load events` | A | REAL | Writes an actually corrupt file to a tmpdir and calls `loadSnapshotFromFile`. The error message regex is derived from real production code (line 121-129 of session-io.ts). Would fail if the error message format changed. Line 65. |
| 5 | `does not mask replay parse errors with transcript fallback` | A | REAL | Tests the `shouldTrySecondary` guard (`!(primaryFormat === 'replay' && primaryError)`). Writes a file that starts valid then has a corrupt line. Confirms the replay parser error is not silently suppressed by the transcript fallback. This guards a subtle non-obvious production branch. Line 73. |

---

### `tests/electron/renderer-host.test.ts` — overall grade: C

Tests `getShadowAgentBridge` and `createElectronHost`. Production code is 15 lines. The tests do exercise real error-throwing logic, but the `createElectronHost` test has a significant fiction embedded in it.

| # | Test case | Grade | Verdict | Notes |
|---|-----------|-------|---------|-------|
| 1 | `returns the preload bridge exposed on window` | A | REAL | Installs a bridge on `globalThis.window` and asserts `getShadowAgentBridge()` returns it. Tests the real `target.shadowAgent` lookup. Line 19. |
| 2 | `throws a descriptive error when the preload bridge is missing` | A | REAL | Installs a window _without_ `shadowAgent`. Asserts the exact error message from production code line 7. Would fail if the guard or message changed. Line 35. |
| 3 | `adapts the preload bridge into the platform-agnostic renderer host` | D | FICTION | The headline assertion `host.loadInitialSnapshot !== bridge.bootstrap` is a tautology: `createBridgeHost` in `renderer/host.ts:44` creates a new object literal with `loadInitialSnapshot: () => bridge.bootstrap()`, so the two function references are structurally guaranteed to differ. The test never _calls_ `loadInitialSnapshot()`, so the delegation from `loadInitialSnapshot` to `bridge.bootstrap` is never exercised. `bridge.openReplayFile` and `bridge.exportReplayJsonl` are called (lines 59-60) and their call counts checked, which is real, but the `!=` assertion that anchors the test name is fiction. Line 43. |

---

### `tests/integration/e2e-jsonl-to-state.test.ts` — overall grade: B

**Label assessment:** The `end-to-end` and `e2e` labels in the describe block are _mostly_ honest: this test uses real production transport, real parser, real driver normalizer, real event buffer (including spill-to-disk), and real `deriveState`. It earns the integration label. The caveat: the fixture (`happy-path.jsonl`) is 6 lines — a toy session. The test comment says "~7 events" and waits for `>= 7`. This means the spill assertion (`spilledDepth > 0`) is valid but the coverage of real-world data shapes (multiple actors, subagents, large message content, thinking blocks) is absent.

| # | Test case | Grade | Verdict | Notes |
|---|-----------|-------|---------|-------|
| 1 | `preserves harnessId through transport → spill → reload → derive` | B | REAL | The central `harnessId === 'claude-code'` assertion (line 135) is the reason this test exists and would fail if the normalizer stopped stamping `harnessId`. The spill assertion at line 143 (`spilledDepth > 0`) proves the disk round-trip path ran — this is non-trivial. The `fileAttention` assertion at line 166 pins exact file names from the 6-line fixture; it would catch a regression in `extractFilePath`. Grade B rather than A because: (a) the fixture is too small to stress the buffer or transport under realistic load; (b) the `activePhase` assertion at line 161 allows `idle` as a valid match — the fixture contains a `Write` tool call so `implementation` is the expected phase, yet `idle` would also pass, hiding a derive regression. Line 78. |

---

### `tests/live/read-real-session.test.ts` — overall grade: A−

This is the most honest test in the suite in terms of what it claims to do. It skips loudly when the precondition is absent, guards against specific known regressions (the `payload.args` nesting bug, the thinking-block drop bug), and uses `ctx.skip()` within tests rather than silent no-ops when the data doesn't contain the relevant signals.

| # | Test case | Grade | Verdict | Notes |
|---|-----------|-------|---------|-------|
| 1 | `discovers and reads a real session into canonical events` | A | REAL | When `probe` is populated, asserts `events.length > 0` and `activePhase` matches the known-valid set. The phase regex (`VALID_PHASES`) is narrower than the `derive.ts` output set (excludes `idle`, `observation` — actually `idle` is not produced by `derive.ts` but `observation` is). Minor risk: a session in pure observation phase would fail this test. Line 80. |
| 2 | `surfaces file attention when the session used file-targeting tools` | A | REAL | Regression guard for the `payload.args` bug. It pre-counts raw file-tool calls from the JSONL before the pipeline processes them, then asserts `fileAttention.length > 0` only when real file tools were present. This is the correct design for a regression guard. Would fail if `extractFilePath` stopped reading `payload.args`. Line 89. |
| 3 | `captures thinking blocks instead of dropping them` | A | REAL | Same pattern: counts `thinking` blocks in raw JSONL, then asserts they appear as `kind === 'message'` events with `payload.thinking === true` only when they were present in the raw data. Guards the `blockType === 'thinking'` branch in the normalizer. Line 100. |

**Note on `activePhase` regex:** `VALID_PHASES` at line 27 is `/^(observation|exploration|planning|implementation|validation)$/`. The `derive.ts detectPhase` function also returns `'observation'` (the fallback when no tools match) — so the regex is complete. The concern from test #1 above is unfounded on second inspection. Grade remains A−.

---

### `tests/persistence.test.ts` — overall grade: A

No mocking. Uses real `FileReplayStore` against tmpdir. This is the best-designed test file in the suite: it exercises real I/O, real sanitization, real encoding/decoding, and real error semantics.

| # | Test case | Grade | Verdict | Notes |
|---|-----------|-------|---------|-------|
| 1 | `persists canonical events and reloads them from disk` | A | REAL | End-to-end: saves two events, loads them back, reads the raw JSONL from disk, asserts line count, sanitization of email/path in payload, and record metadata. The sanitization assertion at line 68 is the key regression guard. Line 32. |
| 2 | `requires explicit opt-in before storing raw transcripts` | A | REAL | Calls `prepareEventsForStorage` path that throws when `allowRawTranscriptStorage` is false but `storeRawTranscript: true` is passed. This tests a real privacy enforcement gate. Line 73. |
| 3 | `stores raw transcripts when the store is configured with opt-in` | A | REAL | Inverse of test #2. Confirms the opt-in path passes through the secret text unsanitized. Line 95. |
| 4 | `appends events and lists sessions in updated order` | A | REAL | Multi-session store test; exercises `appendEvent` (which internally calls `loadSession` + `saveSession`), then `listSessions` sorted by `updatedAt`. The ordering assertion at line 166 catches a regression in `sortSessions`. Line 125. |
| 5 | `loadSession throws on a nonexistent session` | B | REAL | Asserts `{ code: 'ENOENT' }` on a missing session. The real filesystem behavior is tested. Grade B because `ENOENT` propagation through `loadSession` is fairly obvious. Line 172. |
| 6 | `listSessions returns empty array for a fresh store` | B | REAL | Tests the `try/catch` around `readdir` when `sessionsDir` does not exist. Line 179. |
| 7 | `loadEvents returns empty array for a session with no events` | B | REAL | Saves an empty event list and loads it back. The empty JSONL path in `parseReplay` is exercised. Line 187. |
| 8 | `session IDs with special characters are encoded/decoded correctly` | A | REAL | Uses `'session/with spaces & special=chars'` — characters that `encodeURIComponent` transforms but `decodeURIComponent` must recover. Would fail if either function were removed or swapped. Line 197. |

---

### `tests/replay-store.test.ts` — overall grade: A−

Tests `serializeEvents`, `parseReplay`, and `buildSessionRecord` directly. No mocks. Covers sanitization defaults, opt-in override, error messages with line numbers, timestamp edge cases, and fixture round-trips.

| # | Test case | Grade | Verdict | Notes |
|---|-----------|-------|---------|-------|
| 1 | `sanitizes replay JSONL by default and ignores blank lines` | A | REAL | Serializes then re-parses with blank line padding; asserts sanitized payload on the message event. The `events[1]` equality check confirms the non-text event is passed through without mangling. Line 33. |
| 2 | `preserves raw replay JSONL only when explicitly opted in` | A | REAL | Passes `storeRawTranscript: true` with `allowRawTranscriptStorage: true`; confirms raw secret text survives. Line 41. |
| 3 | `reports replay parse errors with a line number` | A | REAL | Feeds `'{"id":"ok"}\nnot-json'`; asserts `/line 2/i` in thrown message. Would fail if `parseReplay` changed error format. Line 63. |
| 4 | `builds session records using min and max timestamps instead of event order` | A | REAL | Events are in reversed timestamp order; asserts `startedAt` is the minimum and `updatedAt` is the maximum. Tests the `<` / `>` comparisons in `buildSessionRecord`. Line 67. |
| 5 | `buildSessionRecord with empty array uses epoch defaults` | B | REAL | Tests the `new Date(0).toISOString()` fallback. Grade B because this is a trivial edge case. Line 82. |
| 6 | `buildSessionRecord ignores invalid timestamps when computing bounds` | A | REAL | Mixes `'not-a-date'` with a valid timestamp; asserts the valid one survives as both bounds. Tests the `normalizeTimestamp` null-skip logic. Line 91. |
| 7 | `serializeEvents produces one JSON line per event` | B | WEAK | Counts lines and checks each is valid JSON. Does not assert anything about the content, sanitization, or field preservation. A trivial structural check. Line 102. |
| 8 | `parseReplay on a single corrupt line throws with line number` | B | REAL | Variant of test #3 for a single-line input. Adds marginal value over test #3. Line 110. |
| 9 | `round-trips the happy-path replay fixture` | A | REAL | Reads the actual `happy-path.replay.jsonl` fixture from disk, parses it, re-serializes, re-parses, then asserts: (a) sanitization ran (`cwd: '[redacted-path]'`), (b) the round-tripped result differs from the original (the mutation is real). This is the most complete test in the file. Line 114. |
| 10 | `parseReplay throws on corrupt-partial fixture (corrupt line)` | A | REAL | Reads `corrupt-partial.replay.jsonl` from disk and asserts the error references line 3. Validates the fixture itself matches the production error path. Line 124. |

---

### `tests/phase1-integration.test.ts` — overall grade: B−

**Label assessment:** The `Phase 1 integration` label is partially honest. These tests drive real production code (`parseClaudeTranscriptJsonl`, `parseReplay`, `deriveState`) against real fixture files, with no mocking. However:
- All fixtures are hand-crafted toy sessions (6–13 lines). They do not contain realistic content volumes, edge cases from real Claude output, or any data shape not explicitly chosen by the test author.
- The `deriveState` assertions are tightly coupled to fixture-specific data (exact `filePath` substrings, specific risk signal wording, specific agent node IDs). This means the tests are verifying that _the fixture produces the expected output_, not that _real transcripts produce correct output_.
- The "integration" label is technically correct (multiple real layers compose), but the fixture thinness limits what is actually proven.

| # | Test case | Grade | Verdict | Notes |
|---|-----------|-------|---------|-------|
| 1 | `happy-path: derives implementation phase + file attention` | B | REAL | `activePhase === 'implementation'` would fail if `detectPhase` stopped detecting Write tools. `fileAttention.some(f => f.filePath.includes('logger.ts'))` would fail if `extractFilePath` broke. `riskSignals` length and `transcript.length` are meaningful. Grade B not A because the fixture is trivially small. Line 30. |
| 2 | `risk-escalation: derives validation phase + multiple risk signals` | B | REAL | Tests three distinct assertions: `validation` phase (from Bash tools), `'failed tool call'` risk, and `'churn'` risk. All would fail on real regressions. The fixture has 3 `tool_failed` events and 4–5 `Bash` calls — just enough to trigger both thresholds. Line 43. |
| 3 | `tool-heavy: derives validation phase + bash-churn risk` | C | WEAK | Comment at line 63 says "5 in fixture — just under the 6-call exploration threshold, so exploration risk may or may not fire." The test _only_ asserts `bash churn` is present. This is under-specified: the fixture was crafted around the threshold but the test doesn't verify the threshold holds. Line 55. |
| 4 | `subagent-flow: captures objective from first user message` | B | REAL | `currentObjective.toContain('end-to-end tests')` and `fileAttention.some(f => f.filePath.includes('.spec.ts'))` are both data-path assertions. Line 67. |
| 5 | `happy-path replay: implementation phase, logger.ts in file attention` | B | REAL | Mirrors test #1 but over the replay fixture format. `shadowInsights.some(i => i.kind === 'phase')` adds one meaningful check on the insights builder. Line 78. |
| 6 | `risk-escalation replay: multiple failed tools → risk signals present` | B | REAL | `riskSignals.length >= 2` and `shadowInsights.some(i => i.kind === 'risk')` are correct regression guards. Line 88. |
| 7 | `subagent-flow replay: parent + subagent nodes in agentNodes` | A | REAL | Asserts specific `agentNode` IDs (`'orchestrator'`, `'playwright-setup'`) and the subagent's `state === 'completed'`. This is the most specific integration assertion in the file; it would catch a regression in the agent-map building loop in `deriveState`. Line 97. |
| 8 | `all valid fixture replays produce valid DerivedState without throwing` | F | FICTION | Runs `parseReplay` + `deriveState` over the same three fixtures tested in tests #5, #6, and #7 above. The `not.toThrow()` assertion adds zero new information — if any fixture caused a throw, the earlier test for that fixture would already have failed. This is duplication masquerading as coverage. Line 110. |

---

## Cross-cutting findings

### "Integration" / "e2e" label inflation

- `tests/integration/e2e-jsonl-to-state.test.ts` earns the label: real transport + real parser + real buffer + real derive. However it uses a 6-line fixture, limiting real-world coverage.
- `tests/phase1-integration.test.ts` calls itself "integration" and "end-to-end" in its header comment. It is more accurately a **fixture-driven pipeline test**: real code, fake data. The label is acceptable but the fixture thinness should be documented. No mock boundary issue.

### Mocking the unit under test

- `tests/electron/start-main-process.test.ts` mocks `session-io` entirely. This is honest for an Electron IPC wiring test — `session-io` itself is tested in `session-io.test.ts`. No violation.
- `tests/electron/start-main-process-privacy.test.ts` mocks `session-manager`, `inference-engine`, and all Electron APIs. The mock boundary is honest: the goal is testing the startup _wiring_, not the subsystems.

### Tautological / cannot-fail assertions

- `tests/electron/renderer-host.test.ts:58` — `host.loadInitialSnapshot !== bridge.bootstrap`: always true by construction (see `renderer/host.ts:47`).
- `tests/electron/start-main-process.test.ts:244-256` — `typeof result.bootstrap === 'function'` etc.: the test sets up the bridge object, so this can only fail if the test's own literal is wrong.
- `tests/phase1-integration.test.ts:110-123` — `not.toThrow()` over fixtures covered by the three preceding tests.

### Coverage gaps not addressed by these test files

- `saveReplayFile` happy-path (dialog not cancelled, file actually written): zero real-I/O test. The persistence tests cover `serializeEvents`, but the `dialog.showSaveDialog` → `writeFile` path in `session-io.ts` is tested only with a full mock.
- `loadTranscriptPrivacySettings` with a real `.env` file: no test exercises the `parseDotenv` branch.
- `detectPhase` `'planning'` branch (Todo/Plan tools): no fixture contains these tool names.
- `computeWatchDelay` backpressure logic in `transcript-watcher.ts`: not covered in any audited file.
- `appendEvent` interaction with the privacy gate: `persistence.test.ts` tests the happy-path append but does not test that appended events are also sanitized.
