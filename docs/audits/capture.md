# Test Audit — capture

## Summary

files: 7 | test cases: 62 | grades A:17 B:27 C:12 D:4 F:2 | REAL:33 WEAK:24 FICTION:5

### Worst offenders

- `tests/capture/capture.test.ts:543–548` — `discoverActiveSession` "returns null" only calls with a non-existent path; the result is trivially null because the path doesn't exist, not because any real discovery logic ran. Asserts nothing about the dispatcher contract.
- `tests/capture/capture.test.ts:558–565` — IpcBridge "calls buffer.subscribe" asserts only that a mock method was called once; the mock buffer is wired so subscribe always succeeds. Would still pass if the bridge called subscribe zero times and then the mock was accidentally set up with `mockReturnValue` (no, it would fail — but see note below). Actually a weak wiring check, not behavior.
- `tests/capture/drivers/harness-driver.test.ts:83–93` — singleton `driverRegistry` tests assert that the live singleton imported from production code is seeded correctly. These are valid for smoke, but they assert a constant object identity (`toBe(claudeCodeDriver)`) — they would pass even if the registry's `getForSource` logic were completely removed and the returned value hardcoded. Grade reflects the tautological nature.

---

## Per file

---

### `tests/capture/capture.test.ts` — overall grade: B

| # | Test case | Grade | Verdict | Notes |
|---|-----------|-------|---------|-------|
| 1 | `createIncrementalParser` — emits complete lines and holds partial tail | A | REAL | Drives real parser; split-chunk partial buffering is genuinely tested. Failure if `lineBuffer` accumulation or split logic broken. |
| 2 | handles CRLF line endings | A | REAL | Drives real `\r?\n` regex split; would fail if CRLF not stripped. |
| 3 | skips invalid JSON lines without throwing | A | REAL | Drives real try/catch JSON parse; would fail if errors were not suppressed. |
| 4 | reset clears buffered partial line | A | REAL | Drives real `reset()` (`lineBuffer = ''`); would fail if reset didn't clear state. |
| 5 | empty string chunk is a no-op | B | REAL | Drives real path; trivially passes today but would detect regressions if empty-string handling were changed to emit something. |
| 6 | whitespace-only lines between valid JSON are silently skipped | A | REAL | `trimmed` → empty → `continue` path; would fail if whitespace trim removed. |
| 7 | multiple complete JSON lines in a single push are all emitted | A | REAL | Tests the `for (const line of parts)` loop for multiple entries; would fail if loop stopped early. |
| 8 | `normalizeEntry` — maps a message entry to a CanonicalEvent | B | WEAK | Uses `type: 'say'` which the normalizer doesn't gate on — correct but accidentally so. The test's intent says "say type", but production keys off `entry.message` existence. If production added a strict `type` gate the test would fail for the wrong reason. Asserts only `kind`, `source`, `sessionId` — doesn't verify `actor`, `payload.text`, or `harnessId`. |
| 9 | maps a tool_use entry | B | WEAK | Same `type: 'say'` incidental pass issue. Asserts only `kind`; misses `toolName`, `toolUseId`, `args`. |
| 10 | maps a tool_result entry | B | WEAK | Same issue. Asserts only `kind`. |
| 11 | returns empty array for unknown entry types | B | REAL | `{ type: 'unknown_type' }` has no `message`, no `cwd` — exercises the `if (!message) return events` early-exit. Would fail if that guard removed. |
| 12 | `is_error:true` tool_result maps to `tool_failed` kind | A | REAL | Drives real `isError` branch; asserts `kind`, `payload.toolUseId`, `payload.error`. Would fail if `is_error` check removed. |
| 13 | `tool_started` payload contains `toolName` and `toolUseId` | A | REAL | Fully asserts the tool_use payload shape; would fail if payload keys renamed or moved. |
| 14 | `message.content` as string produces a single message event | A | REAL | Drives the `typeof content === 'string'` branch; asserts `kind`, `payload.text`, `actor`. |
| 15 | session entry (`type="session"`) maps to `session_started` with cwd | A | REAL | Drives `type === 'session'` branch; asserts `kind`, `actor`, `payload.cwd`. |
| 16 | content array with multiple blocks produces one event per block | A | REAL | Drives mixed-block loop; asserts lengths and both kinds. |
| 17 | `createEventBuffer` — pushes events and returns via getAll | A | REAL | Drives real buffer with real temp dir; disk I/O exercised. |
| 18 | spills oldest events to disk when in-memory window rolls over | A | REAL | Drives real spill logic; asserts `memoryDepth`/`spilledDepth`. Would fail if spill threshold broken. |
| 19 | sanitizes transcript content before spilling to disk | A | REAL | Reads actual spill file from disk and checks redaction. Textbook REAL — would catch privacy regressions. |
| 20 | drops oldest spilled events once total capacity exceeded | A | REAL | Drives real drop logic; asserts surviving IDs in order. |
| 21 | getRecent returns last n across memory and spill | A | REAL | Cross-layer read; would fail if spill read broken. |
| 22 | getSince returns events after a given id when older items spilled | A | REAL | Exercises spill + memory join; would fail if `findIndex` on spilled data broken. |
| 23 | getSince returns all events when id not found | B | REAL | Covers fallback path; only one assertion (`toHaveLength(2)`). Could also assert IDs. |
| 24 | subscribe is notified on push | A | REAL | Drives real subscriber set; would fail if `notify()` not called. |
| 25 | unsubscribe stops notifications | A | REAL | Drives real `subscribers.delete`; would fail if unsubscribe did nothing. |
| 26 | tracks consumer checkpoints against spilled data | A | REAL | Complex multi-step: register, readPending, commitCheckpoint, push more, readPending again, check lag. Drives real checkpoint file I/O. Excellent. |
| 27 | reports high backpressure as queue fills | A | REAL | Drives real watermark computation; asserts level transitions. |
| 28 | clear empties queue and resets checkpoints | A | REAL | Multi-step; asserts size, getAll, and consumer lastOffset. |
| 29 | `computeWatchDelay` — keeps base delay when pressure is normal | B | REAL | Drives real function; hardcoded magic numbers (100, 250, 500) mirror production constants. Would break if constants changed without test update — coupling to impl detail. |
| 30 | increases debounce as backpressure rises | B | REAL | Same constant-coupling issue as above. |
| 31 | `discoverActiveSession` — returns null for nonexistent path | D | WEAK | Only exercises the override-path-not-found branch (stat throws → return null). This is a degenerate case. The dispatcher's multi-driver logic is not tested at all. The test name says "no JSONL files" but what actually determines the null return is a file-not-found error, not "no files exist". Misleading name. |
| 32 | `createIpcBridge` — calls buffer.subscribe to wire up push notifications | C | WEAK | Asserts `buffer.subscribe` called once on a fully-mocked buffer. The mock buffer's subscribe is a vi.fn — this verifies wiring, not behavior. Would still pass if the bridge subscribed but never acted on events. |
| 33 | calls unsubscribe function on cleanup | B | REAL | Verifies the cleanup closure returned by start() calls the function returned by subscribe. Genuine lifecycle contract. |
| 34 | removes old IPC handlers before registering new ones | B | REAL | Checks ordering of removeHandler before handle via invocationCallOrder. Genuine contract, though the mock ipcMain means it's pure call-order bookkeeping. |
| 35 | shadow:snapshot handler calls buildSnapshot and returns its result | B | REAL | Exercises the actual IPC handler extracted from handleMock, calls it, verifies buildSnapshot delegation and return value. Real enough. |
| 36 | shadow:events-since handler delegates to buffer.getSince | B | REAL | Same pattern — extracts real handler, verifies delegation and return. |
| 37 | cleanup removes both IPC handlers | B | REAL | Verifies cleanup() calls removeHandler for both channels. |
| 38 | debounces rapid push callbacks: 5 signals → 1 wc.send | A | REAL | Uses fake timers; drives real debounce logic; asserts batching. Would fail if debounce removed or timer changed. Best test in the IpcBridge section. |

---

### `tests/capture/capture-transports.test.ts` — overall grade: A

| # | Test case | Grade | Verdict | Notes |
|---|-----------|-------|---------|-------|
| 1 | file-tail transport replays replacement files when head checksum changes | A | REAL | Uses real tempdir, writes real files, renames to simulate rotation. Tests `hasFingerprintChanged` + `onSessionReset('rotation')`. Would fail if fingerprint or reset logic broken. Best transport test. |
| 2 | http-stream transport reconnects and emits streamed chunks | A | REAL | Spins a real `http.Server` on a random port; verifies reconnect after first response ends. No mocking of the transport itself. |
| 3 | websocket transport normalizes framed messages and reconnects after close | B | REAL | Uses a hand-rolled MockWebSocket — necessary since browser WebSocket not available in Node, but the mock only exposes the public contract (onopen/onmessage/onclose). Tests reconnect logic effectively. Grade B only because the mock is entirely in-test, so drift from the real WebSocket API would go unnoticed. |
| 4 | socket transport reconnects after disconnects | A | REAL | Uses real `net.Server`; verifies multi-connection sequence. No mocking of production code. |

---

### `tests/capture/session-manager.test.ts` — overall grade: B

| # | Test case | Grade | Verdict | Notes |
|---|-----------|-------|---------|-------|
| 1 | routes pluggable transport chunks through parser resets into the live snapshot | A | REAL | Integration: drives real session-manager with a real event buffer, a fake transport that emits real CaptureTransportContext calls, and polls `getCurrentSnapshot()`. Tests that a partial line before reset is discarded and only post-reset content appears. Genuinely exercises the parser-reset → normalizer → buffer → snapshot pipeline. The `subscriptionStopped` assertion on `stop()` also verifies lifecycle. |
| 2 | quarantines model insights: setModelInsights replaces heuristic insights | B | REAL | Drives real `setModelInsights`/`getCurrentSnapshot` cycle; verifies heuristic-vs-model quarantine contract from `buildSnapshot`. Would fail if the `latestModelInsights.length > 0` guard in session-manager removed. The `before` snapshot relies on heuristics being non-empty — implicitly depends on derive.ts producing at least one insight for an empty event set, which is true but fragile if derive's default output changed. |

---

### `tests/capture/ipc-bridge.test.ts` — overall grade: B

| # | Test case | Grade | Verdict | Notes |
|---|-----------|-------|---------|-------|
| 1 | emits empty `shadow:events` batch on dirty-only flush | B | REAL | Uses `wait(220)` (wall-clock sleep) rather than fake timers — this is a minor flakiness vector on slow CI (the 150ms debounce + 220ms wait has only 70ms margin). Asserts `wc.send` called with `[]` and `commitCheckpoint` NOT called. Real behavior under test; the no-commit guard is exactly what the comment in production code says to protect. |
| 2 | `markDirty` before `start()` is a no-op | C | WEAK | Asserts `wc.send` not called after `wait(220)`. This would pass vacuously even if markDirty had no implementation at all — the guard `if (!started) return` is correct but the test is really just "calling a function doesn't crash and doesn't send". No positive assertion that dirty state was actually ignored (vs. never set). |

---

### `tests/capture/drivers/discovery.test.ts` — overall grade: A

| # | Test case | Grade | Verdict | Notes |
|---|-----------|-------|---------|-------|
| 1 | returns null when no drivers have discovery | A | REAL | Drives real dispatcher with a real registry missing a `discovery` property; confirms the guard `if (!driver?.discovery) continue` works. |
| 2 | returns null when drivers have discovery but no sessions | A | REAL | Drives real dispatcher with a driver returning empty sessions array. |
| 3 | returns latest session across multiple drivers | A | REAL | Drives real sort logic; asserts winner by lastModified. Would fail if sort direction reversed. |
| 4 | propagates discovering driver's source through the dispatcher | A | REAL | Verifies `source` attribution on the winning session — the regression this was added to prevent (silently using wrong driver) is clearly documented in the test comment. |
| 5 | skips failing driver and considers others | A | REAL | Drives real try/catch in dispatcher; verifies error isolation. |
| 6 | override path short-circuits driver dispatch | A | REAL | Creates real file; asserts `filePath`, `sessionId`, `source`. Empty registry proves override doesn't depend on dispatch. |
| 7 | override source can be customized via options | A | REAL | Verifies `overrideSource` option threads through to returned session. |
| 8 | returns null when override path does not exist | B | REAL | Same degenerate case as capture.test.ts #31 — stat-throws-returns-null. Correctly placed here in the dispatcher context at least. |
| 9 | `claude-code DiscoveryStrategy` — returns empty array when projectsDir does not exist | A | REAL | Drives real `findJsonlFiles` with nonexistent path; verifies graceful ENOENT handling. |
| 10 | walks projectsDir recursively for .jsonl and .ndjson files | A | REAL | Creates real fs structure with mtimes; asserts file count, IDs, extension filter, source stamp. Comprehensive. |
| 11 | integrates with the dispatcher to surface a claude-code session | A | REAL | End-to-end: real file, real driver, real dispatcher, real result. |

---

### `tests/capture/drivers/harness-driver.test.ts` — overall grade: B

| # | Test case | Grade | Verdict | Notes |
|---|-----------|-------|---------|-------|
| 1 | registers a driver and retrieves it by id | B | REAL | Drives real registry `get()`; would fail if byId map broken. |
| 2 | resolves driver by known EventSource | B | REAL | Drives real `getForSource()`; would fail if bySource map broken. |
| 3 | returns undefined for unregistered EventSource | B | REAL | Verifies absent-key path. |
| 4 | getDefault returns the first registered driver | B | REAL | Verifies `defaultDriverId` logic. |
| 5 | getDefault throws when registry is empty | A | REAL | Exercises the throw branch; would fail if throw removed. |
| 6 | registeredIds lists all registered driver IDs | B | REAL | Asserts `toContain` — weak (doesn't assert exact set), but still fails if registration broken. |
| 7 | supports multiple drivers with non-overlapping source sets | A | REAL | Registers two drivers, verifies each source maps to the correct driver. |
| 8 | singleton `driverRegistry` — has claude-code pre-seeded | C | WEAK | Imports live singleton and asserts `toBe(claudeCodeDriver)` — this is asserting object identity of a constant. If the singleton's `getForSource` logic were broken but still returned the right object, these would still pass. No behavior tested. |
| 9 | falls back to claude-code for unknown source via getDefault | C | WEAK | `getForSource('future-harness')` → undefined, `getDefault()` → claudeCodeDriver. The `undefined` assertion is real; the `getDefault()` assertion is the same object-identity tautology as above. |
| 10 | claude-code driver stamps `harnessId: 'claude-code'` on session_started | A | REAL | Drives real driver normalizeEntry; asserts harnessId on output. |
| 11 | stamps harnessId on plain text message events | A | REAL | Same — real driver, real assertion. |
| 12 | stamps harnessId on tool_use block events | A | REAL | Real driver, real kind + harnessId assertion. |
| 13 | stamps harnessId on tool_result block events (success) | A | REAL | Drives tool_result path; asserts kind = tool_completed and harnessId. |
| 14 | stamps harnessId on tool_result block events (error) | A | REAL | Drives is_error branch; asserts kind = tool_failed and harnessId. |
| 15 | returns empty array for entries without message and no cwd session | A | REAL | Verifies the `if (!message) return events` guard; would fail if guard removed. |
| 16 | source propagation — defaults to claude-transcript when no source supplied | A | REAL | Verifies default source parameter; would fail if default changed. |
| 17 | stamps the supplied source on every emitted event (claude-hook) | A | REAL | Multi-block entry; all events checked for source. |
| 18 | honours an arbitrary future EventSource string | B | REAL | Passes a synthetic source string; useful coverage of the open-type design. |
| 19 | legacy normalizer.ts shim re-exports the same normalizeEntry function | C | WEAK | Calls both and compares `kind` and `harnessId` — IDs differ (randomUUID) so can't do deep equal. The assertion (`fromShim[0]?.kind === fromDriver[0]?.kind`) would pass even if the shim exported a completely different function that happened to return `session_started`. What it really tests is that the shim doesn't throw. The comment about "IDs will differ" reveals this is a known cop-out. |

---

### `tests/capture/normalizer-derive-seam.test.ts` — overall grade: A

| # | Test case | Grade | Verdict | Notes |
|---|-----------|-------|---------|-------|
| 1 | populates fileAttention from tool args nested under payload.args | A | REAL | Drives real normalizer → real deriveState pipeline; asserts `fileAttention` populated correctly for Edit/Read/Grep tool blocks. This test guards a previously-hidden bug (derive only checked payload top-level, not `payload.args`). Would fail if the `nested?.[key]` path in `extractFilePath` is removed. Also asserts `activePhase === 'implementation'` from real phase detection. |
| 2 | captures thinking blocks as transcript text instead of dropping them | A | REAL | Drives real `blockType === 'thinking'` branch added to normalizer; asserts event is emitted and surfaces in `state.transcript`. Would fail if thinking block handling removed. Seam test exposing a second previously-hidden bug. |

---

## Cross-cutting observations

**Type: 'say' in capture.test.ts normalizer tests (lines 191, 209, 223, 242, 264, 285, 318):**
The eight normalizer tests in `capture.test.ts` (tests #8–16) pass `type: 'say'` but the production normalizer in `src/capture/drivers/claude-code/normalizer.ts` does not gate on this value — it only cares about `type === 'session'` and `entry.message`. The tests work because `'say'` falls through to the `message`-content branch, but the claimed coverage of "a say-type entry" is misleading: if the real transcript format changed to `type: 'assistant'` and the normalizer added a strict type gate, these tests would fail for the wrong reason. Grade impact: B (not F) because the underlying code path IS exercised, just incorrectly labelled.

**ipc-bridge.test.ts wall-clock sleep (line 37, 49, 67):**
`wait(220)` for a 150ms debounce has only 70ms margin. Fragile on slow CI. Should use fake timers (as `capture.test.ts` test #38 correctly does).

**Mock buffer in capture.test.ts IpcBridge tests:**
`makeMockBuffer()` mocks every method including `getSince`, `readPending`, `commitCheckpoint`. The IPC handler tests (#35, #36) verify that the bridge delegates to the buffer methods, but the buffer methods themselves are mocked — so these are wiring tests, not end-to-end behavioral tests. Acceptable given the buffer has its own comprehensive tests.

**session-manager.test.ts "heuristic insights" assumption (test #2, line 114):**
`expect(before?.state.shadowInsights.length ?? 0).toBeGreaterThan(0)` assumes `deriveState` on zero events produces at least one heuristic insight. This is currently true (buildInsights always emits an 'objective' and 'phase' insight), but the test will fail silently in the wrong direction if derive's output for empty inputs changes — it would produce a false pass rather than a meaningful failure.
