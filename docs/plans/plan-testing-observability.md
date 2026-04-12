# Testing & Observability Plan

> This is a cross-cutting plan for the whole product, not a separate phase that happens
> after GUI, capture, or inference work. The rule is simple: if a subsystem is important
> enough to build, it is important enough to test and diagnose.

---

## Scope

Define how shadow-agent should be tested and instrumented as it moves from the current
fixture-driven prototype into live transcript capture, Canvas2D rendering, and model-backed
inference.

This plan covers:
- automated test strategy by subsystem and test layer
- seams and helper abstractions needed to make the app testable
- logging and local observability requirements
- pre-merge quality gates so testing and diagnostics do not get deferred indefinitely

This plan complements:
- `docs/plans/plan-gui-rendering.md`
- `docs/plans/plan-event-capture.md`
- `docs/plans/plan-inference-engine.md`

---

## Non-Negotiables

1. **No blind feature merges.** A PR that changes behavior must add or update tests at the
   right layer.
2. **No model dependency in CI.** Automated tests never require live OpenCode or Anthropic
   calls. Use fake inference clients and recorded fixtures.
3. **No logging of full transcript bodies by default.** Logs must be structured and useful,
   but they should avoid dumping user prompts, tool payloads, or large transcript text unless
   explicitly enabled for local debugging.
4. **No per-frame logging.** The renderer draw loop is performance-sensitive. Log state
   transitions and sampled performance summaries, not every frame.
5. **Every bug fix gets a regression test or fixture.** If a failure matters enough to fix,
   it matters enough to lock down.
6. **If a seam is hard to test, refactor the seam first.** Do not compensate for poor
   structure with brittle end-to-end tests.

---

## Test Pyramid

| Layer | Purpose | Typical scope | Primary tools |
|------|---------|---------------|---------------|
| Unit | Fast, deterministic behavior checks | pure helpers, parsers, derive logic, prompt assembly, trigger logic | `vitest` |
| Contract | Lock down boundaries between modules | preload bridge, IPC payloads, parser output shape, MCP tool responses | `vitest`, mocks |
| Integration | Exercise real flows inside a subsystem | transcript watcher -> parser -> normalizer -> buffer, bootstrap/open/export, inference orchestrator with fake client | `vitest`, temp dirs/files |
| Visual regression | Protect the product's visual identity | Canvas node/edge rendering states, risk overlay, panel layout states | selective screenshot tests, command-record tests |
| Smoke E2E | Catch packaging/runtime breakage | Electron launch, fixture load, replay open/export | Playwright Electron smoke tests |
| Manual acceptance | Final human judgment on motion and feel | animation timing, glow quality, performance under load | scripted checklist |

The bias should be toward **many unit/contract tests**, **targeted integration tests**, and
**very selective visual/E2E tests**.

---

## Determinism First

Several planned subsystems are naturally nondeterministic unless we create seams.

We should standardize the following test helpers:

```text
shadow-agent/tests/
  fixtures/
    transcripts/
    replays/
    inference/
  helpers/
    fake-clock.ts
    fake-ipc.ts
    fake-inference-client.ts
    record-2d-context.ts
    temp-session-dir.ts
```

Key deterministic controls:
- freeze time with `vi.setSystemTime()`
- inject ID generation where timestamps or UUIDs would otherwise vary
- use temp directories for session discovery and file watching tests
- use a fake inference client for all automated inference tests
- use fixed canvas dimensions and seeded simulation inputs for renderer tests

If D3-Force remains difficult to stabilize, test layout helpers separately and test draw
modules against fixed node coordinates rather than a live simulation in most cases.

---

## Required Seams

Before the next major testing wave, extract a few boundaries so the code remains testable:

| Seam | Why it exists |
|------|---------------|
| `src/electron/session-io.ts` | isolates replay/transcript loading and export logic from Electron boot |
| `src/electron/start-main-process.ts` or `startMainProcess()` | avoids side effects at module import time |
| `src/renderer/bridge.ts` | removes direct `window.shadowAgent` coupling from `App.tsx` |
| `src/renderer/view-model.ts` | holds pure helpers like graph layout, label formatting, and filename sanitizing |
| `src/shared/logger.ts` | central structured logger used across main, preload, renderer, capture, inference |
| `src/inference/inference-client.ts` | interface that can be backed by OpenCode, Anthropic, or a fake test client |

These are not "nice to have" refactors. They are the cheapest way to keep testing from
becoming expensive and fragile later.

---

## Existing Prototype Coverage

The current Phase 1 suite already covers the right kinds of pure modules:
- `tests/transcript-adapter.test.ts`
- `tests/replay-store.test.ts`
- `tests/persistence.test.ts`
- `tests/derive.test.ts`

That is a solid base, but it mostly covers happy paths. The next step is to deepen edge
coverage before live capture and inference make failures harder to reason about.

Immediate additions:
- transcript adapter edge cases
- derive threshold and precedence edge cases
- persistence corruption and fallback handling
- transcript -> canonical events -> derive integration

---

## Test Strategy by Subsystem

### 1. Shared Schema / Replay / Derive

This layer should have the highest automated coverage because it is deterministic and feeds
everything else.

Add or expand tests for:
- malformed transcript lines being skipped without aborting the full parse
- `message.content` variations: string, block array, unknown block types
- deterministic synthetic `session_started` and `session_ended`
- `tool_result` with errors mapping to `tool_failed`
- derive phase precedence:
  `write/edit` > `todo/plan` > `bash/test` > `read/grep/glob`
- risk thresholds for repeated reads, shell churn, and failed tools
- file attention counting `filePath`, `file_path`, and `path`
- empty and single-event replays
- persistence fallback when session metadata is corrupt or missing

These tests should remain cheap and run on every PR.

### 2. Event Capture

The event pipeline is where subtle runtime bugs will hide: partial writes, truncation,
rotation, duplicate events, session switching.

Required automated coverage:
- `incremental-parser.ts` unit tests for partial lines and malformed JSON
- `normalizer.ts` contract tests against known Claude transcript fragments
- `event-buffer.ts` unit tests for ring behavior, ordering, and subscriptions
- `session-discovery.ts` tests using temp directories and synthetic file mtimes
- `transcript-watcher.ts` integration tests with a temp JSONL file that is appended to in
  chunks
- file truncation and file rotation behavior
- `session-manager.ts` integration tests with fake IPC sender and fake clock

Preferred test shape:
- real filesystem for watcher/discovery tests
- fake IPC transport
- fake logger sink
- no actual Electron window required

### 3. Renderer Panels and View Models

The React shell should be tested like a state machine, not just with snapshots.

Cover:
- bootstrapping the fixture on mount
- open/export/reload happy paths and failures
- busy-state button disabling
- empty states for graph, transcript, timeline, and file attention
- deterministic helper behavior in `view-model.ts`

Primary tools:
- `@testing-library/react`
- `@testing-library/jest-dom`
- `jsdom`

Avoid overusing broad DOM snapshots. Prefer assertions on visible text, button states, and
derived labels.

### 4. Canvas2D Renderer

Because visual fidelity is the product identity, this layer needs a dedicated strategy.
Pure DOM tests are not enough, but screenshot testing everything would be too brittle.

Recommended split:

1. **Command-record tests**
   - use a fake 2D context that records drawing commands
   - assert semantic behavior:
     - hexagon path generation
     - edge tapering inputs
     - state-color mapping
     - particle spawn/render progression
     - risk overlay activation

2. **Selective visual regression tests**
   - only for a small set of canonical states
   - fixed canvas size, fixed fixture data, no live animation drift
   - candidate scenes:
     - empty canvas
     - single active agent
     - parent + subagent + tool flow
     - medium risk overlay
     - prediction trail + interpretation ghost node

3. **Manual acceptance checklist**
   - glow quality
   - panel/canvas composition
   - motion timing
   - performance on a replay with sustained event volume

Visual tests should be curated and few. They are there to protect the core aesthetic, not to
snapshot every pixel state.

### 5. Electron Main / Preload

Electron breakage tends to be expensive because it is easy to miss until runtime.

Add contract/integration tests for:
- title inference precedence
- replay vs transcript detection
- empty parse failure handling
- export cancellation and write failure handling
- IPC handler registration
- preload bridge method names and argument order

These should run with mocked `electron` and mocked filesystem APIs. No real BrowserWindow
launch is needed for most of this coverage.

### 6. Inference Engine

Inference quality is hard to test end-to-end with live models, so we need to test the
deterministic parts aggressively and fake the rest.

Required automated coverage:
- `context-packager.ts` truncation and token-budget behavior
- `prompt-builder.ts` deterministic prompt assembly
- `response-parser.ts` for malformed JSON, missing fields, markdown fences
- `trigger.ts` threshold, throttle, and in-flight behavior
- `shadow-inference-engine.ts` integration using a fake inference client
- MCP tool contract tests with a stub engine

Important special case:
- add a test that the runtime prompt in `src/inference/prompts.ts` stays in sync with the
  canonical prompt text in `docs/prompts/shadow-system-prompt.md`

CI should never call a live model. A manual or opt-in smoke path can exist behind env vars,
but it must not be part of the default automated gate.

### 7. Cross-System Regression Tests

Use a few "known sessions" as regression fixtures, not just one happy-path sample.

Recommended corpus:
- clean implementation session
- shell-heavy validation session
- session with repeated reads / uncertainty
- session with tool failures
- session with subagent dispatch/return

Each fixture should be usable across:
- transcript parsing
- derive behavior
- renderer states
- inference packaging

The value here is not sheer quantity. It is having a small, stable set of representative
sessions that catch regressions across multiple layers.

---

## Logging & Local Observability

Testing catches regressions before merge. Logging makes the failures diagnosable after they
escape or when they only happen in live sessions.

### Logging Goals

1. Explain why the app is in its current state.
2. Make session ingestion and inference failures diagnosable without stepping through code.
3. Provide enough context for bug reports and replay exports.
4. Avoid leaking large transcript bodies or flooding logs with frame-level noise.

### Logger Shape

Create a shared structured logger, for example in `shadow-agent/src/shared/logger.ts`.

Every log entry should carry:
- timestamp
- level (`debug`, `info`, `warn`, `error`)
- domain (`app`, `capture`, `ipc`, `renderer`, `inference`, `mcp`, `persistence`)
- event name
- optional context fields such as `sessionId`, `agentId`, `toolName`, `filePath`,
  `inferenceRunId`, `durationMs`, `eventCount`
- serialized error details when present

Suggested sinks:
- pretty console sink in development
- JSONL file sink in app user data, with rotation
- in-memory ring buffer for a future diagnostics panel or export bundle

### What to Log

Log at `info`:
- app startup/shutdown
- session discovered / session switched
- replay file opened / exported
- inference triggered / completed
- MCP server started

Log at `warn`:
- malformed transcript lines skipped
- file watcher truncation / rotation recovery
- debounce backlog or dropped non-critical updates
- inference response parse fallback

Log at `error`:
- watcher failure
- snapshot/build failure
- export failure
- inference client failure
- IPC handler exceptions

### What Not to Log

Do not log:
- every renderer frame
- full transcript text bodies by default
- full tool arguments unless explicitly enabled in local debug mode
- raw model prompt payloads in normal operation

When logging transcript or tool context, prefer:
- counts
- actor/kind summaries
- file path
- tool name
- truncated previews

### Performance Signals

We do not need a full telemetry backend yet, but we do need local performance breadcrumbs.

Sampled diagnostics to record:
- watcher batch size and parse latency
- derive duration
- inference round-trip duration
- renderer frame budget warnings when frame time stays above threshold
- current event buffer size

These should be sampled or thresholded, not emitted constantly.

---

## Pre-Merge Quality Gates

Minimum gate for a normal feature PR:
- `npm test`
- any newly relevant integration tests
- updated regression fixture or targeted test for the behavior that changed

Additional gate for renderer-heavy PRs:
- canvas command tests
- selective visual regression checks
- brief manual performance pass against a representative replay

Additional gate for inference-heavy PRs:
- fake-client integration tests
- prompt-sync test
- parser/trigger coverage

Additional gate for capture-heavy PRs:
- temp-file watcher integration test
- truncation/rotation test
- session-switch test

---

## Recommended Implementation Order

1. Land the core seams:
   - `src/shared/logger.ts`
   - `src/electron/session-io.ts`
   - `src/renderer/bridge.ts`
   - `src/renderer/view-model.ts`
   - inference client interface
2. Port the archived Phase 1 edge-test ideas into active tests.
3. Add event capture unit and integration coverage before the watcher ships.
4. Add Electron/preload and renderer contract tests.
5. Add canvas command-record tests.
6. Add inference engine contract/integration tests with a fake client.
7. Add a thin Electron smoke test.
8. Add a curated visual regression suite for the canonical scenes.

---

## Immediate Next Tasks

1. Expand the current happy-path tests into edge and corruption cases.
2. Introduce the shared logger before capture and inference work lands.
3. Extract the Electron and renderer seams needed for clean tests.
4. Create a reusable replay/transcript fixture corpus under `tests/fixtures/`.
5. Add one temp-file watcher integration test before implementing the full session manager.

If we do those five things first, testing and logging stop being "later" work and become part
of the implementation path.
