# MCP Input Validation - Design Spec

**Date:** 2026-03-14
**Status:** Draft
**Branch:** feature/memory-leak

## Problem Statement

MCP tool handlers accept raw inputs (model aliases, prompts, timeouts, agent modes) and pass them downstream without semantic validation. When an unresolvable model alias like `'gemini'` is used, the prompt is silently sent to a non-existent model, causing sessions to hang at `messages: 0` indefinitely with no error feedback to the calling LLM.

## Design

Add a `validateStartInputs()` function to `src/utils/validators.js` that composes existing validators and adds model resolution. Call it at the top of the MCP `sidecar_start` handler before branching into shared server vs per-process paths. On failure, return a structured JSON error response with `isError: true` so the calling LLM can self-correct.

### Validation Function

Add to `src/utils/validators.js`. Composes existing validators where available:

```javascript
/**
 * Validate sidecar_start inputs before session creation.
 * @param {Object} input - Raw MCP tool input
 * @returns {{ valid: true, resolvedModel: string } | { valid: false, error: Object }}
 */
function validateStartInputs(input) {
  // 1. Prompt: reuse existing validatePromptContent()
  const promptResult = validatePromptContent(input.prompt);
  if (!promptResult.valid) {
    return {
      valid: false,
      error: {
        type: 'validation_error',
        field: 'prompt',
        message: promptResult.error,
      },
    };
  }

  // 2. Model: resolve alias to full provider/model string
  //    If model is undefined/null, tryResolveModel uses the configured default
  const { tryResolveModel, getEffectiveAliases } = require('./config');
  const { model: resolved, error: modelError } = tryResolveModel(input.model);
  if (modelError) {
    const aliases = Object.keys(getEffectiveAliases());
    const suggestions = findSimilar(input.model, aliases);
    return {
      valid: false,
      error: {
        type: 'validation_error',
        field: 'model',
        message: `Model '${input.model}' not found. ${modelError}`,
        suggestions,
        available: aliases,
      },
    };
  }

  // 3. Timeout: positive number, max 60 minutes
  if (input.timeout !== undefined) {
    const t = Number(input.timeout);
    if (isNaN(t) || t <= 0) {
      return {
        valid: false,
        error: {
          type: 'validation_error',
          field: 'timeout',
          message: `Timeout must be a positive number (minutes). Got: ${input.timeout}`,
        },
      };
    }
    if (t > 60) {
      return {
        valid: false,
        error: {
          type: 'validation_error',
          field: 'timeout',
          message: `Timeout cannot exceed 60 minutes. Got: ${t}`,
        },
      };
    }
  }

  // 4. Agent + headless compatibility: reuse existing validateHeadlessAgent()
  if (input.noUi) {
    const agentResult = validateHeadlessAgent(input.agent);
    if (!agentResult.valid) {
      return {
        valid: false,
        error: {
          type: 'validation_error',
          field: 'agent',
          message: agentResult.error,
          suggestions: ['Build', 'Plan'],
        },
      };
    }
  }

  return { valid: true, resolvedModel: resolved };
}
```

Note: `validatePromptContent` and `validateHeadlessAgent` already exist in `validators.js`. We compose them rather than reimplementing.

### Fuzzy Matching

Simple prefix matching for model alias suggestions. No Levenshtein needed for v1:

```javascript
/**
 * Find candidates that start with the input or vice versa.
 * @param {string} input
 * @param {string[]} candidates
 * @returns {string[]} Up to 3 matching candidates
 */
function findSimilar(input, candidates) {
  if (!input) { return []; }
  const lower = input.toLowerCase();
  return candidates.filter(c => {
    const cl = c.toLowerCase();
    return cl.startsWith(lower) || lower.startsWith(cl);
  }).slice(0, 3);
}
```

### MCP Integration

In `src/mcp-server.js`, at the top of the `sidecar_start` handler, before any `if (sharedServer.enabled)` check:

```javascript
// Validate inputs before any session creation
const { validateStartInputs } = require('./utils/validators');
const validation = validateStartInputs(input);
if (!validation.valid) {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(validation.error) }],
  };
}
const resolvedModel = validation.resolvedModel;
```

Use `resolvedModel` instead of `input.model` in both:
- Shared server path: passed to `runHeadless()` and written to metadata
- Per-process spawn path: replace `input.model` in CLI args with `resolvedModel`

This also removes the need for the separate `tryResolveModel` call currently in the shared server path (line ~115), since validation already resolved the model.

### Error Response Format

The `validation.error` object is serialized as the MCP tool result text:

```json
{
  "type": "validation_error",
  "field": "model",
  "message": "Model 'gemni' not found.",
  "suggestions": ["gemini"],
  "available": ["gemini", "gpt", "opus", "deepseek"]
}
```

The MCP response wraps it with `isError: true`:
```javascript
{ isError: true, content: [{ type: 'text', text: '{"type":"validation_error",...}' }] }
```

### Files to Modify

| File | Change |
|------|--------|
| `src/utils/validators.js` | Add `validateStartInputs()`, `findSimilar()`. Compose existing `validatePromptContent()` and `validateHeadlessAgent()`. |
| `src/mcp-server.js` | Call `validateStartInputs()` at top of `sidecar_start` handler. Use `resolvedModel` downstream. Remove separate `tryResolveModel` call from shared server path. |
| `tests/validators.test.js` | Add tests for `validateStartInputs()` |

### Success Criteria

1. `sidecar_start` with `model: 'gemni'` (typo) returns immediate error with suggestion `'gemini'`
2. `sidecar_start` with empty prompt returns immediate error
3. `sidecar_start` with `agent: 'chat', noUi: true` returns immediate error
4. `sidecar_start` with `timeout: -5` returns immediate error
5. `sidecar_start` with `timeout: 999` returns immediate error (exceeds 60 min)
6. `sidecar_start` with `model: 'gemini'` (valid alias) resolves and works
7. `sidecar_start` with `model: undefined` uses configured default (no error)
8. Existing eval 1 continues to pass
9. All unit tests pass
