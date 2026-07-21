# Hook forwarders

Stock wrappers that turn **command-type** agent hooks (Cursor, and later Codex /
Gemini) into POSTs against AgentVisualCrazy's local hook-receiver.

## Files

| File | Purpose |
|------|---------|
| `forward-to-shadow.sh` | POSIX forwarder (macOS / Linux / WSL / Cursor cloud) |
| `forward-to-shadow.ps1` | Windows PowerShell forwarder |
| `cursor-hooks.example.json` | Example `.cursor/hooks.json` wiring every useful Agent hook |

## Install for Cursor

1. Start AgentVisualCrazy (`npm run build && npm start`). The default `auto`
   capture transport listens on `http://127.0.0.1:9477/hook`.
2. Copy or merge `cursor-hooks.example.json` into:
   - **Project:** `.cursor/hooks.json` (paths are relative to the repo root)
   - **User:** `~/.cursor/hooks.json` (paths are relative to `~/.cursor/`)
3. Adjust the `command` paths so they resolve from that working directory.
   From this repo as the workspace, `scripts/hooks/forward-to-shadow.sh` works
   for project hooks. For user hooks, copy the script into `~/.cursor/hooks/`
   and use `./hooks/forward-to-shadow.sh`.
4. `chmod +x` the shell forwarder.
5. Run a Cursor Agent turn — events should appear in the live graph.

Cloud agents only load **project** hooks (`.cursor/hooks.json` in the repo),
not `~/.cursor/hooks.json`.

## Environment

| Variable | Default | Used by |
|----------|---------|---------|
| `SHADOW_HOOK_URL` | `http://127.0.0.1:9477/hook` | Forwarder |
| `SHADOW_HOOK_TOKEN` | _(unset)_ | Forwarder + receiver (`X-Shadow-Token`) |
| `SHADOW_HOOK_SOURCE` | `cursor-hook` | Forwarder (`X-Shadow-Source`) |
| `SHADOW_HOOK_RECEIVER_PORT` | `9477` | App / receiver |
| `SHADOW_CAPTURE_TRANSPORT` | `auto` | App (`auto` / `hook-receiver` / `file-tail`) |

Forwarders **fail open**: if the observer is offline they still exit `0` with
`{}` so Cursor never blocks the agent loop.

## Live verification

```bash
# Terminal A — capture server (same transport the Electron app uses)
npx tsx scripts/hooks/live-capture-server.mjs --port 9477 --out /tmp/shadow-live-capture.jsonl

# Terminal B — drive the forwarder the way Cursor would
npm run test:live -- tests/live/cursor-hooks-live.test.ts
```

Or install `.cursor/hooks.json` (committed in this repo for dogfooding), start the
capture server / app, and run a Cursor Agent turn in a harness that actually
invokes project hooks (desktop Cursor or a cloud agent that loads hooks at
session start).

**Note (2026-07-21):** the Cursor Background Agent VM used for PR #111 did
**not** spawn `.cursor/hooks.json` commands for its own tool calls (debug
invocation log stayed empty). The forwarder → receiver → normalizer path was
still proven live via `tests/live/cursor-hooks-live.test.ts` and
`live-capture-server.mjs`.

## Read-only

These scripts only POST observation events. They never modify tool input,
deny permissions, or write into the observed workspace (beyond what Cursor
already does when invoking the hook).
