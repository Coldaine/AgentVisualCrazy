# Design: CLI + MCP Dual-Mode Evals

**Date:** 2026-03-08
**Status:** Approved

## Problem

The eval system only tests sidecar via MCP tools. Users also interact with sidecar via the CLI (`sidecar start`, `sidecar read`, etc.). We need evals that cover both interfaces using the same scenarios.

## Approach

**Runtime flag on the existing eval runner.** One set of eval definitions, mode as a CLI flag. No duplication of fixtures, prompts, or rubrics.

### Alternatives Considered

1. **Mode field on eval tasks (duplicate entries):** 3 evals become 6. Simple but duplicates prompts, rubrics, and fixtures.
2. **Separate eval suites:** Two directories (`evals/mcp/`, `evals/cli/`). Maximum separation but hardest to keep in sync.
3. **Runtime flag (chosen):** `--mode mcp|cli|both`. One set of definitions, mode-aware execution. Best balance of simplicity and DRY.

## Design

### CLI Flag

```bash
node evals/run_eval.js --eval-id 1 --mode mcp    # MCP only
node evals/run_eval.js --eval-id 1 --mode cli    # CLI only
node evals/run_eval.js --eval-id 1               # both (default)
node evals/run_eval.js --all                      # all evals, both modes
```

When mode is `both`, each eval runs twice (once per mode). Default is `both`.

### Runner Behavior by Mode

**MCP mode (current behavior):**
- Passes `--mcp-config <path>` to Claude
- Sidecar available as MCP tools (`sidecar_start`, `sidecar_read`, etc.)

**CLI mode:**
- No MCP config
- Sidecar binary added to PATH in spawned process env
- Claude uses bash to call `sidecar start ...`, `sidecar read ...`, etc.

### Prompt Modification

Each eval task keeps its shared `prompt` (the task description). The runner prepends a mode-specific instruction:

**MCP prefix:**
> "You have access to sidecar MCP tools (sidecar_start, sidecar_read, sidecar_list, etc.). Use these tools to delegate work to another model."

**CLI prefix:**
> "You have access to the `sidecar` CLI tool. Use bash commands like `sidecar start --model <model> --briefing "<task>"` and `sidecar read <task_id> --summary` to delegate work to another model."

### Programmatic Checks (Mode-Aware)

Eval tasks keep existing `programmatic` field (MCP checks). A new `programmatic_cli` field holds CLI-specific checks:

```json
{
  "success_criteria": {
    "programmatic": [
      {"type": "tool_called", "tool": "sidecar_start"},
      {"type": "tool_called", "tool": "sidecar_read"},
      {"type": "file_changed", "path": "src/server.js"}
    ],
    "programmatic_cli": [
      {"type": "bash_command_matches", "pattern": "sidecar\\s+start\\s+--model"},
      {"type": "bash_command_matches", "pattern": "sidecar\\s+(read|status)"},
      {"type": "file_changed", "path": "src/server.js"}
    ],
    "llm_judge": { "..." }
  }
}
```

- `file_changed`, `file_created`, `file_contains` are mode-agnostic
- `tool_called`, `tool_param`, `tool_param_matches` are MCP-specific
- `bash_command_matches` is CLI-specific (new criterion type)

The evaluator selects `programmatic` or `programmatic_cli` based on mode. LLM-as-judge rubric is shared.

### New Criterion: `bash_command_matches`

Checks that at least one bash tool call in the transcript contained a command matching a regex pattern.

```json
{"type": "bash_command_matches", "pattern": "sidecar\\s+start\\s+--model"}
```

### Transcript Parsing

`parseTranscript()` return gains a new field:

```javascript
{
  toolCalls: [...],       // existing
  bashCommands: [...],    // NEW: extracted command strings from bash tool calls
  errors: [...],
  inputTokens: ...,
  outputTokens: ...
}
```

`extractBashCommands()` filters tool calls where the tool name is a bash/shell variant (`Bash`, `bash`, `execute_command`, `shell`) and extracts the `command` parameter.

### Result Format

Results include mode:

```json
{
  "eval_id": 1,
  "eval_name": "Debug Auth Bug",
  "mode": "cli",
  "status": "PASS",
  "score": 0.85
}
```

Summary output:

```
Sidecar Eval Results
====================
Eval 1 (MCP): Debug Auth Bug          PASS  0.85  (92s, 15.7k tok)
  Sidecar: gemini, agent=Build
Eval 1 (CLI): Debug Auth Bug          PASS  0.80  (105s, 18.2k tok)
  Sidecar: sidecar start --model gemini
```

Workspace directories include mode:

```
evals/workspace/eval-1-mcp-1710000000000/
evals/workspace/eval-1-cli-1710000000100/
```

## Files to Modify

| File | Changes |
|------|---------|
| `evals/run_eval.js` | `--mode` flag, dual-run logic, prompt prefix prepending |
| `evals/claude_runner.js` | CLI mode env setup (PATH instead of MCP config) |
| `evals/transcript_parser.js` | `extractBashCommands()` function |
| `evals/evaluator.js` | `bash_command_matches` criterion, mode-aware check selection |
| `evals/result_writer.js` | Mode in output and summary formatting |
| `evals/eval_tasks.json` | Add `programmatic_cli` to each eval task |
| `evals/README.md` | Document CLI mode, new flag, new criterion type |

No new files needed. All changes extend existing modules.
