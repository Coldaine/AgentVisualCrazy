# Agentic Eval System

End-to-end evaluation system that tests whether an LLM can correctly use sidecar as an MCP tool: choosing the right model, selecting appropriate agent modes, writing good briefings, and acting on results.

## How It Works

Each eval spawns a real Claude Code process with the sidecar MCP server connected, pointed at an isolated sandbox project (copied from `fixtures/`). Claude works on the task autonomously, then the system grades both tool usage and decision-making quality.

```
run_eval.js --eval-id 1
  1. Copy fixture to /tmp sandbox
  2. Generate MCP config pointing to sidecar binary
  3. Spawn: claude -p "<prompt>" --output-format stream-json --mcp-config <config>
  4. Capture stream-json output lines
  5. Parse transcript: tool calls, params, results, tokens, errors
  6. Run programmatic checks against transcript + sandbox filesystem
  7. If programmatic checks pass: run LLM-as-judge (Haiku) with rubric
  8. Write results to evals/workspace/
  9. Print summary with scores, tokens, duration
```

## Running Evals

```bash
# Single eval
node evals/run_eval.js --eval-id 1

# All evals
node evals/run_eval.js --all

# Dry run (print commands without executing)
node evals/run_eval.js --all --dry-run

# Override model
node evals/run_eval.js --eval-id 1 --model opus
```

### Requirements

- Claude Code CLI installed and authenticated
- Anthropic API key (for Claude + LLM-as-judge)
- OpenRouter API key (for sidecar model calls)
- Node.js 18+

## Eval Scenarios

| ID | Name | Fixture | Tests |
|----|------|---------|-------|
| 1 | Debug Auth Bug | `buggy-auth-app` | File read/write, code analysis, model selection |
| 2 | Generate Tests | `todo-api` | Multi-file analysis, file creation, agent mode selection |
| 3 | Research and Document | `research-task` | Research capability, file creation, model routing |

## Scoring

Evals use a two-stage scoring system:

### 1. Programmatic Checks (gate)

Run first. All must pass before LLM-as-judge runs.

| Criterion Type | Description |
|----------------|-------------|
| `tool_called` | Was this MCP tool invoked? |
| `tool_param` | Did a tool call include this param with this value? |
| `tool_param_matches` | Regex match on a param value |
| `file_changed` | Was this file modified in the sandbox? |
| `file_created` | Was a new file created matching a pattern? |
| `file_contains` | Does the file contain this regex pattern? |
| `no_errors` | No tool call errors in transcript |

### 2. LLM-as-Judge (quality)

If programmatic checks pass, the transcript is sent to Haiku with a rubric. Each rubric item is scored 1-5. The average must meet the `pass_threshold` (default 3.5).

Rubric items evaluate decision-making quality: model choice, briefing quality, agent mode selection, and whether the LLM acted on sidecar findings.

## Adding New Evals

### 1. Create a fixture

Add a project directory under `evals/fixtures/`:

```
evals/fixtures/my-scenario/
├── package.json
└── src/
    └── ...
```

### 2. Add eval task

Add an entry to `evals/eval_tasks.json`:

```json
{
  "id": 4,
  "name": "My Scenario",
  "description": "What this tests",
  "fixture": "my-scenario",
  "prompt": "Instructions for Claude...",
  "max_budget_usd": 2.0,
  "model": "sonnet",
  "success_criteria": {
    "programmatic": [
      {"type": "tool_called", "tool": "sidecar_start"},
      {"type": "file_changed", "path": "src/app.js"}
    ],
    "llm_judge": {
      "rubric": [
        "Was the model choice appropriate? (1-5)",
        "Was the briefing detailed enough? (1-5)"
      ],
      "pass_threshold": 3.5
    }
  }
}
```

### 3. Run it

```bash
node evals/run_eval.js --eval-id 4
```

## Architecture

```
evals/
├── run_eval.js              # CLI orchestrator
├── claude_runner.js          # Sandbox creation, MCP config, Claude process spawning
├── transcript_parser.js      # Parse stream-json output into structured data
├── evaluator.js              # Programmatic checks + LLM-as-judge
├── result_writer.js          # Write results, format summary
├── eval_tasks.json           # Eval task definitions
├── fixtures/                 # Seed projects (one per scenario)
│   ├── buggy-auth-app/      # Express app with missing await bug
│   ├── todo-api/            # CRUD API with no tests
│   └── research-task/       # Empty project for research eval
├── tests/                    # Unit tests (25 tests, 4 suites)
│   ├── transcript_parser.test.js
│   ├── evaluator.test.js
│   ├── claude_runner.test.js
│   └── result_writer.test.js
└── workspace/                # Output (gitignored)
    └── eval-{id}-{timestamp}/
        ├── result.json       # Scores, criteria results, sidecar calls
        └── transcript.jsonl  # Raw stream-json from Claude
```

## Result Format

Each eval produces a `result.json`:

```json
{
  "eval_id": 1,
  "eval_name": "Debug Auth Bug",
  "status": "PASS",
  "score": 0.85,
  "duration_seconds": 92,
  "token_usage": {
    "claude": {"input_tokens": 12500, "output_tokens": 3200}
  },
  "programmatic_results": [
    {"type": "tool_called", "tool": "sidecar_start", "passed": true, "detail": "Called"}
  ],
  "judge_results": {
    "scores": [{"rubric": "Model choice", "score": 4}],
    "average": 4.0,
    "passed": true
  },
  "sidecar_calls": [
    {"tool": "sidecar_start", "params": {"model": "gemini", "agent": "Build"}}
  ]
}
```

The summary output shows all results in a table:

```
Sidecar Eval Results
====================
Eval 1: Debug Auth Bug              PASS  0.85  (92s, 15.7k tok)
  Sidecar: gemini, agent=Build
Eval 2: Generate Tests              PASS  0.90  (145s, 22.1k tok)
  Sidecar: gemini-pro, agent=Build
Eval 3: Research and Document       FAIL  0.60  (78s, 11.3k tok)
  Sidecar: opus, agent=Chat

Overall: 2/3 passed, avg score: 0.78, total: 49.1k tok
```
