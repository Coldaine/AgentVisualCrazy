# Design: Optional Context Injection

**Date:** 2026-03-09
**Status:** Approved

## Problem

Every `sidecar_start` call injects up to 80k tokens of parent conversation history, even when the task is self-contained (e.g., "write unit tests for src/utils/math.ts"). This wastes tokens, slows startup, and adds noise to the sidecar's context window.

## Decision

Let the calling LLM decide whether to include parent context. Default to `includeContext: true` (safe, backward compatible). The LLM opts out with `includeContext: false` when it can fully scope the task in the briefing.

## Design

### 1. Schema Change (`mcp-tools.js`)

Add `includeContext` boolean field to `sidecar_start`:

```js
includeContext: z.boolean().optional().default(true).describe(
  'Whether to include parent conversation history as context. '
  + 'Default: true. Set to false when the briefing is self-contained '
  + 'and does not depend on prior conversation. See sidecar_guide for guidance.'
),
```

Update `sidecar_start` tool description to mention the option.

### 2. CLI Flag (`cli.js`)

Add `--no-context` flag (mirrors `--no-ui` pattern). Passes `includeContext: false` to `startSidecar()`.

### 3. Start Flow (`src/sidecar/start.js`)

Conditional around `buildContext()`:

```js
const rawContext = includeContext
  ? buildContext(effectiveProject, effectiveSession, { ... })
  : '[Context excluded by caller - briefing is self-contained]';
```

Sentinel string ensures `buildPrompts()` still receives a string and the sidecar knows context was intentionally excluded.

### 4. MCP Server (`src/mcp-server.js`)

`sidecar_start` handler passes `--no-context` to CLI args when `input.includeContext === false`.

### 5. Guide Updates (`mcp-tools.js` - `getGuideText()`)

Add red-flag rules for when context MUST be included:
- Task references prior conversation ("the code we discussed", "that bug")
- Fact checking or second opinions on recent work
- Code review of changes made in this session
- "Does this look right?" or validation requests
- Continuing a debugging thread
- Any task where the sidecar needs to understand what happened before

Add guidance for when it's safe to skip:
- Greenfield tasks with explicit file paths and instructions
- General knowledge or research questions
- Tasks fully scoped in the briefing
- Independent analysis unrelated to current conversation

Add self-contained briefing template:
> When setting `includeContext: false`, write a richer briefing that includes: specific file paths to read, relevant code snippets, concrete acceptance criteria, and any constraints. The sidecar has no other context to work from.

### 6. Skill Updates (`skill/SKILL.md`)

- Add `--no-context` to Optional flags section under "Start a Sidecar"
- Add "Context Control" section after "Generating the Briefing" with red-flag rules and self-contained briefing template

## Testing

| Test File | Assertions |
|-----------|------------|
| `tests/mcp-tools.test.js` | `includeContext` field exists, defaults to `true` |
| `tests/sidecar/start.test.js` | `buildContext()` skipped when `includeContext: false`, called when `true`/omitted |
| `tests/cli.test.js` | `--no-context` parses to `includeContext: false`, absence defaults to `true` |
| `tests/mcp-server.test.js` | Handler passes `--no-context` to CLI args when `includeContext === false` |

## Backward Compatibility

All existing calls omit `includeContext`, which defaults to `true`. No behavior change for current users. No changes to `buildPrompts()`, `headless.js`, `interactive.js`, or `context-builder.js`.

## Rejected Alternatives

- **Tiered context modes** (`full`/`summary`/`none`): Adds complexity. A well-written briefing serves the same purpose as a "summary" mode. YAGNI.
- **Sidecar-side decision**: Having the sidecar LLM decide whether it needs context adds a round-trip and can't be done without first sending the briefing. The calling LLM already has full conversation context to make this decision.
- **`contextSnippet` field**: Separate field for hand-written context blurb overlaps with what a good briefing already provides. Can be added later if needed.
