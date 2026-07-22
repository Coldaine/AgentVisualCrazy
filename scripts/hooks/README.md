# Hook forwarders

Stock wrappers that turn **command-type** agent hooks (Cursor, and later Codex /
Gemini) into POSTs against AgentVisualCrazy's local hook-receiver.

## Files

| File | Purpose |
|------|---------|
| `forward-to-shadow.sh` | POSIX forwarder (macOS / Linux / WSL / Cursor cloud) |
| `forward-to-shadow.ps1` | Windows PowerShell forwarder |
| `cursor-hooks.example.json` | Example `.cursor/hooks.json` (generic tool hooks + session/subagent/response) |

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

## CI gates

| Gate | Command / job | Needs `CURSOR_API_KEY`? | What it proves |
|------|---------------|-------------------------|----------------|
| **Contract (required)** | `npm run test:cursor-hooks` | No | Real `forward-to-shadow.sh` → hook-receiver → cursor driver → derive |
| **Cursor CLI self-test** | CI job `cursor-cli-hook-selftest` / `npm run test:cursor-cli-hooks` | Yes | Headless `agent -p` loads `.cursor/hooks.json` and POSTs into the receiver |

How Cursor-in-CI works (official):

1. Install CLI: `curl https://cursor.com/install -fsS | bash` ([GitHub Actions](https://cursor.com/docs/cli/github-actions))
2. Auth with `CURSOR_API_KEY` ([headless CLI](https://cursor.com/docs/cli/headless))
3. Commit project hooks at `.cursor/hooks.json` — cloud agents and (per [deployment patterns](https://cursor.com/docs/enterprise/deployment-patterns)) the CLI honor project hooks; user `~/.cursor/hooks.json` does **not** apply in cloud/CI VMs ([hooks docs](https://cursor.com/docs/hooks))
4. Point `SHADOW_HOOK_URL` at the local receiver before `agent -p --force "…"`

Add the secret once:

```bash
gh secret set CURSOR_API_KEY --repo OWNER/REPO --body "$CURSOR_API_KEY"
```

Without the secret, the CLI job skips with a notice; the contract gate still fails the PR if broken.

## Live verification

```bash
# Required contract gate (no API key)
npm run test:cursor-hooks

# Terminal A — capture server (same transport the Electron app uses)
npm run capture:live -- --port 9477 --out /tmp/shadow-live-capture.jsonl

# Terminal B — full Cursor CLI self-test (needs CURSOR_API_KEY + agent on PATH)
npm run test:cursor-cli-hooks
```

Or install `.cursor/hooks.json` (committed in this repo for dogfooding), start the
capture server / app, and run a Cursor Agent turn.

### Mid-session reload (cloud / background agent VMs)

The exec-daemon loads `.cursor/hooks.json` at startup. If you add or change
project hooks **after** the daemon is already running, call:

```bash
scripts/hooks/reload-exec-daemon-hooks.sh
```

That hits `agent.v1.ControlService/ReloadAgentSkills`, which also reloads hook
config. After reload, subsequent Shell / tool calls in **this** agent session
fire `preToolUse` / `postToolUse` / etc. into the forwarder.

**Dogfood proof (2026-07-21, bc-019f84ed…):** before reload → 0 self-hook
events; after reload → live capture received real events with
`sessionId=bc-019f84ed-85e2-7e08-acd0-7c76971f5f4c` and `harnessId=cursor`
(`tool_started` / `tool_completed` for Shell).

## Read-only

These scripts only POST observation events. They never modify tool input,
deny permissions, or write into the observed workspace (beyond what Cursor
already does when invoking the hook).
