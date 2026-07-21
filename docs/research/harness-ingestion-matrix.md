# Harness Ingestion Matrix

**Purpose.** This document is the canonical reference for which observability surfaces each AI coding harness exposes to a passive observer like `shadow-agent`. It exists so that anyone adding a new driver under `shadow-agent/src/capture/` knows, without re-doing the research, exactly which mechanism is first-class for a given harness, which is a fallback, and which simply does not exist.

**How to update.** When a harness ships a new ingestion surface (e.g., Cursor adds an HTTP hook target, or VS Code Copilot promotes its chat-events extension API from proposed to stable), update the relevant row and bump the "Last updated" date at the bottom. Every cell must cite a primary source — official docs, an official repo, or "verified via codebase inspection" with a file path under this repo. If you are inferring rather than confirming, write `partial` or `unofficial` and say so in the per-harness notes. Do not bluff cells.

This is reference material under `docs/research/` (see `.claude/rules/docs.md` rule 4): it informs decisions, it does not prescribe them.

## Matrix

Classification: **native** = first-class, documented, stable. **partial** = exists with meaningful caveats (beta, proposed API, limited event set, requires opt-in build). **unofficial** = only via undocumented files or community workarounds. **none** = not supported.

| Harness | Transcript file | Hooks | SDK / native event API | OpenTelemetry / OTLP | Subagent dispatch | PTY / stdout | MCP server |
|---|---|---|---|---|---|---|---|
| **Claude Code** | native (`~/.claude/projects/<encoded-cwd>/<session>.jsonl`, path is also published in every hook payload as `transcript_path`) | native (31 events incl. `PreToolUse`/`PostToolUse`/`SessionStart`/`SessionEnd`/`UserPromptSubmit`/`Stop`/`SubagentStop`/`PreCompact`/`Notification`; delivery types include `command`, `http`, `mcp_tool`, `prompt`, `agent`) | partial (Claude Agent SDK is for *spawning* runs, not for subscribing to another running CLI's events) | native (`CLAUDE_CODE_ENABLE_TELEMETRY=1`; metrics + logs/events GA; traces beta) | native (`SubagentStart`/`SubagentStop` hook events + `Task` tool spawns child agents) | partial (works under a wrapping PTY, but unnecessary given hooks + transcript) | native (Claude Code is an MCP client; we can expose a server it calls into) |
| **Codex CLI** (OpenAI) | native (`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`; disable per-run with `--ephemeral`; non-interactive `codex exec --json` streams NDJSON to stdout) | native (lifecycle hooks in `~/.codex/config.toml` or `.codex/config.toml`; events: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `Stop`; **command-type only**, no HTTP delivery; payload includes `session_id`, `transcript_path`, `cwd`, `model`, `turn_id`) | partial (Codex SDK exposes `startThread`/`run`/`resumeThread` for new runs, not subscription to a CLI session) | none (no `OTEL_*` integration documented as of changelog through early 2026) | partial (no `SubagentStart` hook; subagents surface only as nested tool calls in the rollout) | partial (TUI; wrapping stdout works but loses tool-call structure) | native (MCP client; supports adding MCP servers via config) |
| **OpenCode** (`sst/opencode`) | partial (sessions persisted in `~/.local/share/opencode/` or platform equivalent; not the documented integration surface) | partial (file/runtime hooks exist via the plugin/config system; less standardized than Claude Code's hook schema) | **native** (`opencode serve` runs an HTTP/OpenAPI server on `127.0.0.1:4096` with an SSE event stream at `/event` and `/global/event`; first message is `server.connected`, followed by bus events; SDK exposes `client.event.subscribe()` returning an async iterator) | none (no documented OTel exporter) | native (subagent dispatch is part of the event bus; events emitted for each subagent step) | partial (TUI mode; the server mode is the right surface) | native (first-class MCP support) |
| **Cursor** (IDE) | unofficial (Cursor's own session storage is internal SQLite/IndexedDB and not a stable consumer surface; the open `cursor/agent-trace` spec writes JSONL to `.agent-trace/traces.jsonl` but is a *convention* produced by hooks, not a built-in transcript) | native (rich hook system since 1.7; events: `sessionStart`, `sessionEnd`, `preToolUse`, `postToolUse`, `postToolUseFailure`, `subagentStart`, `subagentStop`, `beforeShellExecution`, `afterShellExecution`, `beforeMCPExecution`, `afterMCPExecution`, `beforeReadFile`, `afterFileEdit`, `beforeSubmitPrompt`, `preCompact`, `stop`, `afterAgentResponse`, `afterAgentThought`, plus tab hooks and `workspaceOpen`; **command-type only, stdio JSON in both directions**, configured in `.cursor/hooks.json` or `~/.cursor/hooks.json`) | none (no public event/observation API; Composer/Cursor SDK is for invoking, not observing) | none (no built-in OTLP exporter; third-party tracing via Langfuse/Braintrust integrations only) | partial (`subagentStart`/`subagentStop` hooks fire; payload structure documented per-event) | none (IDE process; not a TTY surface) | native (MCP client) |
| **VS Code + GitHub Copilot** (chat / agent mode) | partial (no plain-JSONL transcript on disk; the Agent Debug Log panel can **export** a session to OTLP-JSON or a SQLite span DB via the **Chat: Export Agent Traces DB** command; live capture is via OTel, not a tailable file) | partial (Feb 2026 release added agent lifecycle hooks; surface is newer and narrower than Claude Code/Cursor; details still evolving) | partial (no stable public extension API to subscribe to chat lifecycle events; `vscode.proposed.chatSessionsProvider.d.ts` and an internal `onDidChangeStatus` exist but are not exposed to third-party extensions — tracked in microsoft/vscode#310951) | **native** (`COPILOT_OTEL_ENABLED=true` or setting `OTEL_EXPORTER_OTLP_ENDPOINT`; emits `invoke_agent`, `chat`, `execute_tool`, `execute_hook` spans plus `gen_ai.client.inference.operation.details`, `copilot_chat.session.start`, `copilot_chat.tool.call`, `copilot_chat.agent.turn` events; exporter types: `otlp-http`, `otlp-grpc`, `console`, `file`; content capture toggled by `github.copilot.chat.otel.captureContent`) | partial (subagent spans appear in the OTel hierarchy under `invoke_agent`) | none (runs in-process inside the editor) | native (MCP client) |
| **Aider** | partial (`.aider.chat.history.md` is markdown, not structured; `--llm-history-file` writes raw LLM I/O; `.aider.input.history` is user input only; none of these are JSONL-structured tool-call streams) | none (no documented hook system) | none (no programmatic event-subscription API; aider is a Python CLI that you drive, not observe) | none (no native OTel; community projects like `claude_telemetry` wrap Claude Code, not aider) | none (no subagent model) | native (terminal-based; stdout wrapping is the only structured live-capture path) | unofficial (no native MCP server flag; community-built `aider-mcp-server` projects exist; tracked as feature request Aider-AI/aider#4506) |
| **Cline** (VS Code extension; formerly Claude Dev) | partial (task history persisted under the extension's storage dir; not a documented public file format) | partial (SDK exposes `beforeRun()`, `beforeTool()`, `afterRun()` lifecycle hooks plus "file-based and runtime hooks" per the SDK readme; less granular than Claude Code/Cursor) | **native** (`@cline/sdk` accepts an `onEvent` callback streaming content updates, tool invocations, token usage; CLI at `sdk/apps/cli/`) | none (SDK exposes metrics via callbacks; no OTLP exporter documented) | partial (subagents surface through the same `onEvent` stream) | none (extension host, not a TTY) | native (MCP client; `cline mcp` CLI for management) |
| **Continue** (VS Code extension) | partial (Continue writes "development data" to `.continue/dev_data/` as structured event blobs; intended as analytics, not a tool-call stream) | partial (no `PreToolUse`-style hooks, but the dev-data system can be configured to POST every event to a custom HTTP endpoint at a versioned schema — effectively a post-hoc hook for every event) | none (no live event-subscription API documented) | none (no native OTLP; HTTP destination is Continue's own schema) | none (Continue is single-agent) | none (extension host) | native (MCP client) |
| **Gemini CLI** (Google) | partial (chat sessions are persisted; transition to per-session JSONL is in progress — see google-gemini/gemini-cli#15292; checkpointing API is documented but path conventions are still moving) | native (hooks defined in `settings.json`; events: `BeforeTool`, `AfterTool`, `BeforeAgent`, `AfterAgent`, `BeforeModel`, `BeforeToolSelection`, `AfterModel`, `SessionStart`, `SessionEnd`, `Notification`, `PreCompress`; **command-type only**; stdin JSON includes `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `timestamp`) | none (no live event-subscription SDK distinct from invocation) | **native** (built-in OpenTelemetry; `sessionId` attached as a common attribute on all logs and metrics; configurable `outfile` like `.gemini/telemetry.log`; emits logs, metrics, traces) | partial (subagents represented through hook events and OTel spans rather than a dedicated dispatch API) | partial (TUI; not the preferred surface) | native (MCP client; tools follow the `mcp_<server>_<tool>` naming convention) |

## Per-harness notes

### Claude Code
- **Primary ingestion:** the JSONL transcript at `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`. Verified via codebase inspection — see `shadow-agent/src/capture/session-discovery.ts` and `transcript-watcher.ts`. The same path is published as `transcript_path` in every hook payload, so the file is a stable contract.
- **Fallback / live signal:** HTTP hooks (`type: "http"`) on `SessionStart` and `Notification` to discover sessions in real time without polling the filesystem; `PreToolUse`/`PostToolUse` HTTP hooks if we want push-style updates instead of tail.
- **OTel:** worth wiring as a secondary channel for enterprises that have `CLAUDE_CODE_ENABLE_TELEMETRY=1` already set — gives us cost/token signals "for free."
- **Blockers:** none significant. The transcript schema is undocumented but de-facto stable.

### Codex CLI
- **Primary ingestion:** the rollout JSONL at `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`. Same shape as Claude Code — a tailable per-session JSONL we already have machinery for.
- **Fallback / live signal:** `SessionStart` + `PostToolUse` command hooks writing a small "ping" payload to our local socket (Codex hooks are command-only, so we need a one-line wrapper script).
- **For non-interactive `codex exec` runs:** `--json` flag streams NDJSON events directly on stdout — a third, distinct ingestion path that's actually cleanest of all if the user is scripting Codex.
- **Blockers:** no HTTP hook delivery means we can't avoid the shell-wrapper step for push-style updates. The dated directory layout (`YYYY/MM/DD/`) requires a slightly smarter discovery walker than Claude Code's flat layout.

### OpenCode
- **Primary ingestion:** the SSE stream from `opencode serve` at `http://127.0.0.1:4096/event`. This is the documented integration path and is what `third_party/sidecar/` already exercised — we keep that pattern verbatim per north-star.md.
- **Fallback:** `client.event.subscribe()` from the OpenCode SDK if we're embedded as a library rather than a sidecar.
- **Blockers:** the user has to run `opencode serve` (or run `opencode` in a mode that exposes the server). The persisted session files exist but are an undocumented private surface — don't rely on them.

### Cursor
- **Primary ingestion:** Cursor hooks (`.cursor/hooks.json`) emitting per-event JSON to a small command that forwards to our local IPC. The `afterAgentResponse`, `afterAgentThought`, `preToolUse`/`postToolUse`, and `beforeShellExecution`/`afterShellExecution` events together cover the same surface area as Claude Code's hooks.
- **Fallback:** the `cursor/agent-trace` JSONL convention (`.agent-trace/traces.jsonl`) if hooks are not installed — but this only exists when the user has opted into the spec, so treat it as a nice-to-have, not a base case.
- **Blockers:** command-only hook delivery; no HTTP. No public way to *subscribe* to Cursor without modifying the workspace's `.cursor/hooks.json`, which means installation needs to be a deliberate setup step, not zero-config discovery.
- **Implemented in-tree (2026-07-21):** `src/capture/drivers/cursor/` + `hook-receiver-transport.ts` + `scripts/hooks/forward-to-shadow.{sh,ps1}`. Default app transport is `auto` (Claude file-tail + Cursor receiver). See `scripts/hooks/README.md` and `docs/domain-events.md` (Harness Driver Contract).

### VS Code + GitHub Copilot
- **Primary ingestion:** OTLP. Point Copilot at our local OTLP collector (`OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:<port>`, `COPILOT_OTEL_ENABLED=true`, `github.copilot.chat.otel.captureContent=true`). Receive `invoke_agent`/`chat`/`execute_tool` spans and `copilot_chat.*` events.
- **Fallback:** the `file` exporter type writing OTLP-JSON to a path we tail; or the SQLite span DB exposed by **Chat: Export Agent Traces DB**.
- **Blockers:** there is no stable extension API to observe chat events from a second extension (tracked in microsoft/vscode#310951) — we cannot ship a VS Code extension that just listens. The Feb 2026 hooks feature is newer and we should track its event schema as it stabilizes.

### Aider
- **Primary ingestion:** PTY/stdout wrapping. Aider has no hooks, no event API, no OTel, and no native MCP server. The only structured way to observe a live aider session is to wrap its terminal. The `.aider.chat.history.md` file works for *post-hoc* replay but is markdown — useless for live, structured interpretation.
- **Fallback:** `--llm-history-file` gives us a tailable raw-LLM record, which is closer to structured than the markdown but still not tool-call-shaped.
- **Blockers:** aider is the worst-instrumented harness on this list. Until upstream lands native MCP/hooks (issue Aider-AI/aider#4506), the PTY wrapper is the only path, and our normalizer has to do a lot of reconstruction work.

### Cline
- **Primary ingestion:** the `@cline/sdk` `onEvent` callback if we're embedding Cline; or the SDK's lifecycle hooks (`beforeRun`, `beforeTool`, `afterRun`) when Cline is driven by us as a child process via the `sdk/apps/cli/` entry point.
- **Fallback:** task history files on disk (extension storage). Treat as `unofficial`; the layout isn't documented.
- **Blockers:** if the user is running Cline as a VS Code extension (the common case), neither of the above is directly available — we'd need to ship a companion extension or rely on the VS Code OTel path if Cline ever adds one.

### Continue
- **Primary ingestion:** point Continue's development-data HTTP destination at our local endpoint. Continue will POST event blobs at a versioned schema for every chat / autocomplete / edit / tool_call.
- **Fallback:** tail `.continue/dev_data/` for the same events written locally.
- **Blockers:** the schema is Continue-specific and undocumented in detail — we'll need to consult their repo's data-schema files when implementing the driver. No live tool-call hooks, so we receive events but we cannot block or annotate before execution (acceptable, since we're read-only per north-star).

### Gemini CLI
- **Primary ingestion:** OTLP. Gemini CLI's built-in OpenTelemetry is mature and attaches `sessionId` to every signal, which is exactly what we need to correlate logs/metrics/traces.
- **Fallback:** command hooks (`BeforeTool`/`AfterTool`/`SessionStart`/`SessionEnd`) writing to a local socket — useful for fine-grained tool I/O if OTel granularity is too coarse.
- **Blockers:** the on-disk session file layout is in flux (issue #15292 tracks the JSONL migration), so don't depend on it yet.

## Implications

Looking down the columns, the mechanisms ordered by harness coverage are:

1. **PTY / stdout** — universal, but lowest-fidelity. Only worth the cost for Aider, where nothing else exists.
2. **MCP client support** — every harness on this list except Aider is an MCP *client*. This means we can expose ourselves as an MCP *server* and let the user "install" us as one more MCP tool. This isn't passive observation per se (the harness has to choose to call our tool), but it's a uniform install surface.
3. **Hooks with `transcript_path` in payload** — Claude Code, Codex CLI, Cursor, and Gemini CLI all converge on the same pattern: command hooks receive JSON on stdin including a `transcript_path` pointing to a JSONL file. **This is the single most common contract across modern CLIs and should be a first-class abstraction in our capture layer.**
4. **JSONL transcript tailing** — Claude Code, Codex CLI, and (transitionally) Gemini CLI all write per-session JSONL files at well-known paths. The existing `transcript-watcher.ts` machinery generalizes cleanly.
5. **OTLP receiving** — VS Code Copilot and Gemini CLI both make OTel the *primary* surface; Claude Code makes it secondary. An OTLP receiver is the natural unifying ingestion endpoint for the next generation of harnesses and is the right second pillar after JSONL tail.
6. **SSE / HTTP event-bus client** — only OpenCode (and Continue's HTTP destination, in reverse) uses this shape; nonetheless it's the right shape for in-process embedding.
7. **First-class subscribe-from-outside SDK** — basically nobody offers this. Every SDK on this list is for *invoking* the harness, not for *observing* one already running. Don't design around it; design around hooks + transcript tail + OTLP.

**Conclusion for the capture abstraction:** to cover 8 of the 9 harnesses with the least driver code, our `CaptureTransport` interface needs three concrete implementations:

- a **JSONL tail** transport (already present as `transcript-watcher.ts`),
- a **hook receiver** transport — a local HTTP/Unix-socket endpoint plus a stock shell-wrapper script we ship that any command-type hook can forward to (Claude Code can talk to it directly via HTTP hooks; Codex/Cursor/Gemini route through the wrapper script),
- an **OTLP receiver** transport — an embedded OTLP/gRPC + OTLP/HTTP endpoint that ingests spans, logs, and metrics into the same canonical event stream.

OpenCode and Cline are then covered by SSE/SDK-callback adapters that reuse the canonical event stream downstream. Aider remains the outlier and justifies a dedicated PTY-wrap driver.

## Last updated

**2026-07-21** (Cursor in-tree driver note). Prior matrix research pass: 2026-05-20.

To verify entries: re-fetch each cited URL and confirm the hook event list / OTel env vars / file paths still match. For Claude Code specifically, cross-check against `shadow-agent/src/capture/` — that directory is the source of truth for what we actually observe in practice. When in doubt, prefer the canonical doc over this matrix and update this matrix to match.

## Sources

- [Claude Code Hooks](https://code.claude.com/docs/en/hooks)
- [Claude Code Monitoring (OpenTelemetry)](https://code.claude.com/docs/en/monitoring-usage)
- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Codex CLI Hooks](https://developers.openai.com/codex/hooks)
- [Codex CLI Command-line Reference](https://developers.openai.com/codex/cli/reference)
- [Codex Configuration Reference](https://developers.openai.com/codex/config-reference)
- [Codex Session/Rollout Files (discussion)](https://github.com/openai/codex/discussions/3827)
- [OpenCode SDK / Server / Events](https://opencode.ai/docs/)
- [Cursor Hooks](https://cursor.com/docs/hooks)
- [VS Code: Monitor agent usage with OpenTelemetry](https://code.visualstudio.com/docs/copilot/guides/monitoring-agents)
- [vscode-copilot-chat agent_monitoring.md](https://github.com/microsoft/vscode-copilot-chat/blob/main/docs/monitoring/agent_monitoring.md)
- [microsoft/vscode#310951 — public API to observe Copilot Chat lifecycle](https://github.com/microsoft/vscode/issues/310951)
- [Aider config options](https://aider.chat/docs/config/options.html)
- [Aider-AI/aider#4506 — native MCP server support request](https://github.com/Aider-AI/aider/issues/4506)
- [Cline SDK (github.com/cline/cline)](https://github.com/cline/cline)
- [Continue development data](https://docs.continue.dev/customize/deep-dives/development-data)
- [Gemini CLI Telemetry](https://google-gemini.github.io/gemini-cli/docs/cli/telemetry.html)
- [Gemini CLI Hooks Reference](https://geminicli.com/docs/hooks/reference/)
- [google-gemini/gemini-cli#15292 — switch chat session storage to JSONL](https://github.com/google-gemini/gemini-cli/issues/15292)
