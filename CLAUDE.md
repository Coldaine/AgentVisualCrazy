# CLAUDE.md
<!-- Last updated: 2026-03-10 -->

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**Claude Sidecar** is a multi-model subagent tool that extends Claude Code with the ability to spawn parallel conversations with different LLMs (Gemini, GPT-4, o3, etc.) and fold the results back into the main context.

### Core Features

- **Fork & Fold Workflow**: Spawn specialized models for deep exploration, fold summaries back
- **Multi-Model Routing**: Use the right model for the job (Gemini's large context, o3's reasoning, GPT-4's coding)
- **Clean Context**: Isolate deep explorations to sidecars, keep main conversation focused
- **Async-Safe Operations**: File conflict detection and context drift warnings
- **Session Persistence**: Resume, continue, or read previous sidecar sessions

### Key Value Proposition

1. **Right model for the job** - Route tasks to specialized models
2. **Keep context clean** - Isolate deep explorations
3. **Work in parallel** - Background execution with Ctrl+B
4. **Safe async** - Conflict and drift detection

---

## Essential Commands

### Development
```bash
npm start                    # Run sidecar CLI
npm test                     # Run unit tests (Jest, excludes *.integration.test.js)
npm run test:integration     # Run integration tests only (real LLM, costs tokens)
npm run test:all             # Run all tests (unit + integration, used by pre-push)
npm run lint                 # Run ESLint
```

### CLI Usage
```bash
node bin/sidecar.js start --model <model> --prompt "<task>" [--agent <agent>] [--validate-model]
node bin/sidecar.js list [--status <filter>] [--all]
node bin/sidecar.js resume <task_id>
node bin/sidecar.js continue <task_id> --briefing "..."
node bin/sidecar.js read <task_id> [--summary|--conversation]
sidecar setup                    # Configure default model and aliases
sidecar setup --add-alias name=model  # Add a custom alias
sidecar mcp                      # Start MCP server (stdio transport)
sidecar update                       # Update to latest version
```

### MCP Server (for Cowork / Claude Desktop)
```bash
# Auto-registered during npm install. Manual registration:
claude mcp add-json sidecar '{"command":"npx","args":["-y","claude-sidecar@latest","mcp"]}' --scope user
```

MCP tools: `sidecar_start`, `sidecar_status`, `sidecar_read`, `sidecar_list`, `sidecar_resume`, `sidecar_continue`, `sidecar_setup`, `sidecar_guide`, `sidecar_abort`

Session statuses: `running`, `complete`, `aborted`, `crashed`, `error`

### OpenCode Agent Types

The `--agent` option specifies which OpenCode native agent to use:

| Agent | Description | Tool Access |
|-------|-------------|-------------|
| **Build** | Default primary agent | Full (read, write, bash, task) |
| **Plan** | Read-only analysis | Read-only |
| **General** | Full-access subagent | Full |
| **Explore** | Read-only subagent | Read-only |

Custom agents defined in `~/.config/opencode/agents/` or `.opencode/agents/` are also supported.

### Testing
```bash
npm test                           # Unit tests (excludes integration)
npm run test:all                   # Unit + integration tests
npm test tests/context.test.js     # Single file (preferred during dev)
npm test -- --coverage             # Coverage report
```

### Enforcement
```bash
node scripts/check-secrets.js        # Scan staged files for secrets
node scripts/check-file-sizes.js     # Check staged files against 300-line limit
node scripts/generate-docs.js        # Regenerate auto sections in CLAUDE.md
node scripts/generate-docs.js --check # Verify auto sections are current (CI mode)
node scripts/validate-docs.js        # Pre-commit: warn if CLAUDE.md may need update
node scripts/validate-docs.js --full # Full: compare CLAUDE.md against codebase
npm run validate-docs                # Alias for --full mode
```

### Agentic Evals
```bash
node evals/run_eval.js --eval-id 1       # Single eval
node evals/run_eval.js --all             # All evals
node evals/run_eval.js --all --dry-run   # Print commands only
node evals/run_eval.js --eval-id 1 --model opus  # Override model
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Claude Code                            │
│                            │                                 │
│                  sidecar CLI / MCP Server                    │
│      ┌──────────────┬────────┴────────────────────┐         │
│      │              │                             │         │
│      ▼              ▼                             ▼         │
│  Interactive    Headless Mode      MCP (sidecar mcp)        │
│  (Electron)    (OpenCode API)     (stdio transport)         │
│      │              │              Cowork / Desktop          │
│      └──────────────┴──────────────┘                        │
│                     │                                        │
│        Summary returned to Claude Code                       │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User: sidecar start --model google/gemini-2.5 --briefing "Debug auth issue"
       ↓
CLI parses args (cli.js)
       ↓
buildContext() extracts from ~/.claude/projects/[project]/[session].jsonl
       ↓
buildPrompts() creates system prompt + user message
  Interactive: context in system prompt (hidden from UI)
  Headless: context in user message (no UI)
       ↓
startOpenCodeServer() → createSession() → sendPromptAsync()
       ↓
[Interactive]                    [Headless]
Electron BrowserView opens       OpenCode async API (promptAsync)
User converses with model        Agent works autonomously
FOLD clicked →                   Polls for [SIDECAR_FOLD] marker
  Model generates summary            ↓
  (SUMMARY_TEMPLATE prompt)     extractSummary() captures output
       ↓                              ↓
Summary output to stdout → Claude Code receives in context
```

### Fold Mechanism

When the user clicks **Fold** (or presses `Cmd+Shift+F`) in interactive mode:

1. UI shows overlay with spinner ("Generating summary...")
2. `SUMMARY_TEMPLATE` is sent to the model via OpenCode HTTP API (`prompt_async`)
3. Electron polls `/session/:id/message` for the model's response
4. Model generates a structured summary with: Task, Findings, Attempted Approaches, Recommendations, Code Changes, Files Modified, Assumptions, Open Questions
5. Summary is written to stdout with `[SIDECAR_FOLD]` metadata header
6. Electron window closes, `start.js` captures stdout and finalizes session

In headless mode, the agent outputs `[SIDECAR_FOLD]` autonomously when done, and `headless.js` extracts everything before the marker.

### Electron BrowserView Architecture

The Electron shell (`electron/main.js`) uses a **BrowserView** to avoid CSS conflicts between the OpenCode SPA and the sidecar toolbar:

- **BrowserView** (top): Loads the OpenCode web UI at `http://localhost:<port>`. Gets its own physical viewport, no CSS interference with the host window.
- **Main window** (bottom 40px): Renders the sidecar toolbar (branding, task ID, timer, Fold button) via a `data:` URL.
- On resize, `updateContentBounds()` adjusts the BrowserView to fill `height - 40px`.

This replaced earlier CSS-based approaches (`padding-bottom`, `calc(100dvh - 40px)`) which failed because OpenCode's Tailwind `h-dvh` class resolves to the actual browser viewport and ignores parent element overrides.

---

## Directory Structure

<!-- AUTO:tree -->
bin/
└── sidecar.js  # Sidecar CLI Entry Point
src/
├── prompts/
│   └── cowork-agent-prompt.js  # Cowork Agent Prompt
├── sidecar/
│   ├── context-builder.js  # Context Builder Module
│   ├── continue.js  # Load previous session data (metadata, summary, conversation)
│   ├── crash-handler.js  # Crash Handler - Updates metadata to 'error' on uncaught exceptions
│   ├── interactive.js  # Check if Electron is available (lazy loading guard)
│   ├── progress.js  # Lifecycle stage labels
│   ├── read.js  # Sidecar Read Operations Module
│   ├── resume.js  # Load session metadata from session directory
│   ├── session-utils.js  # Standard heartbeat interval in milliseconds
│   ├── setup-window.js  # Setup Window Launcher
│   ├── setup.js  # Sidecar Setup Wizard
│   └── start.js  # Generate a unique 8-character hex task ID
├── utils/
│   ├── agent-mapping.js  # * All OpenCode native agent names (lowercase)
│   ├── alias-resolver.js  # Alias Resolver Utilities
│   ├── api-key-store.js  # Maps provider IDs to environment variable names
│   ├── api-key-validation.js  # Validation endpoints per provider
│   ├── auth-json.js  # Known provider IDs that map to sidecar's PROVIDER_ENV_MAP
│   ├── config.js  # Default model alias map — short names to full OpenRouter model identifiers
│   ├── logger.js  # Structured Logger Module
│   ├── mcp-discovery.js  # MCP Discovery - Discovers MCP servers from parent LLM configuration
│   ├── mcp-validators.js  # MCP Validators
│   ├── model-fetcher.js  # Hardcoded Anthropic models (no public listing endpoint)
│   ├── model-validator.js  # Alias-to-search-term mapping for filtering provider model lists
│   ├── path-setup.js  # Ensures that the project's node_modules/.bin directory is included in the PATH.
│   ├── server-setup.js  # Server Setup Utilities
│   ├── start-helpers.js  # Start Command Helpers
│   ├── thinking-validators.js  # Thinking Level Validators
│   ├── updater.js  # @type {import('update-notifier').UpdateNotifier|null}
│   └── validators.js  # * Provider to API key mapping
├── cli-handlers.js  # CLI Command Handlers
├── cli.js  # * Default values per spec §4.1
├── conflict.js  # File Conflict Detection Module
├── context-compression.js  # Context Compression Module
├── context.js  # Context Filtering Module
├── drift.js  # Context Drift Detection Module
├── environment.js  # Environment Detection Module
├── headless.js  # * Default timeout: 15 minutes per spec §6.2
├── index.js  # Claude Sidecar - Main Module
├── jsonl-parser.js  # JSONL Parser
├── mcp-server.js  # @module mcp-server — Sidecar MCP Server (stdio transport)
├── mcp-tools.js  # Zod pattern for safe task IDs (alphanumeric, hyphens, underscores only)
├── opencode-client.js  # OpenCode SDK Client Wrapper
├── prompt-builder.js  # System Prompt Builder
├── session-manager.js  # * Session status constants
└── session.js  # Session Resolver
electron/
├── assets/
│   ├── icon.png
│   └── icon.svg
├── fold.js  # Fold Logic
├── ipc-setup.js  # IPC Setup Handlers
├── main.js  # Sidecar Electron Shell - v3
├── preload-setup.js  # Sidecar Preload - Setup Mode
├── preload.js  # Sidecar Preload - v3 Minimal
├── setup-ui-alias-script.js  # Setup UI - Alias Editor Script
├── setup-ui-aliases.js  # Grouping metadata for the 20 default aliases
├── setup-ui-keys-script.js  # Setup UI - Step 1 Key Management Script
├── setup-ui-keys.js  # Provider metadata for the setup form
├── setup-ui-model.js  # @type {Array<{alias: string, label: string, routes: Object<string,string>}>}
├── setup-ui-styles.js  # Setup UI - Shared CSS Styles
├── setup-ui.js  # Setup UI - Wizard Orchestrator: API Keys → Models → Aliases → Review
├── summary.js  # Summary Generation via OpenCode API
├── toolbar.js  # Sidecar Toolbar HTML Builder
└── window-position.js  # Window Position Calculator
tests/
├── electron/
│   └── window-position.test.js  # Window Position Tests
├── helpers/
│   ├── cdp-client.js  # CDP Client - Thin Chrome DevTools Protocol helper for E2E tests.
│   ├── cdp-client.test.js
│   └── start-server.js  # Helper script: starts a real OpenCode server and prints connection info.
├── prompts/
│   └── cowork-agent-prompt.test.js
├── scripts/
│   ├── check-file-sizes.test.js  # File Size Enforcement Script Tests
│   ├── check-secrets.test.js  # Secret Detection Script Tests
│   ├── generate-docs.test.js  # Create a temp directory for each test, cleaned up after.
│   └── validate-docs.test.js  # CLAUDE.md Drift Detection Script Tests
├── sidecar/
│   ├── config-change-flow.test.js  # Config Change Detection Flow Tests
│   ├── context-builder.test.js  # Context Builder Tests
│   ├── electron-guard.test.js  # Electron Lazy Loading Guard Tests
│   ├── exit-handler.test.js  # Crash Handler Tests
│   ├── interactive.test.js  # Interactive Mode Tests
│   ├── progress.test.js  # Progress Reader Tests
│   ├── resume.test.js  # Sidecar Resume Tests
│   ├── session-utils.test.js  # Session Utils Tests
│   ├── setup-window.test.js  # Tests for src/sidecar/setup-window.js
│   ├── setup.test.js  # Setup Wizard Tests
│   └── start.test.js  # Sidecar Start Tests
├── agent-mapping.test.js  # Agent Mapping Tests
├── api-key-store-readwrite.test.js  # Tests for src/utils/api-key-store.js — hints, values, and removal
├── api-key-store-validation.test.js  # Tests for src/utils/api-key-store.js — validation and endpoints
├── api-key-store.test.js  # Tests for src/utils/api-key-store.js
├── auth-json.test.js  # Tests for src/utils/auth-json.js
├── cli-handler.integration.test.js  # Helper: run sidecar CLI and return { stdout, stderr, code }
├── cli-headless-e2e.integration.test.js  # Run a sidecar CLI command and return { stdout, stderr, exitCode }
├── cli-process.integration.test.js  # Helper: run sidecar CLI and return { stdout, stderr, code }
├── cli.test.js  # CLI Argument Parser Tests
├── config-fallback.test.js  # Config Direct API Fallback Tests
├── config-hash.test.js  # Sidecar Config Module Tests - Hashing & Alias Table
├── config-null-alias.test.js  # Null Alias Defense Tests
├── config-resolve.test.js  # Sidecar Config Module Tests - Model Resolution
├── config.test.js  # Sidecar Config Module Tests
├── conflict.test.js  # File Conflict Detection Tests
├── context-compression.test.js  # Context Compression Module Tests
├── context.test.js  # Context Filtering Tests
├── drift.test.js  # Context Drift Detection Tests
├── e2e.test.js  # End-to-End Tests for Claude Sidecar
├── electron-headless-mode.test.js
├── electron-toolbar-e2e.integration.test.js  # Electron Toolbar E2E Integration Test
├── environment.test.js  # Environment Detection Tests
├── fold-nudge.test.js
├── headless.test.js  # Tests for headless mode runner
├── index.test.js  # Tests for main index module
├── jsonl-parser.test.js  # JSONL Parser Tests
├── mcp-discovery-integration.test.js  # MCP buildMcpConfig Integration Tests
├── mcp-discovery.test.js  # MCP Discovery Tests
├── mcp-headless-e2e.integration.test.js  # Spawn real MCP server and provide JSON-RPC send/receive methods
├── mcp-headless-lifecycle.test.js  # Create a session directory with metadata.json
├── mcp-model-validation.test.js  # MCP Model Validation Tests
├── mcp-project-dir.test.js
├── mcp-protocol.integration.test.js  # MCP Protocol Integration Tests
├── mcp-repomix-e2e.integration.test.js  # MCP Repomix E2E Test
├── mcp-server.test.js  # MCP Server Handler Tests
├── mcp-tools.test.js  # MCP Tool Definitions Tests
├── model-fetcher.test.js  # Tests for src/utils/model-fetcher.js
├── model-validator-normalize.test.js  # Model Validator Tests — normalizeModelId and config save behavior
├── model-validator.test.js  # Model Validator Tests
├── opencode-client-cowork.test.js  # Tests for client-aware prompt in opencode-client.js buildServerOptions()
├── opencode-client.test.js  # Tests for OpenCode SDK Client Wrapper
├── postinstall.test.js
├── prompt-builder.test.js  # Prompt Builder Tests
├── server-setup.test.js  # Tests for src/utils/server-setup.js
├── session-manager.test.js  # Session Manager Tests
├── session.test.js  # Session Resolver Tests
├── setup-ui-aliases.test.js  # Tests for electron/setup-ui-aliases.js (Alias Editor)
├── setup-ui-keys.test.js  # Tests for electron/setup-ui-keys.js
├── setup-ui-model.test.js  # Tests for electron/setup-ui-model.js
├── setup-ui.test.js  # Tests for electron/setup-ui.js (Wizard Orchestrator)
├── spawn-pipe-deadlock.integration.test.js  # Spawn Stdio Configuration Tests
├── toolbar.test.js  # Tests for electron/toolbar.js
└── updater.test.js  # Updater Module Tests
scripts/
├── benchmark-api-direct.js  # Direct OpenRouter API Benchmark for Thinking Levels
├── benchmark-thinking.js  # * Run a single test with specified model and thinking level
├── check-file-sizes.js  # File size enforcement script for pre-commit hook.
├── check-html.js
├── check-secrets.js  # Secret detection script for pre-commit hook.
├── check-ui.js
├── debug-cdp.js
├── generate-docs-helpers.js  # Helper functions for generate-docs.js.
├── generate-docs.js  # @param {string} dirPath @returns {string[]} Sorted .md filenames
├── generate-icon.js  # Generate app icon PNG from SVG source.
├── integration-test.sh
├── list-models.js
├── postinstall.js  # Install skill file to ~/.claude/skills/sidecar/
├── test-tools.sh
├── validate-docs.js  # * Full drift analysis: compare CLAUDE.md sections against actual filesystem.
├── validate-thinking.js
└── validate-ui.js
evals/
├── tests/
│   ├── claude_runner.test.js
│   ├── evaluator.test.js
│   ├── result_writer.test.js
│   └── transcript_parser.test.js
├── claude_runner.js  # Recursively copy a directory
├── eval_tasks.json
├── evaluator.js  # Recursively find all files relative to baseDir
├── README.md
├── result_writer.js  # Format token count as human-readable string (e.g., "15.7k tok").
├── run_eval.js  # Load eval tasks
└── transcript_parser.js  # Extract text from tool result content (string, array, or object)
<!-- /AUTO:tree -->

---

## Key Modules

<!-- AUTO:modules -->
| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `cli-handlers.js` | CLI Command Handlers | `handleSetup()`, `handleAbort()`, `handleUpdate()`, `handleMcp()` |
| `cli.js` | * Default values per spec §4.1 | `parseArgs()`, `validateStartArgs()`, `getUsage()`, `DEFAULTS()` |
| `conflict.js` | File Conflict Detection Module | `detectConflicts()`, `formatConflictWarning()` |
| `context-compression.js` | Context Compression Module | `compressContext()`, `estimateTokenCount()`, `buildPreamble()`, `DEFAULT_TOKEN_LIMIT()` |
| `context.js` | Context Filtering Module | `filterContext()`, `parseDuration()`, `estimateTokens()`, `takeLastNTurns()` |
| `drift.js` | Context Drift Detection Module | `calculateDrift()`, `formatDriftWarning()`, `countTurnsSince()`, `isDriftSignificant()` |
| `environment.js` | Environment Detection Module | `inferClient()`, `getSessionRoot()`, `detectEnvironment()`, `VALID_CLIENTS()` |
| `headless.js` | * Default timeout: 15 minutes per spec §6.2 | `runHeadless()`, `waitForServer()`, `extractSummary()`, `formatFoldOutput()`, `DEFAULT_TIMEOUT()` |
| `index.js` | Claude Sidecar - Main Module | `APIs()`, `startSidecar()`, `listSidecars()`, `resumeSidecar()`, `continueSidecar()` |
| `jsonl-parser.js` | JSONL Parser | `parseJSONLLine()`, `readJSONL()`, `extractTimestamp()`, `formatMessage()`, `formatContext()` |
| `mcp-server.js` | @module mcp-server — Sidecar MCP Server (stdio transport) | `handlers()`, `startMcpServer()`, `getProjectDir()` |
| `mcp-tools.js` | Zod pattern for safe task IDs (alphanumeric, hyphens, underscores only) | `getTools()`, `getGuideText()`, `safeTaskId()`, `safeModel()` |
| `opencode-client.js` | OpenCode SDK Client Wrapper | `parseModelString()`, `createClient()`, `createSession()`, `createChildSession()`, `sendPrompt()` |
| `prompt-builder.js` | System Prompt Builder | `buildSystemPrompt()`, `buildPrompts()`, `buildEnvironmentSection()`, `getSummaryTemplate()`, `SUMMARY_TEMPLATE()` |
| `session-manager.js` | * Session status constants | `createSession()`, `updateSession()`, `getSession()`, `saveConversation()`, `saveSummary()` |
| `session.js` | Session Resolver | `encodeProjectPath()`, `decodeProjectPath()`, `getSessionDirectory()`, `getSessionId()`, `resolveSession()` |
| `prompts/cowork-agent-prompt.js` | Cowork Agent Prompt | `buildCoworkAgentPrompt()` |
| `sidecar/context-builder.js` | Context Builder Module | `buildContext()`, `parseDuration()`, `resolveSessionFile()`, `applyContextFilters()`, `findCoworkSession()` |
| `sidecar/continue.js` | Load previous session data (metadata, summary, conversation) | `loadPreviousSession()`, `buildContinuationContext()`, `createContinueSessionMetadata()`, `continueSidecar()` |
| `sidecar/crash-handler.js` | Crash Handler - Updates metadata to 'error' on uncaught exceptions | `installCrashHandler()` |
| `sidecar/interactive.js` | Check if Electron is available (lazy loading guard) | `getElectronPath()`, `checkElectronAvailable()`, `buildElectronEnv()`, `handleElectronProcess()`, `runInteractive()` |
| `sidecar/progress.js` | Lifecycle stage labels | `readProgress()`, `writeProgress()`, `extractLatest()`, `computeLastActivity()`, `STAGE_LABELS()` |
| `sidecar/read.js` | Sidecar Read Operations Module | `formatAge()`, `listSidecars()`, `readSidecar()` |
| `sidecar/resume.js` | Load session metadata from session directory | `loadSessionMetadata()`, `loadInitialContext()`, `checkFileDrift()`, `buildDriftWarning()`, `buildResumeUserMessage()` |
| `sidecar/session-utils.js` | Standard heartbeat interval in milliseconds | `HEARTBEAT_INTERVAL()`, `SessionPaths()`, `saveInitialContext()`, `finalizeSession()`, `outputSummary()` |
| `sidecar/setup-window.js` | Setup Window Launcher | `launchSetupWindow()` |
| `sidecar/setup.js` | Sidecar Setup Wizard | `addAlias()`, `createDefaultConfig()`, `detectApiKeys()`, `runInteractiveSetup()`, `runReadlineSetup()` |
| `sidecar/start.js` | Generate a unique 8-character hex task ID | `generateTaskId()`, `createSessionMetadata()`, `buildMcpConfig()`, `checkElectronAvailable()`, `runInteractive()` |
| `utils/agent-mapping.js` | * All OpenCode native agent names (lowercase) | `PRIMARY_AGENTS()`, `OPENCODE_AGENTS()`, `HEADLESS_SAFE_AGENTS()`, `mapAgentToOpenCode()`, `isValidAgent()` |
| `utils/alias-resolver.js` | Alias Resolver Utilities | `applyDirectApiFallback()`, `autoRepairAlias()` |
| `utils/api-key-store.js` | Maps provider IDs to environment variable names | `getEnvPath()`, `readApiKeys()`, `readApiKeyHints()`, `readApiKeyValues()`, `saveApiKey()` |
| `utils/api-key-validation.js` | Validation endpoints per provider | `validateApiKey()`, `validateOpenRouterKey()`, `VALIDATION_ENDPOINTS()` |
| `utils/auth-json.js` | Known provider IDs that map to sidecar's PROVIDER_ENV_MAP | `readAuthJsonKeys()`, `importFromAuthJson()`, `checkAuthJson()`, `removeFromAuthJson()`, `AUTH_JSON_PATH()` |
| `utils/config.js` | Default model alias map — short names to full OpenRouter model identifiers | `getConfigDir()`, `getConfigPath()`, `loadConfig()`, `saveConfig()`, `getDefaultAliases()` |
| `utils/logger.js` | Structured Logger Module | `logger()`, `LOG_LEVELS()` |
| `utils/mcp-discovery.js` | MCP Discovery - Discovers MCP servers from parent LLM configuration | `discoverParentMcps()`, `discoverClaudeCodeMcps()`, `discoverCoworkMcps()`, `normalizeMcpJson()` |
| `utils/mcp-validators.js` | MCP Validators | `validateMcpSpec()`, `validateMcpConfigFile()` |
| `utils/model-fetcher.js` | Hardcoded Anthropic models (no public listing endpoint) | `fetchModelsFromProvider()`, `fetchAllModels()`, `groupModelsByFamily()`, `ANTHROPIC_MODELS()`, `PROVIDER_FAMILY_NAMES()` |
| `utils/model-validator.js` | Alias-to-search-term mapping for filtering provider model lists | `validateDirectModel()`, `filterRelevantModels()`, `normalizeModelId()` |
| `utils/path-setup.js` | Ensures that the project's node_modules/.bin directory is included in the PATH. | `ensureNodeModulesBinInPath()` |
| `utils/server-setup.js` | Server Setup Utilities | `DEFAULT_PORT()`, `isPortInUse()`, `getPortPid()`, `killPortProcess()`, `ensurePortAvailable()` |
| `utils/start-helpers.js` | Start Command Helpers | `resolveModelFromArgs()`, `validateFallbackModel()` |
| `utils/thinking-validators.js` | Thinking Level Validators | `MODEL_THINKING_SUPPORT()`, `getSupportedThinkingLevels()`, `validateThinkingLevel()` |
| `utils/updater.js` | @type {import('update-notifier').UpdateNotifier|null} | `initUpdateCheck()`, `getUpdateInfo()`, `notifyUpdate()`, `performUpdate()` |
| `utils/validators.js` | * Provider to API key mapping | `VALID_AGENT_MODES()`, `PROVIDER_KEY_MAP()`, `MODEL_THINKING_SUPPORT()`, `TASK_ID_PATTERN()`, `validateTaskId()` |
<!-- /AUTO:modules -->

---

## Code Quality Rules

### File Size Limits (HARD LIMITS)

| Entity | Max Lines | Action If Exceeded |
|--------|-----------|-------------------|
| **Any file** | 300 lines | MUST refactor immediately |
| **Any function** | 50 lines | MUST break into smaller functions |

### Documentation Sync (HARD RULE)

Any commit that adds, removes, or renames a file in `src/`, `bin/`, or `scripts/` MUST include a CLAUDE.md update in the same commit. This is not optional. The pre-commit hook will warn if CLAUDE.md is not staged alongside tracked file changes.

### Complexity Red Flags

**STOP and refactor immediately if you see:**

- **>5 nested if/else statements** -> Extract to separate functions
- **>3 try/catch blocks in one function** -> Split error handling
- **>10 imports** -> Consider splitting the module
- **Duplicate logic** -> Extract to shared utilities

### Code Quality Monitoring

```bash
# Check line counts (monitor file sizes - target <300 lines)
find src -name "*.js" -exec wc -l {} + | sort -n

# Find large files (>300 lines need refactoring)
find src -name "*.js" -exec wc -l {} + | awk '$1 > 300'
```

---

## Git Hooks

Managed by [husky](https://typicode.github.io/husky/). Hooks run automatically on commit and push.

### pre-commit (fast, <2s)

Runs on every `git commit`. Blocks the commit if any check fails.

| Step | Script | What It Does |
|------|--------|-------------|
| 1. lint-staged | `npx lint-staged` | ESLint `--fix` on staged `.js` files |
| 2. Secret scan | `node scripts/check-secrets.js` | Blocks commits containing API keys, tokens, or private keys |
| 3. File size check | `node scripts/check-file-sizes.js` | Blocks files over 300 lines |
| 4. Doc generation | `node scripts/generate-docs.js` | Regenerates auto sections, auto-stages CLAUDE.md |
| 5. Doc drift warning | `node scripts/validate-docs.js` | Warns if `src/`/`bin/`/`scripts/` changed without CLAUDE.md |

### pre-push (thorough, ~3min)

Runs on every `git push`. Blocks the push if tests fail.

| Step | What It Does |
|------|-------------|
| 1. Test suite | `npm run test:all` (unit + integration) -- **skipped if cached** (see below) |
| 2. Audit | `npm audit` (warn-only, does not block push) |

### Test Caching (SHA-based)

To avoid re-running the full test suite on push when you just ran `npm test`, the hooks use SHA-based caching:

1. `npm test` / `npm run test:all` succeeds -> `posttest` script writes `HEAD` SHA to `.test-passed`
2. `pre-push` hook compares current `HEAD` SHA against `.test-passed`
3. If they match, tests are skipped with "Tests already passed for \<sha\>"
4. If they differ (new commit since last test run), tests run normally

The cache is invalidated automatically by any new commit. `.test-passed` is gitignored.

---

## Structured Logging

Use `src/utils/logger.js` (levels: error/warn/info/debug). Logs go to stderr to avoid polluting stdout (used for sidecar summary output). See global CLAUDE.md for general logging guidelines.

---

## JavaScript Standards

- **ES2022+** features (top-level await, private fields)
- **ESM modules** (`"type": "module"` in package.json)
- **ESLint strict mode** (no var, eqeqeq: always, curly: all, semi: always)
- **JSDoc comments** for all public APIs

### ESLint Configuration

```javascript
// .eslintrc.js
module.exports = {
  env: { node: true, es2022: true, jest: true },
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  rules: {
    'no-var': 'error',
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],
    'semi': ['error', 'always'],
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
};
```

### JSDoc + TypeScript Declarations

See [docs/jsdoc-setup.md](docs/jsdoc-setup.md) for JSDoc patterns, `.d.ts` generation, and pre-publish workflow.

---

## Development Workflow Checklists

### Before Starting New Work

- [ ] Check file sizes: `find src -name "*.js" -exec wc -l {} + | sort -n`
- [ ] Review CLAUDE.md for current architecture
- [ ] Check test coverage: `npm test -- --coverage`

### During Development

- [ ] Write tests first (TDD)
- [ ] Monitor file growth (<300 lines)
- [ ] Use structured logging (not console.log)
- [ ] Single responsibility per function

### Before Committing

- [ ] Run `npm test` - all tests passing
- [ ] Run `npm run lint` - no lint errors
- [ ] **If UI changed**: Launch Electron with `SIDECAR_DEBUG_PORT=9223`, inspect via CDP, take screenshot to verify
- [ ] Update CLAUDE.md if architecture changed

---

## Code Review Checklist

- [ ] Tests written first (TDD) and passing
- [ ] No file >300 lines
- [ ] No function >50 lines
- [ ] Structured logging (not console.log)
- [ ] JSDoc comments on public APIs
- [ ] Documentation updated if architecture changed

---

## Auto-Generated Sections

Sections between `<!-- AUTO:name -->` markers are maintained by `scripts/generate-docs.js`.
Do NOT edit these by hand. To update: `node scripts/generate-docs.js`.
The pre-commit hook runs this automatically. See [docs/doc-system.md](docs/doc-system.md) for details.

---

## Critical Gotchas

- **Model format**: Must be `{ providerID, modelID }` object, not string. String causes 400.
- **ESM**: SDK is ESM-only. Use dynamic `import()`, not `require()`.
- **Headless agent**: Default agent in `--no-ui` mode is `build` (not `chat`). `chat` stalls.
- **Jest + ESM**: Can't mock dynamic imports without `--experimental-vm-modules`. Use child process.
- **contextBridge**: Does not work with `data:` URLs. Toolbar uses `executeJavaScript()` polling.

---

## Agent Documentation

GEMINI.md and AGENTS.md are symlinks to CLAUDE.md -- no sync needed.

---

## Docs Map

| Topic | File |
|-------|------|
| Documentation system (markers, auto-gen, cross-links) | [docs/doc-system.md](docs/doc-system.md) |
| Testing strategy, tiers, CDP, UI testing, test file index | [docs/testing.md](docs/testing.md) |
| OpenCode SDK integration, agent mapping, API format | [docs/opencode-integration.md](docs/opencode-integration.md) |
| Configuration, env vars, dependencies, model names | [docs/configuration.md](docs/configuration.md) |
| Publishing to npm | [docs/publishing.md](docs/publishing.md) |
| Troubleshooting | [docs/troubleshooting.md](docs/troubleshooting.md) |
| Electron CDP testing patterns | [docs/electron-testing.md](docs/electron-testing.md) |
| JSDoc patterns and type declarations | [docs/jsdoc-setup.md](docs/jsdoc-setup.md) |
| Agentic eval system | [evals/README.md](evals/README.md) |
| Design and implementation plans | [docs/plans/index.md](docs/plans/index.md) |
