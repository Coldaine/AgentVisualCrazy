# CLI + MCP Dual-Mode Evals Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `--mode mcp|cli|both` flag to the eval runner so each eval scenario can be tested against both the MCP interface and the CLI interface, reusing the same fixtures and rubrics.

**Architecture:** The runner prepends a mode-specific prompt prefix, selects `programmatic` or `programmatic_cli` criteria from the eval task, and the evaluator gains a new `bash_command_matches` criterion type. The transcript parser extracts bash commands from tool calls. Results include the mode label.

**Tech Stack:** Node.js, Jest, existing eval framework (run_eval.js, evaluator.js, etc.)

---

### Task 1: Add `bashCommands` extraction to transcript parser

**Files:**
- Test: `evals/tests/transcript_parser.test.js`
- Modify: `evals/transcript_parser.js`

**Step 1: Write the failing tests**

Add to `evals/tests/transcript_parser.test.js`:

```javascript
test('extracts bash commands from Bash tool calls', () => {
  const lines = [
    '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","id":"tu1","input":{"command":"sidecar start --model gemini --briefing \\"test\\""}}]}}',
    '{"type":"result","subtype":"tool_result","tool_use_id":"tu1","content":"Task started: abc123"}',
  ];
  const transcript = parseTranscript(lines);
  expect(transcript.bashCommands).toHaveLength(1);
  expect(transcript.bashCommands[0]).toContain('sidecar start');
});

test('extracts bash commands from lowercase bash tool name', () => {
  const lines = [
    '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"bash","id":"tu2","input":{"command":"sidecar read abc123 --summary"}}]}}',
    '{"type":"result","subtype":"tool_result","tool_use_id":"tu2","content":"Summary: ..."}',
  ];
  const transcript = parseTranscript(lines);
  expect(transcript.bashCommands).toHaveLength(1);
  expect(transcript.bashCommands[0]).toContain('sidecar read');
});

test('returns empty bashCommands when no bash tool calls', () => {
  const lines = [
    '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"sidecar_start","id":"tu3","input":{"model":"gemini"}}]}}',
    '{"type":"result","subtype":"tool_result","tool_use_id":"tu3","content":"{}"}',
  ];
  const transcript = parseTranscript(lines);
  expect(transcript.bashCommands).toEqual([]);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test evals/tests/transcript_parser.test.js`
Expected: FAIL - `bashCommands` is `undefined`

**Step 3: Write minimal implementation**

In `evals/transcript_parser.js`, add `bashCommands` array and populate it during parsing. The bash tool names to match are: `Bash`, `bash`, `execute_command`, `shell`.

At the top of `parseTranscript()`, add:
```javascript
const bashCommands = [];
const BASH_TOOL_NAMES = new Set(['Bash', 'bash', 'execute_command', 'shell']);
```

In the `tool_use` block handler, after setting `pendingToolUse`, add:
```javascript
if (BASH_TOOL_NAMES.has(block.name) && block.input?.command) {
  bashCommands.push(block.input.command);
}
```

Return `bashCommands` in the result object:
```javascript
return { toolCalls, bashCommands, errors, inputTokens, outputTokens };
```

**Step 4: Run test to verify it passes**

Run: `npm test evals/tests/transcript_parser.test.js`
Expected: All tests PASS (existing + 3 new)

**Step 5: Commit**

```bash
git add evals/transcript_parser.js evals/tests/transcript_parser.test.js
git commit -m "feat(evals): extract bash commands from transcript"
```

---

### Task 2: Add `bash_command_matches` criterion to evaluator

**Files:**
- Test: `evals/tests/evaluator.test.js`
- Modify: `evals/evaluator.js`

**Step 1: Write the failing tests**

Add to `evals/tests/evaluator.test.js`:

```javascript
test('bash_command_matches passes when command matches pattern', () => {
  const transcript = {
    toolCalls: [],
    bashCommands: ['sidecar start --model gemini --briefing "debug auth"'],
    errors: [],
  };
  const criteria = [{ type: 'bash_command_matches', pattern: 'sidecar\\s+start\\s+--model' }];
  const results = runProgrammaticChecks(criteria, transcript, '/tmp');
  expect(results[0].passed).toBe(true);
  expect(results[0].detail).toContain('sidecar start');
});

test('bash_command_matches fails when no command matches', () => {
  const transcript = {
    toolCalls: [],
    bashCommands: ['ls -la', 'cat foo.txt'],
    errors: [],
  };
  const criteria = [{ type: 'bash_command_matches', pattern: 'sidecar\\s+start' }];
  const results = runProgrammaticChecks(criteria, transcript, '/tmp');
  expect(results[0].passed).toBe(false);
});

test('bash_command_matches fails when bashCommands is empty', () => {
  const transcript = {
    toolCalls: [],
    bashCommands: [],
    errors: [],
  };
  const criteria = [{ type: 'bash_command_matches', pattern: 'sidecar\\s+start' }];
  const results = runProgrammaticChecks(criteria, transcript, '/tmp');
  expect(results[0].passed).toBe(false);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test evals/tests/evaluator.test.js`
Expected: FAIL - `Unknown criterion type: bash_command_matches`

**Step 3: Write minimal implementation**

Add a new case in the `switch` statement in `runProgrammaticChecks()`, before the `default`:

```javascript
case 'bash_command_matches': {
  const cmds = transcript.bashCommands || [];
  const regex = new RegExp(c.pattern);
  const match = cmds.find(cmd => regex.test(cmd));
  return {
    type: c.type,
    pattern: c.pattern,
    passed: !!match,
    detail: match ? `Matched: ${match.slice(0, 100)}` : 'No matching bash command',
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test evals/tests/evaluator.test.js`
Expected: All tests PASS (existing + 3 new)

**Step 5: Commit**

```bash
git add evals/evaluator.js evals/tests/evaluator.test.js
git commit -m "feat(evals): add bash_command_matches criterion type"
```

---

### Task 3: Add `programmatic_cli` to eval task definitions

**Files:**
- Modify: `evals/eval_tasks.json`

**Step 1: No test needed** (JSON data, validated by Task 5 integration tests)

**Step 2: Add `programmatic_cli` field to each eval task**

For eval 1 (Debug Auth Bug):
```json
"programmatic_cli": [
  {"type": "bash_command_matches", "pattern": "sidecar\\s+start\\s+--model"},
  {"type": "bash_command_matches", "pattern": "sidecar\\s+(read|status)"},
  {"type": "file_changed", "path": "src/server.js"}
]
```

For eval 2 (Generate Tests):
```json
"programmatic_cli": [
  {"type": "bash_command_matches", "pattern": "sidecar\\s+start\\s+--model"},
  {"type": "bash_command_matches", "pattern": "sidecar\\s+(read|status)"},
  {"type": "file_created", "pattern": "tests/.*\\.js$"}
]
```

For eval 3 (Research and Document):
```json
"programmatic_cli": [
  {"type": "bash_command_matches", "pattern": "sidecar\\s+start\\s+--model"},
  {"type": "bash_command_matches", "pattern": "sidecar\\s+(read|status)"},
  {"type": "file_created", "pattern": "docs/.*\\.md$"}
]
```

**Step 3: Commit**

```bash
git add evals/eval_tasks.json
git commit -m "feat(evals): add programmatic_cli criteria to eval tasks"
```

---

### Task 4: Add `--mode` flag and mode-aware execution to runner

**Files:**
- Test: `evals/tests/claude_runner.test.js`
- Modify: `evals/claude_runner.js`
- Modify: `evals/run_eval.js`

**Step 1: Write the failing tests**

Add to `evals/tests/claude_runner.test.js`:

```javascript
describe('buildClaudeCommand mode support', () => {
  test('MCP mode includes --mcp-config flag', () => {
    const cmd = buildClaudeCommand({
      prompt: 'test', model: 'sonnet', maxBudget: 2.0,
      mcpConfigPath: '/tmp/mcp.json', sandboxDir: '/tmp/sandbox',
    });
    expect(cmd.args).toContain('--mcp-config');
  });

  test('CLI mode omits --mcp-config and adds sidecar to PATH', () => {
    const cmd = buildClaudeCommand({
      prompt: 'test', model: 'sonnet', maxBudget: 2.0,
      mcpConfigPath: null, sandboxDir: '/tmp/sandbox',
    });
    expect(cmd.args).not.toContain('--mcp-config');
    expect(cmd.env.PATH).toContain('sidecar');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test evals/tests/claude_runner.test.js`
Expected: FAIL - CLI mode test fails because `buildClaudeCommand` always adds `--mcp-config`

**Step 3: Implement `buildClaudeCommand` changes**

In `evals/claude_runner.js`, modify `buildClaudeCommand` to conditionally include `--mcp-config`:

```javascript
function buildClaudeCommand({ prompt, model, maxBudget, mcpConfigPath, sandboxDir }) {
  const args = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--model', model,
    '--max-budget-usd', String(maxBudget),
    '--verbose',
  ];

  if (mcpConfigPath) {
    args.push('--mcp-config', mcpConfigPath);
  }

  const env = { ...process.env, CLAUDECODE: '' };

  // For CLI mode (no MCP config), add sidecar bin dir to PATH
  if (!mcpConfigPath) {
    const sidecarBinDir = path.join(EVALS_DIR, '..', 'bin');
    const nodeModulesBin = path.join(EVALS_DIR, '..', 'node_modules', '.bin');
    env.PATH = `${sidecarBinDir}:${nodeModulesBin}:${env.PATH || ''}`;
  }

  return { command: 'claude', args, env, cwd: sandboxDir };
}
```

**Step 4: Implement `run_eval.js` mode logic**

Add mode-specific prompt prefixes as constants:

```javascript
const MODE_PREFIX_MCP = 'You have access to sidecar MCP tools (sidecar_start, sidecar_read, sidecar_list, etc.). Use these tools to delegate work to another model.\n\n';
const MODE_PREFIX_CLI = 'You have access to the `sidecar` CLI tool. Use bash commands like `sidecar start --model <model> --briefing "<task>"` and `sidecar read <task_id> --summary` to delegate work to another model.\n\n';
```

Modify `main()` to parse `--mode`:

```javascript
const modeArg = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'both';
const modes = modeArg === 'both' ? ['mcp', 'cli'] : [modeArg];
```

Modify the eval loop to iterate over modes:

```javascript
for (const task of toRun) {
  for (const mode of modes) {
    const result = await runEval(task, { dryRun, model: modelOverride, mode });
    if (result) { results.push(result); }
  }
}
```

Modify `runEval()` to accept and use `opts.mode`:

1. Select prompt prefix based on mode:
```javascript
const mode = opts.mode || 'mcp';
const prefix = mode === 'cli' ? MODE_PREFIX_CLI : MODE_PREFIX_MCP;
const fullPrompt = prefix + task.prompt;
```

2. Only write MCP config for MCP mode:
```javascript
let mcpConfigPath = null;
if (mode === 'mcp') {
  const mcpConfig = buildMcpConfig();
  mcpConfigPath = path.join(sandboxDir, '.mcp-config.json');
  fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig));
}
```

3. Select correct criteria based on mode:
```javascript
const criteria = mode === 'cli'
  ? task.success_criteria.programmatic_cli
  : task.success_criteria.programmatic;
```

4. Include mode in workspace dir name:
```javascript
const workDir = path.join(WORKSPACE_DIR, `eval-${task.id}-${mode}-${timestamp}`);
```

5. Include mode in console output and result object:
```javascript
console.log(`\nRunning Eval ${task.id} (${mode.toUpperCase()}): ${task.name}`);
// ... in result:
const result = { eval_id: task.id, eval_name: task.name, mode, status: ... };
```

6. Pass `fullPrompt` and `mcpConfigPath` (possibly null) to `runClaude`:
```javascript
runResult = await runClaude({
  prompt: fullPrompt,
  model: opts.model || task.model,
  maxBudget: task.max_budget_usd,
  mcpConfigPath,
  sandboxDir,
});
```

**Step 5: Run tests to verify they pass**

Run: `npm test evals/tests/claude_runner.test.js`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add evals/run_eval.js evals/claude_runner.js evals/tests/claude_runner.test.js
git commit -m "feat(evals): add --mode mcp|cli|both flag to eval runner"
```

---

### Task 5: Update result writer for mode display

**Files:**
- Test: `evals/tests/result_writer.test.js`
- Modify: `evals/result_writer.js`

**Step 1: Write the failing tests**

Add to `evals/tests/result_writer.test.js`:

```javascript
test('formats summary line with mode label', () => {
  const line = formatSummaryLine({
    eval_id: 1, eval_name: 'Debug Auth Bug', mode: 'mcp', status: 'PASS', score: 0.85,
    duration_seconds: 92,
    token_usage: { claude: { input_tokens: 12500, output_tokens: 3200 } },
    sidecar_calls: [{ tool: 'sidecar_start', params: { model: 'gemini', agent: 'Build' } }],
  });
  expect(line).toContain('(MCP)');
  expect(line).toContain('Debug Auth Bug');
});

test('formats CLI mode summary with bash command', () => {
  const line = formatSummaryLine({
    eval_id: 1, eval_name: 'Debug Auth Bug', mode: 'cli', status: 'PASS', score: 0.80,
    duration_seconds: 105,
    token_usage: { claude: { input_tokens: 15000, output_tokens: 3200 } },
    sidecar_calls: [],
    cli_commands: ['sidecar start --model gemini --briefing "debug auth"'],
  });
  expect(line).toContain('(CLI)');
  expect(line).toContain('sidecar start');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test evals/tests/result_writer.test.js`
Expected: FAIL - no `(MCP)` or `(CLI)` in output

**Step 3: Implement changes**

Modify `formatSummaryLine()` in `evals/result_writer.js`:

1. Add mode label to the eval name:
```javascript
const modeLabel = result.mode ? ` (${result.mode.toUpperCase()})` : '';
const name = result.eval_name.padEnd(30);
return `Eval ${result.eval_id}${modeLabel}: ${name} ${result.status}  ${scoreStr}  (${durStr}, ${tokStr})${sidecarInfo}`;
```

2. For CLI mode, show the first sidecar bash command instead of MCP tool params:
```javascript
if (!startCall && result.cli_commands?.length) {
  const cmd = result.cli_commands.find(c => c.includes('sidecar start')) || result.cli_commands[0];
  sidecarInfo = `\n  Sidecar: ${cmd.slice(0, 80)}`;
}
```

Also update `runEval()` in `run_eval.js` to populate `cli_commands` on the result when in CLI mode:

```javascript
// After parsing transcript, extract sidecar CLI commands
const cliCommands = mode === 'cli'
  ? (transcript.bashCommands || []).filter(c => c.includes('sidecar'))
  : [];

// In result object:
const result = {
  // ... existing fields ...
  mode,
  cli_commands: cliCommands,
};
```

**Step 4: Run tests to verify they pass**

Run: `npm test evals/tests/result_writer.test.js`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add evals/result_writer.js evals/tests/result_writer.test.js evals/run_eval.js
git commit -m "feat(evals): show mode label and CLI commands in result summary"
```

---

### Task 6: Update eval documentation

**Files:**
- Modify: `evals/README.md`

**Step 1: No test needed** (documentation only)

**Step 2: Update README.md**

Add to the "Running Evals" section:

```markdown
### Mode Selection

Evals can run against the MCP interface, CLI interface, or both:

\`\`\`bash
# MCP only (sidecar as MCP tools)
node evals/run_eval.js --eval-id 1 --mode mcp

# CLI only (sidecar as bash commands)
node evals/run_eval.js --eval-id 1 --mode cli

# Both modes (default)
node evals/run_eval.js --eval-id 1

# All evals, both modes
node evals/run_eval.js --all
\`\`\`

**MCP mode:** Claude uses sidecar MCP tools (`sidecar_start`, `sidecar_read`, etc.) connected via `--mcp-config`.

**CLI mode:** Claude uses bash to run `sidecar start`, `sidecar read`, etc. The sidecar binary is added to PATH.

Each mode uses its own programmatic criteria (`programmatic` for MCP, `programmatic_cli` for CLI). The LLM-as-judge rubric is shared.
```

Add `bash_command_matches` to the Scoring > Programmatic Checks table:

```markdown
| `bash_command_matches` | Did a bash tool call contain a command matching this regex? |
```

Update the result format example to include the `mode` field.

Update the summary output example to show `(MCP)` and `(CLI)` labels.

**Step 3: Commit**

```bash
git add evals/README.md
git commit -m "docs(evals): document CLI mode, --mode flag, and bash_command_matches"
```

---

### Task 7: Update usage help and run full test suite

**Files:**
- Modify: `evals/run_eval.js` (usage text)

**Step 1: Update usage text in `main()`**

```javascript
console.log('Usage:');
console.log('  node evals/run_eval.js --eval-id <id>');
console.log('  node evals/run_eval.js --eval-id <id> --mode mcp|cli|both');
console.log('  node evals/run_eval.js --all');
console.log('  node evals/run_eval.js --all --dry-run');
console.log('  node evals/run_eval.js --eval-id 1 --model opus');
```

**Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass (existing 25 + ~8 new = ~33 tests)

**Step 3: Commit**

```bash
git add evals/run_eval.js
git commit -m "feat(evals): update CLI usage text with --mode flag"
```
