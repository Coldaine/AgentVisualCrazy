# Architecture Details

## Data Flow

```
User: sidecar start --model google/gemini-2.5 --briefing "Debug auth issue"
       ↓
CLI parses args (cli.js)
       ↓
buildContext() extracts from ~/.claude/projects/[project]/[session].jsonl
       ↓
buildPrompts() creates system prompt + user message
  Interactive: context in system prompt (hidden from UI)
  Headless: context in user message (no UI)
       ↓
startOpenCodeServer() → createSession() → sendPromptAsync()
       ↓
[Interactive]                    [Headless]
Electron BrowserView opens       OpenCode async API (promptAsync)
User converses with model        Agent works autonomously
FOLD clicked →                   Polls for [SIDECAR_FOLD] marker
  Model generates summary            ↓
  (SUMMARY_TEMPLATE prompt)     extractSummary() captures output
       ↓                              ↓
Summary output to stdout → Claude Code receives in context
```

## Fold Mechanism

When the user clicks **Fold** (or presses `Cmd+Shift+F`) in interactive mode:

1. UI shows overlay with spinner ("Generating summary...")
2. `SUMMARY_TEMPLATE` is sent to the model via OpenCode HTTP API (`prompt_async`)
3. Electron polls `/session/:id/message` for the model's response
4. Model generates a structured summary with: Task, Findings, Attempted Approaches, Recommendations, Code Changes, Files Modified, Assumptions, Open Questions
5. Summary is written to stdout with `[SIDECAR_FOLD]` metadata header
6. Electron window closes, `start.js` captures stdout and finalizes session

In headless mode, the agent outputs `[SIDECAR_FOLD]` autonomously when done, and `headless.js` extracts everything before the marker.

## Shared Server Architecture

Multiple sidecar invocations share a single OpenCode Go binary when `SIDECAR_SHARED_SERVER=1` (the default). This eliminates per-invocation cold-start latency and reduces memory overhead.

```
Before (per-process):                After (shared server):
MCP Server                           MCP Server
  +-- sidecar CLI (port 4096)          +-- Shared OpenCode Server (port 4096)
  |     +-- OpenCode Go binary               +-- Session A
  +-- sidecar CLI (port 4097)               +-- Session B
  |     +-- OpenCode Go binary               +-- Session C
  +-- sidecar CLI (port 4098)
        +-- OpenCode Go binary
```

The shared server restarts automatically on crash, up to 3 times within any 5-minute window. After 3 restarts the server is considered unstable and will not restart again; use `SIDECAR_SHARED_SERVER=0` to fall back to per-process mode.

## IdleWatchdog State Machine

Each sidecar process runs an `IdleWatchdog` that transitions between two states:

- **BUSY**: A prompt is in flight or a session was recently active. Idle timer is paused.
- **IDLE**: No active requests for the configured idle period. Process (or shared server) self-terminates.

Transitions: `BUSY → IDLE` when the last active session goes quiet; `IDLE → BUSY` on any new incoming request. The idle clock resets on each BUSY→IDLE transition. Set `SIDECAR_IDLE_TIMEOUT=0` to disable self-termination entirely.

## Electron BrowserView Architecture

The Electron shell (`electron/main.js`) uses a **BrowserView** to avoid CSS conflicts between the OpenCode SPA and the sidecar toolbar:

- **BrowserView** (top): Loads the OpenCode web UI at `http://localhost:<port>`. Gets its own physical viewport, no CSS interference with the host window.
- **Main window** (bottom 40px): Renders the sidecar toolbar (branding, task ID, timer, Fold button) via a `data:` URL.
- On resize, `updateContentBounds()` adjusts the BrowserView to fill `height - 40px`.

This replaced earlier CSS-based approaches (`padding-bottom`, `calc(100dvh - 40px)`) which failed because OpenCode's Tailwind `h-dvh` class resolves to the actual browser viewport and ignores parent element overrides.
