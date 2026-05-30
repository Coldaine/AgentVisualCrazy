# AgentVisualCrazy

A passive visual observer for AI coding agents. It watches an agent's session (Claude Code
today), interprets what the agent is doing via a separate "shadow" model, and renders it as a
live, glassy visualization you can glance at instead of reading the transcript.

Read [`docs/north-star.md`](docs/north-star.md) for the vision and
[`docs/plans/roadmap.md`](docs/plans/roadmap.md) for what's next.

> "Shadow agent" is the concept — one agent quietly shadowing another. The product is **AgentVisualCrazy**.

## What it does today

- Live-tails Claude Code JSONL transcripts, normalizing them into one canonical event stream
- Runs a separate model (local-only by default) that interprets the session
- Renders a Canvas2D + D3-Force graph and a glass-panel dashboard (timeline, transcript, file
  attention, insights) with a LIVE source badge
- Loads/exports replay JSONL; opens a built-in fixture on startup

It is **read-only** — it never writes files or acts on behalf of the observed agent.

## Run it

```bash
npm install      # also installs the shared .githooks (via the prepare script)
npm test         # tsc --noEmit + vitest (47 files / 427 tests)
npm run build    # web + renderer + electron bundles
npm start        # launch the Electron app
```

## Privacy defaults

Local-only by default. Transcript text is sanitized before it is rendered, exported, persisted,
or sent to a model. Off-host inference and raw-transcript storage each require explicit opt-in
(via the in-app Privacy panel, or environment variables):

```bash
SHADOW_ALLOW_OFF_HOST_INFERENCE=true
SHADOW_ALLOW_RAW_TRANSCRIPT_STORAGE=true
```

Inference credentials prefer secure sources: `process.env` →
`~/.shadow-agent/credentials.enc.json` (encrypted) → legacy plaintext only when
`SHADOW_ALLOW_FILE_CREDENTIAL_FALLBACK=1`. See [`docs/domain-inference.md`](docs/domain-inference.md).

## Layout

```
src/             — the app: capture / inference / renderer / electron / shared / mcp
tests/           — vitest suite + fixtures
docs/            — north-star, architecture, roadmap, domain docs
  ideas/repoviz/ — preserved RepoViz UI idea bank (the visual ambition)
```

## More

- [`docs/architecture.md`](docs/architecture.md) — technical decisions, domain map
- [`AGENTS.md`](AGENTS.md) — rules for AI agents working in this repo
