# Design: Client-Aware System Prompt for Sidecar

**Date:** 2026-03-05
**Status:** Proposed

## Problem

Sidecar's system prompt always frames the agent as a software engineering tool, regardless of how it was launched. When invoked from **Cowork** (vs Claude Code), tasks are often research, analysis, writing, brainstorming, or second opinions — not strictly coding. Every layer of the current prompt stack assumes SE:

- OpenCode's base prompt: "You are OpenCode, the best coding agent on the planet"
- Our sidecar header: "You are a sidecar agent helping with a task from Claude Code"
- Task framing: "solving bugs, adding new functionality, refactoring code"

Cowork solves a similar problem by appending a behavioral overlay (`appendSystemPrompt`) onto Claude Code's base prompt. We need an equivalent mechanism.

## Key Discovery

OpenCode's agent config supports a `prompt` field that **replaces** the provider-level base prompt entirely:

```javascript
// From OpenCode binary — prompt selection logic:
...input.agent.prompt ? [input.agent.prompt] : SystemPrompt.provider(input.model)
```

Since `chat` is our custom agent (defined in `opencode-client.js`), we can set its `prompt` field when `client === 'cowork'` to override the SE-focused base prompt with a general-purpose one.

## Design

### Core Mechanism

**When `client === 'cowork'`:**
1. Default agent becomes `chat` (explicit for cowork entry point)
2. The `chat` agent config gets a `prompt` field → replaces OpenCode's SE base prompt
3. Our `body.system` from `buildPrompts()` continues to layer sidecar context on top

**When `client === 'code-local'` or `code-web'`:**
- Default agent stays `chat` (unchanged)
- `chat` agent has NO `prompt` field → falls through to OpenCode's provider-specific SE prompt
- Everything works exactly as today

### Prompt Layering (Cowork Mode)

```
┌─────────────────────────────────────────────┐
│ Layer 1: chat agent prompt (NEW)            │
│ Our cowork-agent-prompt.js replaces the     │
│ OpenCode base SE prompt entirely            │
├─────────────────────────────────────────────┤
│ Layer 2: body.system (existing, unchanged)  │
│ Sidecar header, project context,            │
│ conversation history, fold/headless mode    │
├─────────────────────────────────────────────┤
│ Layer 3: OpenCode environment (existing)    │
│ Model name, working directory, git status,  │
│ platform, date                              │
└─────────────────────────────────────────────┘
```

### Prompt Layering (Claude Code Mode — unchanged)

```
┌─────────────────────────────────────────────┐
│ Layer 1: OpenCode provider prompt (existing)│
│ gemini_default / anthropic_default / etc.   │
├─────────────────────────────────────────────┤
│ Layer 2: body.system (existing, unchanged)  │
│ Sidecar header, project context,            │
│ conversation history, fold/headless mode    │
├─────────────────────────────────────────────┤
│ Layer 3: OpenCode environment (existing)    │
│ Model name, working directory, git status,  │
│ platform, date                              │
└─────────────────────────────────────────────┘
```

### The Cowork Agent Prompt

Identity is **Sidecar** — not OpenCode, not Claude Code.

Composed of sections that blend cowork-style behavioral guidance with operational mechanics from OpenCode's base prompt:

#### Sections REPLACED (SE → general purpose)

| # | Section | Source | Purpose |
|---|---------|--------|---------|
| 1 | **Identity** | New | "You are Sidecar, a versatile assistant brought into conversations to provide a second perspective, do research, or work on tasks in parallel." |
| 2 | **Tone & formatting** | Adapted from cowork `<tone_and_formatting>` | Warm, natural prose. Avoid over-formatting. Conversational paragraphs, not CLI brevity. No emojis unless asked. |
| 3 | **Evenhandedness** | From cowork `<evenhandedness>` | Present balanced perspectives. Charitable interpretation. Don't reflexively decline debatable topics. |
| 4 | **Responding to mistakes** | From cowork `<responding_to_mistakes_and_criticism>` | Own mistakes honestly. No self-abasement. Maintain steady helpfulness. |
| 5 | **Doing tasks** | Replaces SE-specific section | "The user may request research, analysis, writing, code review, brainstorming, or any task. Recommended flow: understand → plan → execute → verify." |

#### Sections KEPT (operational mechanics)

| # | Section | Source | Why keep |
|---|---------|--------|----------|
| 6 | **Professional objectivity** | From OpenCode base | Accuracy over validation. Disagree when necessary. Universal. |
| 7 | **Task management / TodoWrite** | From OpenCode base | Multi-step task tracking. Examples. Essential for any complex work. |
| 8 | **Tool usage policy** | Adapted from OpenCode base | Parallel calls, Task tool for exploration, Read/Grep/Bash guidance. Wording adapted: "files and resources" not just "codebases". |
| 9 | **Clarification guidance** | Inspired by cowork `<ask_user_question_tool>` | Before multi-step work, clarify scope/format/depth. Skip for simple requests. |

#### Sections NOT included

| Section | Why excluded |
|---------|-------------|
| Cowork `<refusal_handling>` | Handled at model level |
| Cowork `<user_wellbeing>` | Handled at model level |
| Cowork `<computer_use>`, `<file_handling>`, `<artifacts>` | VM-specific, not applicable |
| Cowork `<product_information>` | Sidecar has its own identity |
| OpenCode help/feedback links | Not applicable to sidecar |
| OpenCode code style / linting guidance | SE-specific, not relevant for cowork mode |

### Agent Mapping Change

In `agent-mapping.js`, the default agent selection becomes client-aware:

```javascript
// Current: always defaults to chat
if (!agent) { return { agent: 'chat' }; }

// New: same default, but documented that cowork explicitly uses chat
// The client-awareness happens in opencode-client.js (prompt field)
```

No change needed in agent-mapping.js since `chat` is already the default. The client-awareness is in the server config.

### Server Config Change

In `opencode-client.js` `startServer()`:

```javascript
// Current
chat: {
  description: '...',
  mode: 'primary',
  permission: { edit: 'ask', bash: 'ask', webfetch: 'allow' }
}

// New: conditionally add prompt when client is cowork
const chatAgent = {
  description: 'Conversational agent — reads auto-approved, writes and commands require permission',
  mode: 'primary',
  permission: { edit: 'ask', bash: 'ask', webfetch: 'allow' }
};
if (options.client === 'cowork') {
  chatAgent.prompt = buildCoworkAgentPrompt();
}
config.agent = { ...(config.agent || {}), chat: chatAgent };
```

## Files to Create

| File | Purpose | ~Lines |
|------|---------|--------|
| `src/prompts/cowork-agent-prompt.js` | Full cowork chat agent prompt builder | ~150 |
| `tests/prompts/cowork-agent-prompt.test.js` | Tests for prompt content and structure | ~80 |

## Files to Modify

| File | Change |
|------|--------|
| `src/opencode-client.js` | Accept `client` option in `startServer()`, conditionally set `chat.prompt` |
| `src/sidecar/start.js` | Pass `client` through to `startOpenCodeServer()` |
| `src/utils/agent-mapping.js` | Update comment on line 23 (was misleading about chat being "custom sidecar agent" vs now accurate) |

## Documentation Updates

| File | Change |
|------|--------|
| `README.md` | Document `--client cowork` behavior, explain how sidecar adapts its personality |
| `CLAUDE.md` | Add `src/prompts/cowork-agent-prompt.js` to directory structure and Key Modules. Update agent mapping docs. Note client-aware prompt behavior in OpenCode Integration section. |
| `skill/SKILL.md` | Update `sidecar_start` tool description if client-aware behavior affects MCP usage |

## What Stays the Same

- `body.system` from `buildPrompts()` — still adds sidecar header, project context, conversation history, fold instructions
- `build` and `plan` agents — unchanged, keep SE-focused OpenCode base prompts
- `code-local` / `code-web` clients — completely unchanged behavior
- Agent permissions — `chat` still has `edit: 'ask'`, `bash: 'ask'`

## Testing Strategy

- **Unit tests** for `cowork-agent-prompt.js`: verify prompt contains key sections (identity, tone, evenhandedness, task management, tool usage)
- **Unit tests** for `opencode-client.js`: verify `chat.prompt` is set when `client === 'cowork'`, absent otherwise
- **Integration**: `sidecar start --client cowork --model gemini --prompt "research X"` → verify the agent prompt flows through

## Open Questions

1. Should `build` agent also get a cowork variant? (Probably not — if you explicitly choose `build` from cowork, you likely want SE mode)
2. Should the cowork prompt be configurable via `~/.config/sidecar/config.json`? (Future work — start with hardcoded)
