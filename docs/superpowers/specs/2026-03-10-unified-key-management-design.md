# Unified Key Management Design

**Date:** 2026-03-10
**Status:** Approved

## Problem

API keys are stored and synced across too many locations, causing confusion and bugs:
- `~/.config/sidecar/.env` (sidecar's config store)
- `<project>/.env` (repo root, loaded by dotenv at startup)
- `~/.local/share/opencode/auth.json` (OpenCode's native auth store)
- `process.env` (in-memory, populated from all of the above)

The bidirectional sync between sidecar's `.env` and OpenCode's `auth.json` caused a "zombie key" bug where removed keys resurrected on next startup. The project `.env` leaked dev/CI keys into the setup wizard.

## Design

### Single Source of Truth

`~/.config/sidecar/.env` is the only persistent key store managed by sidecar.

### Three Touchpoints with auth.json

auth.json is treated as an **external source to import from** and **optionally clean on delete**. Sidecar never writes keys TO auth.json.

1. **Auto-import on setup wizard open**: Scan auth.json for provider keys not already in sidecar's `.env`. Import them automatically and show a notice: "Imported X key(s) from OpenCode."
2. **Smart delete**: When removing a key, check if it also exists in auth.json. If yes, prompt: "Also remove from OpenCode?" Clean auth.json only if the user opts in.
3. **No writes on save**: Keys reach OpenCode via `process.env` inheritance when sidecar spawns it as a child process. No auth.json writes needed.

### What Changes

| Current Behavior | New Behavior |
|-----------------|-------------|
| `bin/sidecar.js` loads project `.env` first (line 12) | Remove project `.env` loading entirely |
| `src/index.js` loads `cwd()/.env` via bare `dotenv.config()` (line 8) | Remove this load site too |
| `syncOpenCodeAuth()` runs on every startup (bidirectional) | Remove. Replace with one-time import in setup wizard |
| `auth-sync.js` does bidirectional sync | Replace with `auth-json.js`: read-only import + optional delete |
| `saveApiKey()` writes to `.env` and sets `process.env` | Keep as-is (no auth.json write) |
| `removeApiKey()` always cleans auth.json (openrouter only) | Remove auto-clean. Return `alsoInAuthJson` flag so caller can prompt. |
| `cleanAuthJson()` handles openrouter only (private, non-exported) | Delete. Replaced by `removeFromAuthJson(provider)` in new module. |

### Key Flow

```
Setup wizard opens
  -> readAuthJson() -- any keys sidecar doesn't have?
    -> yes: import to .env via saveApiKey(), show notice banner
    -> no: continue normally

User saves key in wizard
  -> write to ~/.config/sidecar/.env
  -> set process.env (current session)
  -> done (no auth.json write)

User removes key in wizard
  -> call sidecar:remove-key (phase 1: remove from sidecar)
    -> removes from .env + process.env
    -> returns { success, alsoInAuthJson }
  -> if alsoInAuthJson:
    -> UI shows confirmation: "Also remove from OpenCode?"
    -> if yes: call sidecar:remove-from-opencode (phase 2)
      -> removes provider entry from auth.json

Sidecar spawns OpenCode
  -> child process inherits process.env (has all keys from .env)
  -> auth.json is irrelevant for sidecar-spawned sessions
```

### Provider Mapping for auth.json Import

Maps auth.json structure to sidecar's `PROVIDER_ENV_MAP`. The import function
checks both `.key` and `.apiKey` fields for each provider since OpenCode's
storage format varies and SKILL.md historically documented `.apiKey` for
openrouter while the code used `.key`.

| auth.json key | Value paths (checked in order) | Sidecar env var |
|---------------|-------------------------------|-----------------|
| `openrouter` | `.key`, `.apiKey` | `OPENROUTER_API_KEY` |
| `google` | `.apiKey`, `.key` | `GEMINI_API_KEY` |
| `openai` | `.key`, `.apiKey` | `OPENAI_API_KEY` |
| `anthropic` | `.key`, `.apiKey` | `ANTHROPIC_API_KEY` |
| `deepseek` | `.key`, `.apiKey` | `DEEPSEEK_API_KEY` |

**Note:** The actual auth.json structure for openai, anthropic, and deepseek
should be verified against OpenCode's source during implementation. The mapping
above is defensive (checks both fields) to handle unknown formats.

### Deletions

- `syncOpenCodeAuth()` function and `writeAuthJson()` in `src/utils/auth-sync.js` (entire module replaced)
- Startup sync call in `bin/sidecar.js:20-21` (`const { syncOpenCodeAuth } = require(...)` + `syncOpenCodeAuth()`)
- Project `.env` dotenv loading in `bin/sidecar.js:12`
- Bare `dotenv.config()` in `src/index.js:8` (also loads project `.env` from cwd)
- `cleanAuthJson()` private function in `src/utils/api-key-store.js` (lines 236-250)
- The auto-clean call in `removeApiKey()` (line 229: `if (provider === 'openrouter') { cleanAuthJson('openrouter'); }`)

### Additions/Modifications

**`src/utils/auth-json.js`** (new, replaces `auth-sync.js`):
- `readAuthJson()` -- read and parse auth.json, return normalized provider-key map (handles both `.key` and `.apiKey`)
- `importFromAuthJson(existingKeys)` -- returns `{ imported: [{provider, envVar}], skipped: [...] }` for keys in auth.json but not in sidecar
- `removeFromAuthJson(provider)` -- remove a single provider entry from auth.json (all providers, not just openrouter)
- `checkAuthJson(provider)` -- returns boolean: does this provider have a key in auth.json?

**`src/utils/api-key-store.js`**:
- `removeApiKey(provider)` -- remove auto-clean logic. Import `checkAuthJson` from auth-json.js. Return `{ success: true, alsoInAuthJson: boolean }`.

**`electron/ipc-setup.js`**:
- `sidecar:get-api-keys` handler -- also calls `importFromAuthJson()`, returns `{ status, hints, imported }` so UI can show notice
- `sidecar:remove-key` handler -- returns `{ success, alsoInAuthJson }` from `removeApiKey()`
- New `sidecar:remove-from-opencode` handler -- calls `removeFromAuthJson(provider)` (phase 2 of smart delete)

**Setup wizard UI** (`electron/setup-ui-keys-script.js`):
- Import notice banner on Step 1 when `imported.length > 0`
- Two-phase delete: after `sidecar:remove-key` returns `alsoInAuthJson: true`, show confirmation dialog. If confirmed, call `sidecar:remove-from-opencode`.

**`bin/sidecar.js`**:
- Remove line 12 (project `.env` dotenv loading)
- Remove lines 20-21 (`syncOpenCodeAuth()` import and call)
- Keep line 16 (`~/.config/sidecar/.env` loading)

**`src/index.js`**:
- Remove line 8 (bare `dotenv.config()`)

### Testing

- Unit tests for `readAuthJson()` with both `.key` and `.apiKey` field formats
- Unit tests for `importFromAuthJson()` with various auth.json states (empty, partial, full, malformed)
- Unit tests for `removeFromAuthJson()` for all 5 providers
- Unit tests for `checkAuthJson()` presence detection
- Unit test for `removeApiKey()` returning `{ success, alsoInAuthJson }` (behavioral inversion of existing auth.json cleanup test)
- Update `auth-sync.test.js` -> rename to `auth-json.test.js` for new module
- Update `api-key-store-readwrite.test.js`: invert existing "should remove openrouter entry from auth.json" test to verify NO auto-clean
- Verify project `.env` is no longer loaded: test that `ANTHROPIC_API_KEY` from project `.env` does not appear in `readApiKeys()` output
- Verify `src/index.js` bare dotenv removal does not break library consumers
