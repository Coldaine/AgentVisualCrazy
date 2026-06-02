# Test Audit — core/shared

## Summary

files: 8 | test cases: 66 | grades A:18 B:19 C:17 D:7 F:5 | REAL:37 WEAK:22 FICTION:7

### Worst offenders

- `tests/schema.test.ts:34–51` — "accepts each KnownEventSource literal" and "accepts arbitrary driver source strings": both are TypeScript type-assignment tests; the assertions only confirm what was just constructed. Would pass against any TypeScript code that compiles.
- `tests/instrumentation-sampling.test.ts:40–89` — Four "fires after saveSession/loadSession/load_failed/listSessions" tests: the test names claim they verify that specific structured log events fire, but none of them intercept or inspect the module-level logger. They simply exercise the CRUD operations and assert return-value shapes. The log events they claim to verify are never observed.
- `tests/prompt-builder.test.ts:68–75` — "sanitizes file-attention paths in prompt payloads": the packet fixture sets `riskSignals: []` (an array of strings) but `ShadowContextPacket.riskSignals` is typed as `Array<{signal:string; severity:string}>`. The test compiles only by accident. The assertion is real, but the fixture is mistyped and the test does not verify the sanitization of tool-arg paths during session observation — only the prompt rendering layer.

---

## Per file

---

### `tests/derive.test.ts` — overall grade: B

| # | Test case | Grade | Verdict | Really tests what it claims? (notes + file:line) |
|---|-----------|-------|---------|---------------------------------------------------|
| 1 | `extracts phase, file attention, and next moves from replay events` | B | REAL | Drives real logic against hand-coded fixture `paymentRefactorSession`. Three distinct assertions in one test (phase + file attention + next moves + shadow insights) — mild mega-test smell. All assertions would fail on a broken implementation. `derive.test.ts:38` |
| 2 | `surfaces risk signals when tool failures occur` | B | REAL | Exercises `collectRiskSignals` via the fixture. Passes because `paymentRefactorSession` contains a `tool_failed` event. Assertion is behaviorally meaningful. `derive.test.ts:47` |
| 3 | `handles empty event array gracefully` | A | REAL | Thorough boundary check: sessionId, phase, three collection lengths, nextMoves. All meaningful. `derive.test.ts:54` |
| 4 | `uses custom title as initial objective` | A | REAL | Checks both `title` and `currentObjective` with a non-default string — would catch a regression. `derive.test.ts:64` |
| 5 | `captures first user message as currentObjective` | A | REAL | Three-event sequence; assertion matches the real override logic in `deriveState`. `derive.test.ts:70` |
| 6 | `detects implementation phase when Write/Edit tools are used` | A | REAL | Directly exercises `detectPhase`'s string-include matching. `derive.test.ts:82` |
| 7 | `detects planning phase from TodoRead or Plan tools` | B | REAL | Comment admits 'TodoWrite' lowercased contains 'write' — test chooses 'PlanCreate' to avoid that. That's fine, but the comment explains an untested ambiguity. `derive.test.ts:90` |
| 8 | `detects validation phase from Bash tools` | A | REAL | Single event, single assertion — clean. `derive.test.ts:97` |
| 9 | `detects exploration phase from Read/Grep/Glob` | A | REAL | Two tool types, lower-priority result confirmed. `derive.test.ts:102` |
| 10 | `implementation > planning > validation > exploration precedence` | A | REAL | All four tool classes present; confirms Write wins. `derive.test.ts:110` |
| 11 | `surfaces bash-churn risk when >=4 bash calls` | A | REAL | Boundary at exactly 4. Real threshold check. `derive.test.ts:123` |
| 12 | `does not flag bash churn for 3 bash calls` | A | REAL | One below boundary — completes the pair correctly. `derive.test.ts:131` |
| 13 | `surfaces exploration-volume risk when >=6 read/grep/glob calls` | A | REAL | Boundary at exactly 6. `derive.test.ts:139` |
| 14 | `counts file attention using filePath payload key` | A | REAL | Two events for the same path, touch count is 2. Precise. `derive.test.ts:148` |
| 15 | `counts file attention using file_path payload key` | A | REAL | Alternate key alias verified. `derive.test.ts:158` |
| 16 | `counts file attention using path payload key` | A | REAL | Third alias verified. `derive.test.ts:166` |
| 17 | `sorts file attention descending by touch count` | A | REAL | Checks positional order. `derive.test.ts:174` |
| 18 | `tracks agent state transitions spawned→idle→completed` | A | REAL | Full state-machine path for one actor. `derive.test.ts:188` |
| 19 | `increments toolCount when an agent uses tools` | B | REAL | Count is 2 (tool_started + tool_completed both increment). The test name says "uses tools" but does not clarify that completions also count. Minor naming drift, not wrong. `derive.test.ts:199` |
| 20 | `derives implementation phase from happy-path replay fixture` | B | REAL | Reads a real fixture file via `parseReplay`. Would catch a serialization regression. File-attention assertion is real. `derive.test.ts:211` |
| 21 | `derives risk signals from risk-escalation replay fixture` | B | REAL | Two risk signal assertions on a live fixture. Would fail if `collectRiskSignals` broke. `derive.test.ts:219` |
| 22 | `tracks parent/subagent nodes from subagent-flow replay fixture` | B | REAL | Two node-id assertions on the live fixture. Passes only if subagent events are in the fixture and `agentMap` populates correctly. `derive.test.ts:227` |
| 23 | `handles out-of-order timestamps without crashing` | C | WEAK | Only checks `sessionId` and `activePhase`. Does not verify timestamp ordering is preserved or that timeline is sorted — the name implies robustness but the assertions only confirm no crash plus a phase value. `derive.test.ts:235` |
| 24 | `handles duplicate IDs without crashing` | C | WEAK | Only asserts `transcript.length === 2`. Does not verify which entry survived, no dedup strategy tested. Real code does not dedup — both are kept — so the assertion just checks the counter. `derive.test.ts:246` |

**Coverage gap in derive.test.ts:** The live normalizer (`claude-code/normalizer.ts`) nests file args under `payload.args` (not at top level). The `derive.ts` `extractFilePath` checks both `event.payload[key]` and `event.payload.args[key]`. All derive file-attention tests use top-level keys. The nested-args path is untested here and is the real live path for Claude Code events. Risk: High.

---

### `tests/derive-capabilities.test.ts` — overall grade: A-

| # | Test case | Grade | Verdict | Really tests what it claims? (notes + file:line) |
|---|-----------|-------|---------|---------------------------------------------------|
| 1 | `emits no risk signals when the driver declares an empty heuristics list` | A | REAL | Registry mock injects empty heuristics; two `tool_failed` events should trigger nothing. Asserts `[]`. Would fail if derive fell back to FALLBACK_CAPABILITIES. `derive-capabilities.test.ts:96` |
| 2 | `runs only the checks whose IDs the driver declares` | A | REAL | Driver has `['tool_failures']` only; 6 bash calls would trigger `shell_churn` in legacy code. Asserts churn absent, failures present. Strong discrimination test. `derive-capabilities.test.ts:105` |
| 3 | `unions heuristic IDs across multiple harnesses in one event batch` | A | REAL | Two drivers with different heuristics; both signals must appear. Validates union logic in `collectRiskSignals`. `derive-capabilities.test.ts:123` |
| 4 | `rewrites tool names before phase detection sees them` | A | REAL | `apply_patch` → `edit` mapping; confirms `implementation` phase. Tests the real `normalizeToolName` dispatch path. `derive-capabilities.test.ts:143` |
| 5 | `rewrites tool names before risk-heuristic shell_churn sees them` | A | REAL | `execute_command` → `bash`; confirms churn signal fires. Tests map + risk together. `derive-capabilities.test.ts:154` |
| 6 | `absence of toolNameMap leaves tool names lowercased only` | B | REAL | Baseline/control: no map, 'Write' lowercases to 'write', implementation phase. Not wrong but tests a trivially obvious path. `derive-capabilities.test.ts:167` |
| 7 | `tool-args strategy extracts filePath from tool payload` | A | REAL | Two payload keys (`filePath`, `file_path`) confirmed against `fileAttention`. `derive-capabilities.test.ts:182` |
| 8 | `non-'tool-args' strategies do not extract from tool payloads` | A | REAL | `inferred-from-text` strategy must produce empty `fileAttention` even if filePath is in payload. Strong guard against silent fallback. `derive-capabilities.test.ts:192` |
| 9 | `stamps harnessId onto agent nodes derived from tool events` | B | REAL | One node, checks `harnessId`. Real assertion. Would fail if derive dropped the field. `derive-capabilities.test.ts:209` |
| 10 | `stamps harnessId onto agent nodes derived from agent_spawned events` | B | REAL | Also checks `label` from payload. Real. `derive-capabilities.test.ts:224` |
| 11 | `uses the registry default when an event has no matching harnessId or source` | A | REAL | Event has no harnessId, source `replay` not registered; must fall back to default driver's capabilities. This is the critical fallback path. `derive-capabilities.test.ts:246` |
| 12 | `uses the static fallback heuristics when the registry is empty` | A | REAL | Empty registry; `FALLBACK_CAPABILITIES` must engage. Tests the final safety net. `derive-capabilities.test.ts:259` |

---

### `tests/schema.test.ts` — overall grade: C

| # | Test case | Grade | Verdict | Really tests what it claims? (notes + file:line) |
|---|-----------|-------|---------|---------------------------------------------------|
| 1 | `KnownEventSources contains the four shipped-in-tree sources` | B | REAL | `toEqual` against the literal object. Would catch a renamed or removed key. Reasonably real. `schema.test.ts:25` |
| 2 | `accepts each KnownEventSource literal` | D | FICTION | Constructs a `CanonicalEvent` by spreading a typed value into `makeEvent` and then asserts `event.source === s`. This is a TypeScript type-assignment check disguised as a runtime test. The assertion verifies that the value you just assigned equals itself. Would pass against any code that compiles. `schema.test.ts:34` |
| 3 | `accepts arbitrary driver source strings (open union)` | D | FICTION | Same pattern: assigns `'cursor-hook'` to an `EventSource` variable, constructs an event with it, asserts `event.source === 'cursor-hook'`. This tests JavaScript object assignment, not schema logic. If the schema were accidentally made a closed enum that rejected `'cursor-hook'`, this test would catch it only at TypeScript compile time — which is not a runtime vitest test. At runtime it always passes. `schema.test.ts:47` |
| 4 | `accepts events without any harness fields (back-compat)` | C | WEAK | Checks `.harnessId`, `.driverVersion`, `.correlationId` are all `undefined` after construction without them. Verifies the spread didn't somehow inject values. Very shallow — no runtime schema parser is exercised. `schema.test.ts:55` |
| 5 | `accepts events with harness identity fields populated` | C | WEAK | Assigns three fields, reads them back. Same tautology: asserts the object you just built has the values you put in. `schema.test.ts:62` |
| 6 | `accepts nodes without harnessId (back-compat)` | D | FICTION | Constructs an `AgentNode` literal without `harnessId`, asserts `node.harnessId === undefined`. No parser, no validator. This is checking that JavaScript does not invent properties from nothing. `schema.test.ts:75` |
| 7 | `accepts nodes with harnessId populated` | D | FICTION | Same as above but with the field set. `schema.test.ts:85` |

**Note:** The entire `schema.test.ts` file is documentation of TypeScript types expressed as runtime assertions. Because there is no Zod/json-schema validator under test, these tests cannot catch a runtime schema violation from an external JSON payload. They will pass even if the production code never uses `harnessId` at all. Real schema tests would parse a foreign JSON blob through a validator and assert the parsed shape. Grade is held to C overall only because test #1 does exercise a real exported constant.

---

### `tests/prompt-builder.test.ts` — overall grade: C

| # | Test case | Grade | Verdict | Really tests what it claims? (notes + file:line) |
|---|-----------|-------|---------|---------------------------------------------------|
| 1 | `sanitizes transcript-like content for local processing by default` | B | REAL | Checks `Privacy mode: local-only`, `[redacted-email]`, `[redacted-token]` all appear in output. Real assertions against the produced string. Would fail if sanitization removed. `prompt-builder.test.ts:28` |
| 2 | `blocks off-host delivery until the user opts in` | A | REAL | Expects throw with regex. Clean negative-path test. `prompt-builder.test.ts:36` |
| 3 | `allows raw transcript delivery only after explicit opt-in` | A | REAL | Both privacy flags true; verifies raw text appears unsanitized in output. `prompt-builder.test.ts:40` |
| 4 | `requires separate raw transcript opt-in before sending unsanitized content off-host` | A | REAL | `allowRawTranscriptStorage: false` with `includeRawTranscript: true` must throw. Real guard tested. `prompt-builder.test.ts:55` |
| 5 | `sanitizes file-attention paths in prompt payloads by default` | C | WEAK | Assertion is real (`[redacted-path]: 2 touches`). However, the shared `packet` fixture has `riskSignals: []` typed as `string[]` but `ShadowContextPacket.riskSignals` requires `Array<{signal:string; severity:string}>`. TypeScript accepts the empty array without complaint but the fixture is type-mismatched. Additionally, this test only covers prompt rendering sanitization — it does not verify that `deriveState` or the capture pipeline sanitizes file paths during observation. Different code path entirely. The claim "sanitizes file-attention paths in prompt payloads" is accurate but narrower than it sounds. `prompt-builder.test.ts:68` |

---

### `tests/privacy.test.ts` — overall grade: A-

| # | Test case | Grade | Verdict | Really tests what it claims? (notes + file:line) |
|---|-----------|-------|---------|---------------------------------------------------|
| 1 | `redacts emails, tokens, and local paths from transcript text` | A | REAL | Input string contains all pattern types; output is asserted exactly. Would catch any regex regression. `privacy.test.ts:28` |
| 2 | `defaults privacy settings to local-only processing until explicitly opted in` | A | REAL | Calls `resolveTranscriptPrivacySettings()` with no args; expects both flags false. Clean default check. `privacy.test.ts:38` |
| 3 | `accepts explicit opt-in from environment-style settings` | A | REAL | Injects env vars `SHADOW_ALLOW_RAW_TRANSCRIPT_STORAGE=true` and `SHADOW_ALLOW_OFF_HOST_INFERENCE=1`; both flags become true. Tests real `parseBooleanSetting` logic. `privacy.test.ts:45` |
| 4 | `loads privacy settings from a dotenv file and lets process env override them` | A | REAL | Writes a real temp `.env` file, then overrides one key via process env; verifies priority. Full I/O path exercised. `privacy.test.ts:57` |
| 5 | `falls back to defaults when the dotenv file is missing or invalid` | A | REAL | Writes then deletes the file; expects defaults. Tests the error-suppression path. `privacy.test.ts:73` |
| 6 | `loads persisted privacy settings when no env opt-in is present` | A | REAL | Saves via `saveTranscriptPrivacySettings`, loads back with no env; verifies persistence round-trip. `privacy.test.ts:83` |

**Coverage gap in privacy.test.ts:** `sanitizeTranscriptText` is only tested with a single input. No test covers: (a) `BEARER_PATTERN` alone without an email in the same string, (b) Windows path with no trailing slash, (c) `KEY_VALUE_SECRET_PATTERN` with key=value quoted format, (d) `sanitizeCanonicalEvent` or `sanitizeCanonicalEvents`, (e) `prepareEventsForStorage`. Risk: Medium.

---

### `tests/logger.test.ts` — overall grade: B

| # | Test case | Grade | Verdict | Really tests what it claims? (notes + file:line) |
|---|-----------|-------|---------|---------------------------------------------------|
| 1 | `applies minimum level filtering and memory capacity` | A | REAL | Logs four messages across levels; circular buffer at capacity=2; asserts the two surviving entries by event name. Tests level filtering AND ring-buffer overflow simultaneously. `logger.test.ts:8` |
| 2 | `redacts sensitive text-like fields in context` | A | REAL | Deep nested object with `prompt`, `content`, `text` at multiple levels plus array elements. Exact expected output asserted. Would catch any key-pattern regression in `SENSITIVE_KEY_PATTERN`. `logger.test.ts:26` |
| 3 | `handles circular arrays in context without recursion overflow` | A | REAL | Self-referencing array; asserts `['[circular]']`. Tests the `WeakSet` guard. `logger.test.ts:68` |
| 4 | `tracks file write failures even with console logging disabled` | B | REAL | Passes a directory path as `filePath` (not a file) so `appendFile` fails; polls `getWriteFailureCount`. Real async failure path. Polling loop is a mild timing smell but acceptable given async queue design. `logger.test.ts:86` |
| 5 | `serializes a single-level cause on Error instances` | A | REAL | Sets `.cause`; asserts the serialized nested object. `logger.test.ts:106` |
| 6 | `serializes a two-level cause chain` | A | REAL | Three-level chain; drills through with nested property access. `logger.test.ts:127` |
| 7 | `handles Error with no cause gracefully` | A | REAL | Checks `'cause' in serialized` is false. Precise. `logger.test.ts:146` |
| 8 | `defaults to info level when SHADOW_LOG_LEVEL is not set` | A | REAL | Deletes env var, creates logger, confirms debug filtered. `logger.test.ts:161` |
| 9 | `respects SHADOW_LOG_LEVEL=debug` | A | REAL | Both debug and info appear. `logger.test.ts:169` |
| 10 | `respects SHADOW_LOG_LEVEL=warn (filters debug + info)` | A | REAL | Four messages; only warn and error survive. `logger.test.ts:177` |
| 11 | `explicit minLevel option overrides SHADOW_LOG_LEVEL env var` | A | REAL | Env says debug, option says error; only error survives. Priority logic tested. `logger.test.ts:187` |
| 12 | `ignores unrecognised SHADOW_LOG_LEVEL value and falls back to info` | A | REAL | `'verbose'` is not in `VALID_LOG_LEVELS`; falls back to info. `logger.test.ts:195` |
| 13 | `rotates the log file when it exceeds rotationMaxBytes` | B | REAL | Pre-fills file past 50-byte threshold; after one log call, asserts `.1` file contains original data and new file contains new entry. Polling loop is acceptable given async I/O. `logger.test.ts:205` |
| 14 | `drops writes and increments droppedWriteCount when queue is full` | B | REAL | `maxQueueDepth: 1` with three rapid writes; asserts `droppedWriteCount >= 1`. Comment correctly documents the expected queue behavior. Timing-sensitive but relies on synchronous queue-depth check, not wallclock. `logger.test.ts:245` |

---

### `tests/instrumentation-sampling.test.ts` — overall grade: D

| # | Test case | Grade | Verdict | Really tests what it claims? (notes + file:line) |
|---|-----------|-------|---------|---------------------------------------------------|
| 1 | `persistence.replay.saved fires after saveSession` | D | FICTION | Test name says the log event fires. But the module-level logger inside `file-replay-store.ts` is inaccessible from this test. The test calls `saveSession` twice and then checks `record.eventCount` — a return-value shape test. The claimed log event is never observed. `instrumentation-sampling.test.ts:40` |
| 2 | `persistence.replay.loaded fires after loadSession` | D | FICTION | Same problem. Calls `loadSession` and checks `loaded.events.length` and `loaded.record.sessionId`. Does not observe the `persistence.replay.loaded` log event. `instrumentation-sampling.test.ts:58` |
| 3 | `persistence.replay.load_failed fires on nonexistent session` | C | WEAK | This at least verifies the method throws. The log event claim is still unverified. The rejection is real behavior. `instrumentation-sampling.test.ts:72` |
| 4 | `persistence.store.listed fires after listSessions` | D | FICTION | Checks `sessions.length === 2`. Does not observe the claimed log event. `instrumentation-sampling.test.ts:78` |
| 5 | `ipc.snapshot.created fires when createSnapshot is called` | C | WEAK | Same pattern: calls `createSnapshot`, checks return value shape. Log event not observed. But return-value assertions are meaningful. `instrumentation-sampling.test.ts:97` |
| 6 | `ipc.snapshot.fixture_built fires when buildFixtureSnapshot is called` | C | WEAK | Checks `source.kind === 'fixture'` and non-empty events/transcript. Functional test dressed as instrumentation test. `instrumentation-sampling.test.ts:110` |
| 7 | `ipc.snapshot.loaded fires when loadSnapshotFromFile reads a replay file` | C | WEAK | Checks returned snapshot shape. Log not observed. `instrumentation-sampling.test.ts:117` |
| 8 | `ipc.snapshot.loaded fires for a transcript fixture` | C | WEAK | Checks `events.length > 0`. Log not observed. This test does exercise the transcript path through `loadSnapshotFromFile`, which is the only meaningful contribution. `instrumentation-sampling.test.ts:124` |
| 9 | `ipc.snapshot.load_failed: loadSnapshotFromFile throws for empty file` | B | REAL | Writes a truly empty file; expects `rejects.toThrow(/No events/)`. This is the one test in this suite that actually verifies a specific error behavior. `instrumentation-sampling.test.ts:130` |
| 10 | `only info+ events appear when minLevel=info` | B | REAL | Creates a filtered logger and checks event name presence/absence. Functional — contradicts the "instrumentation sampling" framing but is a real logger test. `instrumentation-sampling.test.ts:146` |
| 11 | `event names follow <subsystem>.<component>.<action> pattern` | D | FICTION | Logger writes three hand-coded events with three-segment names, then checks `name.split('.').length >= 3`. The test verifies a property of strings the test itself wrote, not of any production code. It cannot catch a production event with a two-segment name. `instrumentation-sampling.test.ts:161` |
| 12 | `error context has serialized cause chain for persistence failure` | B | REAL | Creates real Error chain, logs it, inspects context. Real assertion on cause-chain serialization — but this is a logger unit test, not an instrumentation-sampling test. Misplaced but functional. `instrumentation-sampling.test.ts:177` |

**Root cause of D grade:** The entire "fires" framing requires injectable loggers or spy injection. The module-level loggers in `file-replay-store.ts` and `session-io.ts` are instantiated at module load time and cannot be intercepted without either DI refactoring or `vi.mock`. These tests test functional correctness of the underlying operations (not a bad thing) but systematically misrepresent what they verify.

---

### `tests/transcript-adapter.test.ts` — overall grade: B-

| # | Test case | Grade | Verdict | Really tests what it claims? (notes + file:line) |
|---|-----------|-------|---------|---------------------------------------------------|
| 1 | `exposes the Claude transcript adapter as the typed capture boundary` | C | WEAK | Calls `getTranscriptCaptureAdapter()`, asserts it `=== claudeTranscriptCaptureAdapter`, checks `id` and `source` string literals, then asserts `adapter.parse(raw) === parseClaudeTranscriptJsonl(raw)` (both call the same underlying function). The identity check `adapter === claudeTranscriptCaptureAdapter` is not testing behavior — it tests module wiring. The `.parse()` call result equality is testing `a() === a()` at one level of indirection. `transcript-adapter.test.ts:12` |
| 2 | `converts text, tool_use, and tool_result blocks into canonical events deterministically` | A | REAL | One JSONL line with three block types; asserts event kinds present, last event is `session_ended`, and second run produces equal output. Determinism check is valuable. `transcript-adapter.test.ts:25` |
| 3 | `skips malformed JSON lines without aborting the parse` | A | REAL | Three lines, one invalid; asserts two message events survive. `transcript-adapter.test.ts:54` |
| 4 | `returns no events for completely empty input` | A | REAL | Both empty string and whitespace-only input tested. `transcript-adapter.test.ts:66` |
| 5 | `handles content as a plain string (not array)` | A | REAL | String content branch; checks `payload.text` and `actor`. `transcript-adapter.test.ts:71` |
| 6 | `maps tool_result with is_error=false to tool_completed` | A | REAL | Verifies `tool_completed` present, `tool_failed` absent. `transcript-adapter.test.ts:83` |
| 7 | `maps tool_result with is_error=true to tool_failed` | A | REAL | Verifies `tool_failed`. `transcript-adapter.test.ts:96` |
| 8 | `silently skips unknown block types` | A | REAL | Unknown block type present; asserts no throw and message event still produced. `transcript-adapter.test.ts:108` |
| 9 | `includes thinking blocks as message events` | B | REAL | Asserts `messages.length >= 2` — passes if thinking and text each become a message. Slightly weak (could pass if there were 2 text blocks), but the scenario constructed makes it meaningful. `transcript-adapter.test.ts:124` |
| 10 | `always appends session_ended as the last event` | A | REAL | Checks `at(-1).kind` and `at(-1).actor`. `transcript-adapter.test.ts:140` |
| 11 | `captures sessionId changes across lines` | B | REAL | Two sessionIds in the set; `session_ended` takes the second. Reasonable but does not verify which events carry which sessionId (only that both appear somewhere). `transcript-adapter.test.ts:147` |
| 12 | `parses the happy-path fixture without errors` | B | REAL | Three event kind assertions on a file fixture. Real. `transcript-adapter.test.ts:161` |
| 13 | `parses the risk-escalation fixture and produces tool_failed events` | B | REAL | Asserts `failures.length >= 3`. Real behavioral assertion. `transcript-adapter.test.ts:170` |
| 14 | `parses the tool-heavy fixture and produces multiple tool events` | B | REAL | Asserts `toolEvents.length >= 8`. Real. `transcript-adapter.test.ts:177` |

**Critical coverage blind spot — live normalizer vs legacy adapter:**

The entire `transcript-adapter.test.ts` file exercises `src/shared/transcript-adapter.ts` (the legacy adapter). The **live production path** is `src/capture/drivers/claude-code/normalizer.ts`, which is architecturally distinct:

- The live normalizer nests tool args under `payload.args` (e.g., `{ toolName, toolUseId, args: { file_path, ... } }`), not at `payload` top level.
- The legacy adapter spreads input directly into payload (e.g., `{ toolName: block.name, ...input }`).
- `deriveState`'s `extractFilePath` checks both `event.payload[key]` and `event.payload.args[key]`. The nested path (`payload.args`) is the live normalizer's format and has **zero test coverage** in any test file.
- The live normalizer also stamps `harnessId: 'claude-code'` and uses `randomUUID()` for IDs — making events non-deterministic. No test verifies the live normalizer's output shape at all.
- `src/capture/drivers/claude-code/normalizer.ts` has **0 test coverage**.

This is the highest-risk gap in the test suite. The legacy adapter tests give false confidence about the parsing behavior that actually runs in production.
