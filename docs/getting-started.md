# Getting Started

Welcome to **shadow-agent**. This guide will help you get the project running locally for development and testing.

## Setup

The main project lives in the `shadow-agent` directory.

```bash
cd shadow-agent
npm install
```

## Test

We use [Vitest](https://vitest.dev/) for unit and integration testing. Tests run
from inside the `shadow-agent/` directory.

```bash
cd shadow-agent
npm test               # run all tests
npm run test:coverage  # run with coverage report
npx vitest tests/derive.test.ts   # run a single file
```

All tests on `main` pass as of the Phase 2 landing (258 tests, 2026-05-19). If you
check out an older commit, `npm test` may fail — update to current `main` or skip
failing suites when bisecting history.

CI runs the prompt-parity check, tests, and build on every PR via the `CI`
workflow (defined in `.github/workflows/prompt-parity.yml`). The repo uses a
Git hook in `.githooks/pre-commit`, and `npm install` from either the repo root
or `shadow-agent/` configures `core.hooksPath` automatically so that
`npm run prompts:check` and `npm test --prefix shadow-agent` run locally before
each commit. Run `npm test` yourself before opening a PR — the pre-commit hook
will also run it, but catching failures earlier is cheaper.

## Run

Build the web, renderer, and Electron bundles, then launch the desktop app:

```bash
cd shadow-agent
npm run build
npm start
```

There is no separate Vite dev-server script; `npm start` runs the built Electron
entry (`dist-electron/main.cjs`).

## Credential Setup

Inference credentials now prefer secure sources:

- `process.env` always wins for local development or CI
- `~/.shadow-agent/credentials.enc.json` is the default encrypted local store
- legacy plaintext fallbacks (`~/.shadow-agent/.env` and OpenCode's `auth.json`) are ignored unless `SHADOW_ALLOW_FILE_CREDENTIAL_FALLBACK=1` is set

If you are migrating from an older file-based setup, enable `SHADOW_ALLOW_FILE_CREDENTIAL_FALLBACK=1`
for the migration run so shadow-agent can import supported provider keys into the encrypted store.
After the encrypted store is populated, remove that flag and delete any temporary plaintext `.env`
copy you created for migration.

Permission guidance:

- POSIX: keep `~/.shadow-agent/` at `0700`
- POSIX: keep `~/.shadow-agent/credentials.enc.json` at `0600`
- Windows: leave the store inside your user profile so standard per-user ACLs protect it
- Do not place credential files in shared folders, synced team drives, or repo working trees

## Privacy Controls

Shadow-agent starts in local-only mode. The Electron app's Privacy panel lets you explicitly opt in to:

- off-host shadow inference
- raw transcript storage/export

Those toggles persist to `~/.shadow-agent/privacy.json`. If you set
`SHADOW_ALLOW_OFF_HOST_INFERENCE` or `SHADOW_ALLOW_RAW_TRANSCRIPT_STORAGE`, the environment
variables override the saved file for that run.

## Project Structure

- `shadow-agent/src/electron/`: Main process code, including IPC handling, session management, and file loading.
- `shadow-agent/src/renderer/`: React shell plus Canvas2D + D3-Force graph (`src/renderer/canvas/`), glass panels, and timeline UI.
- `shadow-agent/src/shared/`: Code shared between the main and renderer processes (types, utilities, logging, privacy, transcript parsing, replay store).
- `shadow-agent/src/inference/`: Shadow inference engine — OpenCode-first client with Anthropic fallback, auth, context packaging, prompt building, and trigger logic.
- `shadow-agent/src/capture/`: Pluggable capture transports (file tail, HTTP stream, WebSocket, socket).
- `shadow-agent/src/mcp/`: MCP server exposing shadow tools to other agents.
- `docs/`: Technical documentation, architecture decisions, and project plans.

## Prompt Workflow

We maintain a strict synchronization workflow for AI prompts. Before modifying any prompts, please read the **Prompt Change Workflow** in [AGENTS.md](../AGENTS.md).

Run these commands when updating the system prompt:
```bash
npm run prompts:generate
npm run prompts:check
```

Prompt manifests live under `prompts/` and can be authored in `.json`, `.yaml`,
or `.yml`. The generated Markdown docs and runtime TypeScript prompt mirrors
must never be edited directly.

## Documentation

- [North Star](north-star.md): Project vision and goals.
- [Architecture](architecture.md): Technical decisions and stack overview.
- [Todo](todo.md): Current task list and roadmap.
