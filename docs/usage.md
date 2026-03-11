# CLI & MCP Usage Reference

## CLI Commands

```bash
# Core workflow
sidecar start --model <model> --prompt "<task>" [--agent <agent>] [--validate-model]
sidecar list [--status <filter>] [--all]
sidecar resume <task_id>
sidecar continue <task_id> --briefing "..."
sidecar read <task_id> [--summary|--conversation]

# Setup & maintenance
sidecar setup                        # Configure default model and aliases
sidecar setup --add-alias name=model # Add a custom alias
sidecar mcp                          # Start MCP server (stdio transport)
sidecar update                       # Update to latest version
```

## MCP Server (for Cowork / Claude Desktop)

```bash
# Auto-registered during npm install. Manual registration:
claude mcp add-json sidecar '{"command":"npx","args":["-y","claude-sidecar@latest","mcp"]}' --scope user
```

MCP tools: `sidecar_start`, `sidecar_status`, `sidecar_read`, `sidecar_list`, `sidecar_resume`, `sidecar_continue`, `sidecar_setup`, `sidecar_guide`, `sidecar_abort`

Session statuses: `running`, `complete`, `aborted`, `crashed`, `error`

## OpenCode Agent Types

The `--agent` option specifies which OpenCode native agent to use:

| Agent | Description | Tool Access |
|-------|-------------|-------------|
| **Build** | Default primary agent | Full (read, write, bash, task) |
| **Plan** | Read-only analysis | Read-only |
| **General** | Full-access subagent | Full |
| **Explore** | Read-only subagent | Read-only |

Custom agents defined in `~/.config/opencode/agents/` or `.opencode/agents/` are also supported.

## Agentic Evals

```bash
node evals/run_eval.js --eval-id 1       # Single eval
node evals/run_eval.js --all             # All evals
node evals/run_eval.js --all --dry-run   # Print commands only
node evals/run_eval.js --eval-id 1 --model opus  # Override model
```

See [evals/README.md](../evals/README.md) for the full eval system documentation.
