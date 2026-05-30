# Architecture

How AgentVisualCrazy is built and why. Read [`docs/north-star.md`](north-star.md) first for
*what* the project is and [`docs/plans/roadmap.md`](plans/roadmap.md) for *what's next*. This
file is the technical map; domain detail lives in the referenced domain docs.

The repo is a single flat Electron app (TypeScript + React + Canvas2D), built by Vite + esbuild.
`src/` and `tests/` sit at the repo root; there is no monorepo and no `third_party/` — the
patterns from agent-flow and sidecar have been absorbed in-tree.

## Rendering Stack

**Canvas2D with D3-Force physics** for the main visualization, a stack proven by agent-flow.
Canvas2D gives full pixel control for glow, bloom, particle trails, and tapered bezier edges —
none practical in SVG or React Flow. D3-Force handles organic graph layout. React 19 + glass
panels overlay the canvas; an atmospheric dot-grid background sits behind it.

We rejected React Flow (too little visual control), Three.js-only (overkill for 2D), and SVG
(can't hit the target fidelity). Bringing this layer to its full ambition is the active work —
see the roadmap and [`docs/ideas/repoviz/`](ideas/repoviz/) for the visual bar.

→ [`docs/domain-gui.md`](domain-gui.md): color palette, node types, panel layout, animation standards.

## How the Shadow Model Works

A separate AI model runs alongside the observed agent. **OpenCode's SDK**
(`@opencode-ai/sdk`) is the primary inference harness (provider abstraction for free — Claude,
GPT, Gemini, OpenRouter); an **OpenAI-compatible** provider and a **direct Anthropic** path are
the alternatives, selected by `src/inference/inference-client-factory.ts`.

Auth loads in priority order: `process.env` → `~/.shadow-agent/credentials.enc.json` (Electron
`safeStorage`-encrypted) → legacy plaintext fallbacks only when
`SHADOW_ALLOW_FILE_CREDENTIAL_FALLBACK=1`. Consented legacy keys migrate into the encrypted
store. On POSIX keep `~/.shadow-agent/` at `0700`; on Windows keep it in the user profile.

Inference and transcript handling are **local-only by default**. Transcript text is sanitized
before render/export/persist/prompt. Off-host inference and raw-transcript storage each require
explicit opt-in.

→ [`docs/domain-inference.md`](domain-inference.md): OpenCode integration, auth chain, prompt
strategy, trigger logic, MCP server, context budget.

## Event Capture

Transport-pluggable. The default tails Claude Code JSONL files (with checksum-based rotation
detection); the runtime can also ingest streaming HTTP, WebSocket, and raw socket feeds through
the same parser → normalizer → bounded-queue → IPC pipeline. The queue has a hot in-memory
window, spill-to-disk, and per-consumer checkpoints. Per-harness `HarnessDriver`s
(`src/capture/drivers/`) make new agents pluggable; Claude Code is the implemented driver.

→ [`docs/domain-events.md`](domain-events.md): transcript watcher, canonical schema, normalizer,
session discovery, IPC bridge.

## Desktop Shell

Electron is the host shell (bundled by Vite), for native file access and system-level
observation. The renderer is host-agnostic: Electron mounts it today, `build:web` emits a
reusable bundle, and custom-element/webview embedding stays open for later.

The built `main.cjs` lives in `dist-electron/` and loads the renderer from `dist/index.html`
(Vite builds with `base: './'` so assets resolve under `file://`).

## Shadow Exposes Itself (MCP Server)

An MCP server (stdio) lets other agents query interpretations: `shadow_status`,
`shadow_events`, `shadow_ask` (`src/mcp/`). This makes the observer composable inside larger
agent systems. → [`docs/domain-inference.md`](domain-inference.md), MCP Server section.

## Prompt Engineering

The shadow system prompt lives at `src/inference/prompts.ts` as a single file — runtime
template literal plus a doc comment with philosophy, rationale, eval plan, and iteration log.
No JSON source, no generated docs, no parity check. See `docs/tooling-philosophy.md` and
`.claude/rules/prompts.md`.

## Testing & Observability

Testing and logging are first-class. Pure logic → deterministic Vitest tests. Capture,
Electron, and inference boundaries → integration/contract tests with fake clients, temp files,
mocked IPC. The Canvas2D renderer → command-record tests plus a curated set of visual
regression scenes. Runtime diagnostics use structured local logging with redaction by default.
→ [`docs/plans/plan-testing-observability.md`](plans/plan-testing-observability.md).

## The Read-Only Constraint

The shadow agent never writes files or calls tools on behalf of the observed agent — a hard v1
constraint that keeps the product boundary clear and safe to trust. The one exception is
**user-initiated** replay export (`saveReplayFile` in `src/electron/session-io.ts`): a native
save dialog the user explicitly triggers. That's a deliberate user gesture, not autonomous
behavior. A future phase may relax read-only for suggestions.

## Status

Post-reset baseline and the sequenced plan live in [`docs/plans/roadmap.md`](plans/roadmap.md).
In short: the capture → interpret → render loop is wired and the built app renders live data;
the work ahead is visual fidelity, live-model acceptance, and interpretation depth.

## Documentation Layout

```
docs/
  north-star.md        — What and why
  architecture.md      — This file (the technical map)
  plans/roadmap.md     — The forward plan (canonical)
  plans/               — Historical plan-*.md (pre-reset context)
  domain-gui.md        — Rendering domain
  domain-inference.md  — Inference domain
  domain-events.md     — Event-capture domain
  ideas/repoviz/       — Preserved RepoViz UI idea bank (the visual ambition)
  research/            — Visual research, patterns, inspiration
  reports/             — Status reports
  history/             — Completed-work log (append-only)
  todo.md              — Pending tasks
```
