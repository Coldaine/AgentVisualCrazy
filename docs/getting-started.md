# Getting Started

Welcome to **AgentVisualCrazy** (internal package name: `shadow-agent`). This guide
will help you get the project running locally for development and testing.

## Setup

The app lives at the repo root (flat Electron layout — no `shadow-agent/` subdirectory).

```bash
npm install
```

## Test

We use [Vitest](https://vitest.dev/) for unit and integration testing from the repo root.

```bash
npm test               # run all tests
npm run test:coverage  # run with coverage report
npx vitest tests/derive.test.ts   # run a single file
```

If you check out an older commit, `npm test` may fail — update to current `main` or skip
failing suites when bisecting history.

### Test Logging Policy

The test suite runs with `silent: true` in `vitest.config.ts` to suppress
intentional log output from `StructuredLogger` (app, capture, ipc, etc.) during
automated runs. Unit tests should not produce unexpected `console.log` / `console.error`
output beyond what the logger produces; if a test intentionally asserts on log output,
use `vi.spyOn` on the logger instance rather than relying on raw `console.*` noise.
When adding new test files, verify they do not introduce unregulated console output
by running `vitest run` and confirming the output contains only reporter summary lines.

CI runs the test suite and the build on every PR via the `CI`
workflow (`.github/workflows/ci.yml`). The repo uses a pre-push Git
hook in `.githooks/pre-push` that runs `npm test` once before pushing;
`npm install` from the repo root configures `core.hooksPath` automatically.
Run `npm test` yourself before pushing — the pre-push hook will also run it,
but catching failures earlier is cheaper than re-pushing.

## Run

Build the web, renderer, and Electron bundles, then launch the desktop app:

```bash
npm run build
npm start
```

There is no separate Vite dev-server script; `npm start` runs the built Electron
entry (`dist-electron/main.cjs`).

By default the app uses the `auto` capture transport: Claude Code JSONL file-tail
**and** a local Cursor hook-receiver on `127.0.0.1:9477`.

### Watch a Cursor agent

Full install notes live in [`scripts/hooks/README.md`](../scripts/hooks/README.md). Short version:

1. Start AgentVisualCrazy (`npm run build && npm start`).
2. Copy/merge [`scripts/hooks/cursor-hooks.example.json`](../scripts/hooks/cursor-hooks.example.json)
   into `.cursor/hooks.json` (project) or `~/.cursor/hooks.json` (user-global).
3. Point each command at `scripts/hooks/forward-to-shadow.sh` (POSIX) or
   `scripts/hooks/forward-to-shadow.ps1` (Windows); `chmod +x` the shell script.
4. Run a Cursor Agent turn — hook events POST to the local receiver and show in the graph.

Live smoke (no Electron UI required):

```bash
npx tsx scripts/hooks/live-capture-server.mjs --port 9477 --out /tmp/shadow-live-capture.jsonl
# other terminal:
npm run test:live -- tests/live/cursor-hooks-live.test.ts
```

Optional env vars:

| Variable | Default | Purpose |
|----------|---------|---------|
| `SHADOW_CAPTURE_TRANSPORT` | `auto` | `auto` / `file-tail` / `hook-receiver` (`cursor`) |
| `SHADOW_CAPTURE_SOURCE` | _(unset)_ | Override `EventSource` for file-tail / stream transports |
| `SHADOW_HOOK_RECEIVER_PORT` | `9477` | Loopback port for the hook receiver |
| `SHADOW_HOOK_RECEIVER_SOCKET` | _(unset)_ | Optional Unix socket path for the receiver |
| `SHADOW_HOOK_TOKEN` | _(unset)_ | Shared token required via `X-Shadow-Token` |
| `SHADOW_HOOK_URL` | `http://127.0.0.1:9477/hook` | Forwarder target (set in the Cursor environment if non-default) |

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

- `src/electron/`: Main process code, including IPC handling, session management, and file loading.
- `src/renderer/`: React shell plus Canvas2D + D3-Force graph (`src/renderer/canvas/`), glass panels, and timeline UI.
- `src/shared/`: Code shared between the main and renderer processes (types, utilities, logging, privacy, transcript parsing, replay store).
- `src/inference/`: Shadow inference engine — OpenCode-first client with Anthropic fallback, auth, context packaging, prompt building, and trigger logic.
- `src/capture/`: Pluggable capture transports + harness drivers (`drivers/claude-code`, `drivers/cursor`).
- `src/mcp/`: MCP server exposing shadow tools to other agents.
- `scripts/hooks/`: Cursor hook forwarders and example `hooks.json`.
- `docs/`: Technical documentation, architecture decisions, and project plans.

## Prompt Workflow

The shadow system prompt lives in `src/inference/prompts.ts`
as a single source of truth. The doc comment at the top contains the
rationale, philosophy, per-section justification, evaluation plan, and
iteration log. The template literal at the bottom is the prompt the
model sees. Edit the file directly — there is no generation step. See
`.claude/rules/prompts.md` for the editing rules and
`docs/tooling-philosophy.md` for the meta-rationale.

## Documentation

- [North Star](north-star.md): Project vision and goals.
- [Architecture](architecture.md): Technical decisions and stack overview.
- [Todo](todo.md): Current task list and roadmap.
