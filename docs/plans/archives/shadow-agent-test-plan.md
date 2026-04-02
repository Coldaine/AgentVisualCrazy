---
status: archived
note: >
  This document is archived. It represents early planning and should not be
  treated as the current plan. See docs/plans/ for current implementation plans
  and docs/architecture.md for current decisions.
---

# Shadow Agent Test Plan

This is the next test roadmap for the initial `shadow-agent` prototype.

It is based on the current implementation in:
- `shadow-agent/src/shared/*`
- `shadow-agent/src/persistence/*`
- `shadow-agent/src/electron/*`
- `shadow-agent/src/renderer/*`

The current suite covers only happy-path behavior. The biggest gaps are:
- transcript parsing edge cases
- derive-state threshold logic
- file-backed persistence failure handling
- Electron main/preload contracts
- renderer state transitions around bootstrap, open, and export

## Immediate priorities

1. `shadow-agent/tests/transcript-adapter.edge.test.ts`
2. `shadow-agent/tests/replay-store.test.ts`
3. `shadow-agent/tests/derive.edge.test.ts`
4. `shadow-agent/tests/persistence.edge.test.ts`
5. `shadow-agent/tests/electron/main.test.ts`
6. `shadow-agent/tests/electron/preload.test.ts`
7. `shadow-agent/tests/renderer/App.test.tsx`
8. `shadow-agent/tests/renderer/layout.test.ts`
9. `shadow-agent/tests/transcript-to-state.integration.test.ts`
10. `shadow-agent/tests/e2e/electron-smoke.spec.ts`

## Shared / Persistence

### `transcript-adapter.edge.test.ts`

Purpose: harden Claude transcript ingestion.

Add cases for:
- malformed JSONL lines are skipped without aborting the full parse
- `message.content` as a plain string
- `thinking` blocks becoming `message` events
- `tool_result` with `is_error: true` becoming `tool_failed`
- entries with no `message` being ignored
- later lines omitting `sessionId` while earlier valid lines established it
- exactly one synthetic `session_started` and one `session_ended`
- empty input returning `[]`
- first line invalid, second line valid
- mixed block arrays with unknown block types
- missing `cwd`

Implementation note:
- use `vi.setSystemTime()` because timestamps are currently generated with `new Date().toISOString()`

### `replay-store.test.ts`

Purpose: lock down the replay format contract.

Add cases for:
- `serializeEvents` and `parseReplay` round-tripping canonical events
- blank lines being ignored by `parseReplay`
- `buildSessionRecord` deriving `sessionId`, `startedAt`, `updatedAt`, `source`, and `eventCount`
- empty event arrays falling back to `unknown`, epoch timestamps, and `replay`
- single-event sessions
- multi-source event arrays
- invalid replay JSONL currently throwing

### `derive.edge.test.ts`

Purpose: cover the product heuristics that drive most of the UI.

Add cases for:
- phase precedence staying stable:
  `write/edit` > `todo/plan` > `bash/test` > `read/grep/glob`
- `currentObjective` only adopting the first user message while the default title is still in effect
- agent nodes being created from lifecycle events and from tool activity alone
- file attention counting `filePath`, `file_path`, and `path`
- risk signals crossing thresholds:
  - repeated reads `>= 6`
  - bash churn `>= 4`
  - multiple failed tools
- idle/completed transitions for the same actor
- no events / no messages
- shadow insights always including objective, phase, and next-move content

### `persistence.edge.test.ts`

Purpose: harden file-backed session storage before live ingestion lands.

Add cases for:
- `appendEvent()` creating a new session when none exists
- custom `FileReplayStoreOptions` changing directory and file names correctly
- `listSessions()` ignoring corrupt or unreadable directories
- malformed or missing `session.json` falling back to `buildSessionRecord(events)`
- session IDs with spaces and slashes encoding/decoding safely
- equal `updatedAt` values breaking ties on `sessionId`
- corrupted `events.jsonl`

### `transcript-to-state.integration.test.ts`

Purpose: cover the smallest real pipeline:
transcript -> canonical events -> persistence -> derived state.

Assert:
- objective
- active phase
- transcript length
- event count
- mixed success/failure tools are preserved through the pipeline

## Electron / Renderer

### `electron/main.test.ts`

Purpose: lock down main-process behavior without launching Electron.

Framework:
- `vitest`
- node environment
- `vi.mock('electron')`
- `vi.mock('node:fs/promises')`

Add cases for:
- title inference precedence:
  `session_started.label` > `context_snapshot.title` > first user message > fallback
- replay-format detection:
  - `replay` when the first valid line has `kind`
  - `transcript` on parse failure
  - `replay` on empty input
- replay JSONL vs transcript JSONL loading
- empty parsed event arrays throwing
- canceled export returning `{ canceled: true }`
- export appending `.jsonl`
- export returning an error on write failure
- IPC registration exposing the expected three channels

Required seam:
- move importable logic into an exported helper, for example `src/electron/session-io.ts`
- wrap app boot in an exported `startMainProcess()` instead of booting at module import time

### `electron/preload.test.ts`

Purpose: prevent bridge drift.

Add cases for:
- `contextBridge.exposeInMainWorld('shadowAgent', ...)`
- `bootstrap()` invoking `shadow-agent:bootstrap`
- `openReplayFile()` invoking `shadow-agent:open-replay-file`
- `exportReplayJsonl(events, name)` invoking `shadow-agent:export-replay-jsonl` with the correct argument order

### `renderer/App.test.tsx`

Purpose: cover the actual renderer state machine.

Framework additions:
- `@testing-library/react`
- `@testing-library/jest-dom`
- `jsdom`

Add cases for:
- bootstrapping the fixture on mount
- rendering session title, source, phase, and objective
- disabling action buttons while busy
- reloading from `bootstrap()`
- replacing the snapshot after `openReplayFile()`
- leaving the current snapshot intact when `openReplayFile()` returns `null`
- showing the error banner on bootstrap failure
- showing the error banner on open failure
- surfacing `export` errors
- skipping export when no snapshot exists

Required seam:
- add `src/renderer/bridge.ts`
- make `App.tsx` import that bridge instead of referencing `window.shadowAgent` directly

### `renderer/layout.test.ts`

Purpose: cover deterministic renderer helpers and empty states.

Add cases for:
- stable graph layout and edge generation from parent/child agent nodes
- empty graph, transcript, timeline, and file-attention states
- invalid timestamps falling back to raw text in `formatClock`
- `safeFileName` stripping punctuation and clamping length

Required seam:
- extract `buildGraphLayout`, `formatClock`, and `safeFileName` into `src/renderer/view-model.ts`

### `e2e/electron-smoke.spec.ts`

Purpose: one thin end-to-end check after the seam refactors land.

Framework:
- `@playwright/test`

Add cases for:
- app launch with the built-in fixture
- export flow not surfacing an error
- open replay flow updating visible session metadata

Useful test-only seam:
- a deterministic way to stub file dialogs instead of opening native dialogs

## Dependency additions

Add now:
- `@testing-library/react`
- `@testing-library/jest-dom`
- `jsdom`

Add later:
- `@playwright/test`

## Refactor gates before the next test wave

These small refactors will make the next tests straightforward:

1. Extract Electron session/file logic out of `src/electron/main.ts`
2. Wrap Electron startup in `startMainProcess()`
3. Add `src/renderer/bridge.ts`
4. Extract renderer pure helpers into `src/renderer/view-model.ts`

## Recommended implementation order

1. Add the two seam refactors:
   - `src/electron/session-io.ts`
   - `src/renderer/bridge.ts`
   - `src/renderer/view-model.ts`
2. Land the shared/persistence edge tests
3. Land Electron main/preload tests
4. Land renderer component tests
5. Add one transcript-to-state integration test
6. Add one Playwright Electron smoke test

## Current risk summary

- `parseClaudeTranscriptJsonl()` is still timestamp-nondeterministic and lightly covered.
- `deriveState()` is doing most of the product interpretation with little edge coverage.
- `FileReplayStore` needs corruption and fallback tests before live ingestion.
- `src/electron/main.ts` and `src/renderer/App.tsx` need small seams before their behavior can be tested cleanly.
