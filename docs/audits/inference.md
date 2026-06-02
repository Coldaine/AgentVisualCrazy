# Test Audit — inference

## Summary

files: 9 | test cases: 67 | grades A: 28  B: 18  C: 12  D: 6  F: 3 | REAL: 38  WEAK: 22  FICTION: 7

### Worst offenders

- `tests/inference.test.ts:301–343` — "parser fallback" describe block: tests a local inline parser defined inside the test file, not `parseModelResponse` from production code. The entire block is fiction — production behavior cannot break these tests.
- `tests/inference.test.ts:163–201` — `buildInferenceRequest` tests: asserts `request.systemPrompt === SHADOW_SYSTEM_PROMPT` where both sides are imported from the same module. The test cannot fail unless the import itself is wrong; it does not exercise any logic.
- `tests/inference/inference-contract.test.ts:67–125` — `FakeInferenceClient` describe block: tests the test helper itself (queue ordering, error throwing, pendingCount). This is infrastructure testing, not production code testing. Useful for helper confidence but contributes zero coverage of any `src/` path.

---

## Per file

---

### `tests/inference/shadow-inference-engine.test.ts` — overall grade: A

| # | Test case | Grade | Verdict | Notes |
|---|-----------|-------|---------|-------|
| 1 | no-op when off-host inference is disabled | A | REAL | Verifies the privacy gate in `createInferenceEngine` (`engine.ts:150`). Deleting the `if (!privacy.allowOffHostInference) return` guard would make `client.calls` non-zero and fail the assertion. Honest mock boundary: network replaced by FakeInferenceClient, orchestration logic is real. |
| 2 | no-op when privacy allowOffHostInference is false | C | WEAK | Duplicate of test #1 — identical setup, identical assertion, different name. Adds zero additional coverage. The name implies a distinct sub-case but the code path is the same branch. |
| 3 | triggers inference on tool_failed event and delivers insights | A | REAL | Exercises the full engine pipeline: subscribe → trigger → packContext → buildInferenceRequest → client.infer → parseModelResponse → onInsights. Assertions on `insights.some(i => i.kind === 'phase')` would fail if the parser or trigger logic broke. |
| 4 | propagates inference errors gracefully and allows subsequent runs | A | REAL | Validates the `try/catch/finally` + `pendingTrigger` reset in `engine.ts:96–104`. The two-phase error/success sequence would fail if the engine stopped after an error. |
| 5 | does not run concurrent inferences (coalesce) | A | REAL | Tests the `inflight` flag + `pendingTrigger` coalescing logic in `engine.ts:68–72`. The blocking factory approach is well-designed. Would catch regressions where the concurrency guard is removed. |
| 6 | uses frozen fixture events from replay fixtures | B | WEAK | Reads a JSONL fixture and pushes its events + a synthetic `tool_failed` trigger. The fixture data is not actually validated — the test only checks `client.calls.length === 1` and `onInsights` was called. Effectively tests "engine fires when triggered" again. The fixture replay angle (verifying engine behavior on real captured data) is not exploited. |
| 7 | uses checkpoint-based buffer when available | A | REAL | Exercises the `isCheckpointedEventBuffer` branch (`engine.ts:65`), `registerConsumer`, `readPending`, and `commitCheckpoint` via the FakeCheckpointBuffer. Asserting `buffer.consumerId === 'inference-trigger'` would break if the consumer ID changed without updating both. |

---

### `tests/inference/response-parser.test.ts` — overall grade: A

| # | Test case | Grade | Verdict | Notes |
|---|-----------|-------|---------|-------|
| 1 | parses a clean JSON response and tags insights as model-sourced | A | REAL | Directly calls `parseModelResponse` on real JSON. Assertions on `insight.source === 'model'` and `kind === 'phase'` hit real parser logic at `response-parser.ts:139–148`. Would fail if `makeInsight` dropped the `source` field. |
| 2 | produces identical insights for clean vs single-fenced JSON (no regression) | A | REAL | Verifies that `stripMarkdownFences` path and direct parse yield same output. Tests real `stripMarkdownFences` at `response-parser.ts:29–34`. |
| 3 | recovers JSON wrapped in prose | A | REAL | Exercises `extractFirstJsonObject` fallback at `response-parser.ts:50–85`. Deleting that code path would return `[]` and fail. |
| 4 | recovers JSON from doubled / extra markdown fences | B | WEAK | Tests a subtle multi-fence case. The two-step parse logic (`stripMarkdownFences` → try → extract`) handles this, but the assertion only checks `kind === 'phase'` exists — does not verify the exact parsed value or that both fence layers are stripped correctly. Passes even if only partial stripping occurs. |
| 5 | extracts the balanced object even with trailing prose after the JSON | A | REAL | Validates the brace-balanced extractor handles trailing text. Would fail if `extractFirstJsonObject` stopped at the first `}` too eagerly. |
| 6 | returns [] for genuinely malformed output | A | REAL | Three cases: plain text, unclosed brace, empty string. All three code paths in `parseModelObject` returning `null` are exercised. |

---

### `tests/inference/openai-compatible-client.test.ts` — overall grade: A

| # | Test case | Grade | Verdict | Notes |
|---|-----------|-------|---------|-------|
| 1 | returns null when no base URL is configured | A | REAL | Tests the null-guard at `openai-compatible-client.ts:43–47`. Deleting the guard returns a client and fails `expect(client).toBeNull()`. |
| 2 | reports openai provider identity | B | WEAK | Checks `client.id === 'openai-compatible'` and `client.provider === 'openai'`. These are string literals in production code — valid smoke check but fragile to rename and adds little confidence about behavior. |
| 3 | forwards system+user messages to {baseURL}/chat/completions and normalizes the response | A | REAL | Best test in this file. Validates URL construction (trailing-slash normalization), Authorization header formation, request body shape, response extraction, latency calculation. All would break on real regressions. |
| 4 | omits the Authorization header when no API key is set | A | REAL | Tests the conditional header at `openai-compatible-client.ts:78`. Removing the `apiKey ?` condition would add the header and fail. |
| 5 | throws a typed error on a non-2xx response | A | REAL | Validates the `!response.ok` branch at `openai-compatible-client.ts:101–105`. Error message includes status code. |
| 6 | throws a typed error when a 2xx body is not valid JSON | A | REAL | Tests the `JSON.parse` catch block at `openai-compatible-client.ts:108–114`. The custom `json: async () => { throw SyntaxError }` fake is an honest network boundary mock. |
| 7 | throws a timeout error when the request aborts | A | REAL | Tests the AbortError detection at `openai-compatible-client.ts:89–97`. Checks that the error message contains "timed out". |

---

### `tests/inference/opencode-client.test.ts` — overall grade: B

| # | Test case | Grade | Verdict | Notes |
|---|-----------|-------|---------|-------|
| 1 | returns null when the OpenCode SDK cannot be loaded | A | REAL | Exercises the `try/catch` around `loadSdk()` at `opencode-client.ts:113–119`. Genuine guard test. |
| 2 | returns null when the OpenCode server fails to start | A | REAL | Exercises the inner `try/catch` at `opencode-client.ts:125–137` for server startup failure. |
| 3 | forwards prompts and polls for the assistant response | B | WEAK | Tests the happy-path polling loop. Assertion `result.model === 'anthropic/claude-sonnet-4-5'` is fragile — it hardcodes a string built from the `MODEL` constant at `opencode-client.ts:15`. More importantly, `result.latencyMs === 0` is suspicious: since `now: () => 1_000` returns a constant, `start = 1000` and `latencyMs = now() - start = 0`. The test passes but does not verify latency actually increases with time. The poll-stabilization logic (`text === stableText`) is only partially exercised — `pollCount < 3` means two empty responses then one non-empty; the "stable" match on the third call never runs since the loop only checks `text === stableText` after assigning `stableText = text`. The test documents the path but is not rigorous about the stability requirement. |

---

### `tests/inference/direct-api.test.ts` — overall grade: A

| # | Test case | Grade | Verdict | Notes |
|---|-----------|-------|---------|-------|
| 1 | returns null when no API key is available | A | REAL | Tests the empty-key guard at `direct-api.ts:57–60`. |
| 2 | returns null when the Anthropic SDK is unavailable | A | REAL | Tests the SDK load guard at `direct-api.ts:62–69`. |
| 3 | builds an inference adapter that forwards prompts and normalizes the response | A | REAL | Validates the full request shape sent to `messages.create`, and that response is unpacked correctly (first `text` content block). The `latencyMs: 25` is correctly derived from the stepping `now` clock. |
| 4 | uses deps.model to override the default model | A | REAL | Tests that `deps.model` is forwarded to the SDK call. Deleting the `deps.model ?? ...` fallback at `direct-api.ts:73` would cause it to use `'claude-sonnet-4-5'` and fail `expect(calls[0]?.model).toBe('custom-model-id')`. |

---

### `tests/inference/inference-client-factory.test.ts` — overall grade: B

| # | Test case | Grade | Verdict | Notes |
|---|-----------|-------|---------|-------|
| 1 | prefers the direct Anthropic client when SHADOW_INFERENCE_PROVIDER=anthropic | B | WEAK | Spies on `createDirectApiClient` and `createOpencodeClient` and verifies which was called. This tests the factory's routing logic correctly, but by mocking the factory's own dependencies it does not verify the returned client is usable. Acceptable for a factory — routing is the behavior. However, `expect(client).toBe(direct)` is asserting object identity, which is fine. The `not.toHaveBeenCalled` on opencode is the meaningful assertion here. |
| 2 | uses OpenCode when available and no provider override is set | B | WEAK | Same pattern. Correctly validates the default priority order (opencode before direct). The spy on `createDirectApiClient` verifying it was not called is the key assertion. |
| 3 | falls back to Anthropic when OpenCode is unavailable | B | WEAK | Tests the null-opencode fallback path at `factory.ts:28–32`. The assertion is sound but the mock setup is the entire behavior being tested — the production code is just three lines of if-null logic. |
| 4 | uses the OpenAI-compatible client when SHADOW_INFERENCE_PROVIDER=openai | B | WEAK | Tests the `preference === 'openai'` branch. Note: `createOpenAiCompatibleClient` is synchronous (returns null or client directly) while `createOpencodeClient` is async — the factory test correctly mocks both. The "not called" assertions for opencode and direct are the meaningful checks. |

Note on factory tests overall: all four tests mock `createDirectApiClient`, `createOpencodeClient`, and `createOpenAiCompatibleClient` at the module level. This means the tests verify branching logic in `createInferenceClient` but cannot detect bugs inside the individual client factories. That is the right boundary for a factory test. Grade is B not A because none of the tests assert anything about what happens when `preference === 'opencode'` (the third explicit branch in the factory), which falls through to opencode+direct fallback — a coverage gap.

---

### `tests/inference/inference-contract.test.ts` — overall grade: C

| # | Test case | Grade | Verdict | Notes |
|---|-----------|-------|---------|-------|
| 1 | returns queued results in order | B | WEAK | Tests `FakeInferenceClient.enqueue` ordering. This is testing a test helper, not production code. Useful for helper confidence but is not a contract test on any `src/` module. |
| 2 | records all infer() calls | B | WEAK | Tests `FakeInferenceClient.calls` accumulation. Same concern — helper infrastructure test. |
| 3 | throws queued errors | B | WEAK | Tests `FakeInferenceClient.enqueueError`. Helper test only. |
| 4 | throws when queue is exhausted | B | WEAK | Tests the "no more queued responses" sentinel in `FakeInferenceClient`. Helper test only. |
| 5 | pendingCount decrements as responses are consumed | B | WEAK | Tests `FakeInferenceClient.pendingCount`. Helper test only. |
| 6 | factory receives the actual request | B | WEAK | Tests `FakeInferenceClient.enqueueFactory`. Helper test only. |
| 7 | handles empty state and events | A | REAL | Tests `packContext` (context-packager) with empty inputs. Hits real logic at `context-packager.ts:52–104`. |
| 8 | includes all events when under budget | C | WEAK | Assertion `totalEvents >= 1 && totalEvents <= 6` is extremely permissive — accepts almost any non-zero result. The comment "5 events or summary + 5" implies a summary event could appear, but the real code does not add summary events; `recentEvents` is just `events.slice(-recentWindowSize)`. This assertion range is wider than the actual behavior and could pass even with broken truncation. |
| 9 | truncates when oversize | A | REAL | `tokenBudget: 1` forces the truncation loop. `truncated: true` would fail if the loop at `context-packager.ts:135` were deleted. |
| 10 | output is deterministic for the same inputs | A | REAL | JSON-stringifies two calls with the same inputs and compares. Would catch non-determinism (e.g. `Date.now()` inside packContext). |
| 11 | builds tool history from tool_started/completed/failed events | A | REAL | Exercises the tool-history pairing logic at `context-packager.ts:60–77`. The result/error assignment would fail if the reverse-search loop were broken. |
| 12 | respects recentWindowSize option | B | WEAK | `expect(packet.recentEvents.length).toBeLessThanOrEqual(6)` — upper bound is 6 not 5. The comment explains this is for "summary events" that don't exist. Effective upper bound is 5. The off-by-one allowance makes the assertion weaker than it should be. |
| 13 | approximate token count is within budget | B | WEAK | Tests that `approximateTokens <= 10_000` given 10 small events. Given each event is ~100 chars = ~25 tokens, 10 events ~ 250 tokens — this assertion can never fail in practice with these inputs. |
| 14 | declares the read-only constraint | A | REAL | Regex-matches the actual `SHADOW_SYSTEM_PROMPT` string for `/read.only/`. Would fail if the read-only language were removed. |
| 15 | frames the role as observer, not actor | A | REAL | Checks for "observer" language in the prompt. |
| 16 | asserts the shadow cannot affect the observed agent | A | REAL | Pattern `/cannot affect|do(es)? not (affect|instruct|write|edit)|must not ...)/`. The prompt currently matches `cannot affect` at `prompts.ts:169`. |
| 17 | preserves the confidence-calibration instruction | A | REAL | Checks for "confidence" and "0.9|honest|not every". The prompt has "not every situation warrants 0.9+" — matches. |
| 18 | requires JSON-only output (no prose, no markdown) | A | REAL | Checks for "json" and "no prose|no markdown|valid json only|pure json". Prompt has "No prose. No markdown. Pure JSON." — matches. |
| 19 | buildUserMessage includes all context packet fields | A | REAL | Constructs a full `ShadowContextPacket` and asserts 9 specific strings appear in the output. Tests real `buildUserMessage` at `prompt-builder.ts:39–101`. Would fail if any section were dropped. |
| 20 | buildUserMessage is deterministic for the same input | A | REAL | Same packet called twice, strict equality. Tests determinism of real code. |
| 21 | returns null for completely malformed JSON | F | FICTION | Calls the **local inline `parseInferenceResponse` function defined in this test file** (lines 281–298), NOT `parseModelResponse` from production. This function is a 15-line inline stub. Tests are verifying that the stub behaves correctly, not that the production parser does. Deleting `src/inference/response-parser.ts` entirely would not affect these tests. |
| 22 | handles partial payloads with missing fields gracefully | F | FICTION | Same issue — tests the local inline stub, not production code. |
| 23 | handles JSON with extra/unknown fields without error | F | FICTION | Same issue — tests the local inline stub. |
| 24 | filters non-string entries from observations array | F | FICTION | Same issue — tests the local inline stub. |
| 25 | FakeInferenceClient can simulate malformed response for parser fallback test | D | WEAK | Calls `FakeInferenceClient.infer` (helper) and then the inline stub `parseInferenceResponse`. Neither calls production parser code. The assertion `expect(parsed).toBeNull()` is testing the stub. Zero production coverage. |

---

### `tests/inference-auth.test.ts` — overall grade: A

| # | Test case | Grade | Verdict | Notes |
|---|-----------|-------|---------|-------|
| 1 | loads supported credentials from the encrypted store without fallback consent | A | REAL | Creates a real temp directory, writes a fake-encrypted store file using the `FakeSafeStorage` stand-in, calls the real `loadCredentials`, and asserts env vars are set. Exercises `readSecureStore` at `auth.ts:119–155`. `UNUSED_SECRET` not appearing in env confirms `filterSupportedCredentials` at `auth.ts:99–108`. |
| 2 | does not override process env values with secure-store credentials | A | REAL | Tests `setIfMissing` at `auth.ts:56–59`. Pre-setting `env.ANTHROPIC_API_KEY` and verifying it is unchanged is a real behavioral check. |
| 3 | skips legacy file-based fallbacks until consent is explicit | A | REAL | Verifies the `allowFileFallback` gate at `auth.ts:253`. Both legacy files exist but no consent env → neither credential appears. |
| 4 | migrates consented legacy file credentials into the encrypted store | A | REAL | Most thorough test in the suite. Verifies: dotenv parsed → env set, opencode auth parsed → env set, secure store written (contains cipher marker, does not contain plaintext keys), second `loadCredentials` call reads back from store without legacy files. Also checks POSIX file mode on non-Windows. |
| 5 | preserves secure-store credentials when legacy fallback contains overlapping keys | A | REAL | Tests the merge priority: `secureStoreCredentials` wins over `dotenvCredentials` for overlapping keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`). Non-overlapping legacy key (`GOOGLE_API_KEY`) is still picked up. Then verifies a second call from store-only also returns all three. |

---

### `tests/inference.test.ts` — overall grade: C

| # | Test case | Grade | Verdict | Notes |
|---|-----------|-------|---------|-------|
| 1 | parses a well-formed JSON response | A | REAL | Calls real `parseModelResponse`. Validates phase, next_move, objective, summary insight extraction. Covers more field paths than the response-parser unit tests. |
| 2 | handles markdown-fenced JSON | B | WEAK | Minimal fixture — only checks `kind === 'phase'` exists. Redundant with `response-parser.test.ts` test #2 with weaker assertions. |
| 3 | returns empty array for malformed JSON | B | WEAK | Duplicate of `response-parser.test.ts` test #6. Same production code path, same assertion. |
| 4 | handles missing optional fields gracefully | C | WEAK | `expect(() => parseModelResponse(response)).not.toThrow()` — tests that the function doesn't throw, but not what it returns. `{ phase: 'idle' }` produces a phase insight; the test does not verify it. |
| 5 | clamps confidence to [0, 1] | A | REAL | Tests `clamp()` at `response-parser.ts:105–107` via the full parser. Out-of-range confidence values `1.5` and `-0.3` must be clamped. |
| 6 | maps each riskSignal to a risk insight | A | REAL | Verifies that two `riskSignals` in the JSON produce two `kind === 'risk'` insights. Tests the loop at `response-parser.ts:151–160`. |
| 7 | builds a packet with correct session metadata | A | REAL | Calls real `buildContextPacket`. Verifies `sessionId`, `currentPhase`, `observedAgent`. Would fail if `buildContextPacket` returned wrong field names. |
| 8 | limits recentEvents to last 30 | A | REAL | 50 events → `recentEvents.length <= 30`. Tests the `MAX_RECENT_EVENTS` slice at `context-packager.ts:58`. |
| 9 | converts riskSignals strings to {signal, severity} objects | A | REAL | Tests the `riskSignals.map` at `context-packager.ts:85–88`. The `severity: 'medium'` default would break if changed. |
| 10 | returns systemPrompt matching SHADOW_SYSTEM_PROMPT | D | WEAK | `expect(request.systemPrompt).toBe(SHADOW_SYSTEM_PROMPT)` — both `request.systemPrompt` and `SHADOW_SYSTEM_PROMPT` are imported from the same module. `buildInferenceRequest` passes `SHADOW_SYSTEM_PROMPT` through unchanged. This assertion can only fail if the import itself is broken, not if any logic is broken. The `typeof request.userMessage === 'string'` check catches a catastrophic type error but nothing behavioral. |
| 11 | is deterministic — same packet produces same output | D | WEAK | `expect(buildInferenceRequest(packet)).toEqual(buildInferenceRequest(packet))` — since `buildInferenceRequest` is a pure function with no random state, this essentially checks `x === x`. Would only fail if `buildInferenceRequest` used `Date.now()` internally (it does not). Zero-cost test with near-zero value. |
| 12 | fires immediately on tool_failed | A | REAL | Tests `createInferenceTrigger` with `tool_failed` kind. Exercises `IMMEDIATE_KINDS` check at `trigger.ts:70–77`. |
| 13 | fires immediately on agent_completed | A | REAL | Same as above for `agent_completed`. Good that both immediate kinds are covered. |
| 14 | fires when maxEventsBetween is exceeded | A | REAL | 5 events with `maxEventsBetween: 5` → fires. Tests the force-trigger at `trigger.ts:80–83`. |
| 15 | does NOT fire when only minEvents met but time not elapsed | A | REAL | `timeBetweenMs: 999999` means elapsed time (near 0ms) never meets the threshold. `cb` not called is the correct outcome. Tests the AND condition at `trigger.ts:87–93`. |
| 16 | reset clears event count | A | REAL | Two events, reset, two more events → callback not fired because count reset to 0. Tests `trigger.reset()` at `trigger.ts:99–104`. |

---

## Coverage gaps identified

| Area | Missing coverage | Risk |
|------|-----------------|-------|
| `trigger.ts` | Time-based debounce path (`scheduleDebounced`, 200ms timer). No test verifies the debounced fire actually calls `onTrigger` after the timeout. | Medium |
| `trigger.ts` | `minEventsBetween + timeBetweenMs` combined path (normal trigger, not immediate/max). The "does NOT fire" test only covers the negative case. | Medium |
| `auth.ts` | `hasAnyCredential()` export — no test. | Low |
| `auth.ts` | Corrupt/version-mismatched secure store file (version !== 1) falls through silently. | Medium |
| `context-packager.ts` | Trimming loop when only 1 recentEvent remains (falls through to transcript trim). | Low |
| `opencode-client.ts` | Poll timeout path (`now() >= deadline` with empty `stableText`) — the error throw at `opencode-client.ts:103` is not tested. | High |
| `opencode-client.ts` | Stability convergence: the "same text twice" stabilization condition is not exercised by the existing test. | Medium |
| `inference-client-factory.ts` | The explicit `preference === 'opencode'` branch with fallback to `createDirectApiClient()` is not tested. | Medium |
| `response-parser.ts` | `attention.primaryFile === null` case in insight output. | Low |
| `shadow-inference-engine.ts` | `engine.start()` with `client === null` (no client available after privacy gate passes). | Medium |
