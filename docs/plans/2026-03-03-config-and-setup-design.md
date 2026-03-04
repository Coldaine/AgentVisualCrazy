# Sidecar Config & Setup Design

**Date:** 2026-03-03
**Status:** Approved

## Problem

- `--model` is required on every invocation with full model strings like `openrouter/google/gemini-3-flash-preview`
- No persistent configuration — users can't set a default model
- No alias system — "ask Gemini" requires knowing the exact model string
- API key setup is undocumented and scattered across `.env`, env vars, and OpenCode's `auth.json`
- GEMINI.md and AGENTS.md require a sync script instead of symlinks

## Solution

A config file at `~/.config/sidecar/config.json` that stores model aliases and a default model. A `sidecar setup` wizard creates this config. The CLI resolves aliases internally, making `--model` optional when a default exists.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Config location | `~/.config/sidecar/config.json` | XDG convention, global, easy to back up |
| API key management | Don't manage — use OpenCode's auth | No duplicate storage, OpenCode handles auth |
| Alias system | User-configurable in config.json | Full control, explicit, no magic |
| Alias resolution | CLI resolves internally | Skill just passes short names, single resolution point |
| Doc sync | Symlinks (GEMINI.md, AGENTS.md → CLAUDE.md) | Replace sync script, always in sync |
| Config change detection | Hash in CLAUDE.md, CLI detects mismatch | LLM updates its own doc file when config changes |

## Config File Structure

**File:** `~/.config/sidecar/config.json`

```json
{
  "default": "gemini",
  "aliases": {
    "gemini": "openrouter/google/gemini-3-flash-preview",
    "gemini-pro": "openrouter/google/gemini-3-pro-preview",
    "gemini-3.1": "openrouter/google/gemini-3.1-pro-preview",
    "gpt": "openrouter/openai/gpt-5.2-chat",
    "gpt-pro": "openrouter/openai/gpt-5.2-pro",
    "codex": "openrouter/openai/gpt-5.3-codex",
    "claude": "openrouter/anthropic/claude-sonnet-4.6",
    "sonnet": "openrouter/anthropic/claude-sonnet-4.6",
    "opus": "openrouter/anthropic/claude-opus-4.6",
    "haiku": "openrouter/anthropic/claude-haiku-4.5",
    "deepseek": "openrouter/deepseek/deepseek-v3.2",
    "qwen": "openrouter/qwen/qwen3.5-397b-a17b",
    "qwen-coder": "openrouter/qwen/qwen3-coder-next",
    "qwen-flash": "openrouter/qwen/qwen3.5-flash-02-23",
    "mistral": "openrouter/mistralai/mistral-large-2512",
    "devstral": "openrouter/mistralai/devstral-2512",
    "glm": "openrouter/z-ai/glm-5",
    "minimax": "openrouter/minimax/minimax-m2.5",
    "grok": "openrouter/x-ai/grok-4.1-fast",
    "kimi": "openrouter/moonshotai/kimi-k2.5",
    "seed": "openrouter/bytedance-seed/seed-2.0-mini"
  }
}
```

### Key Properties

- `default` — alias name used when `--model` is omitted
- `aliases` — map of short names to full model strings (including provider prefix)
- Full model strings always work and bypass alias lookup
- Changing provider routing = changing the alias value (e.g., `openrouter/google/...` → `google/...`)

## CLI Resolution Logic

**New module:** `src/utils/config.js`

### resolveModel(modelArg)

Resolution order:

1. If `modelArg` contains `/` → full model string, use as-is
2. If `modelArg` is a key in `config.aliases` → return the resolved full string
3. Error: unknown alias, suggest `sidecar setup`
4. If `modelArg` is `undefined` (omitted) and `config.default` exists → resolve that alias
5. Error: no default configured, suggest `sidecar setup`

### Impact on CLI

- `--model` becomes **optional** (if default exists in config)
- `sidecar start --prompt "review auth"` → uses default model
- `sidecar start --model opus --prompt "..."` → resolves alias
- `sidecar start --model openrouter/openai/gpt-5.2 --prompt "..."` → full string, no lookup

## `sidecar setup` Command

### Interactive Wizard

```
$ sidecar setup

Welcome to Sidecar Setup!

Which provider do you use for LLM access?
  > OpenRouter (access many models with one key)
    Google (direct Gemini API)
    OpenAI (direct API)
    I already have keys configured

Checking API access...
✓ OpenRouter key found in ~/.local/share/opencode/auth.json

Choose your default model:
  > gemini — Google Gemini 3 Flash (1M context, fast)
    gemini-pro — Google Gemini 3 Pro (1M context, powerful)
    gpt — OpenAI GPT-5.2 (128K context)
    opus — Claude Opus 4.6 (1M context)
    deepseek — DeepSeek v3.2 (164K context)
    Custom...

Default set to: gemini

Saved to ~/.config/sidecar/config.json
22 model aliases configured.

Ready! Try: sidecar start --prompt "Hello"
```

### What Setup Does

- Creates `~/.config/sidecar/` directory
- Writes `config.json` with all aliases and chosen default
- Detects existing API keys (checks OpenCode's auth.json and env vars)
- For missing keys: directs users to `npx opencode-ai` then `/connect`, or `export KEY=value`

### What Setup Does NOT Do

- Does not store or manage API keys (OpenCode handles auth)
- Does not modify CLAUDE.md (hash detection handles that on next `sidecar start`)

### Re-running Setup

- `sidecar setup` — full wizard, overwrites config
- `sidecar setup --add-alias fast=openrouter/google/gemini-3-flash-preview` — quick alias add

## Config Change Detection & Doc Updates

### Hash Mechanism

1. `src/utils/config.js` computes a hash of the config file content
2. CLAUDE.md contains a hash comment: `<!-- sidecar-config-hash: a3f8b2c1 -->`
3. On `sidecar start`, CLI compares current config hash to the one in CLAUDE.md
4. If mismatch, CLI outputs update data to stderr

### Update Output Format

```
[SIDECAR_CONFIG_UPDATE] Model configuration has changed.
Update your project doc file (CLAUDE.md, GEMINI.md, or AGENTS.md)
"Model Aliases" section with:

<!-- sidecar-config-hash: b4c9d3e2 -->
### Model Aliases

| Alias | Model |
|-------|-------|
| gemini (default) | openrouter/google/gemini-3-flash-preview |
| gpt | openrouter/openai/gpt-5.2-chat |
| opus | openrouter/anthropic/claude-opus-4.6 |
...
```

### LLM Responsibility

- The LLM reads the update data from stderr
- Updates its own doc file (Claude → CLAUDE.md, Gemini → GEMINI.md)
- Since GEMINI.md and AGENTS.md are symlinks to CLAUDE.md, one update covers all

## Symlink Migration

Replace GEMINI.md and AGENTS.md with symlinks:

```bash
# In project root
rm GEMINI.md AGENTS.md
ln -s CLAUDE.md GEMINI.md
ln -s CLAUDE.md AGENTS.md
```

- Delete `scripts/sync-agent-docs.js` (no longer needed)
- Remove sync references from CLAUDE.md checklists
- Remove sync references from package.json scripts (if any)

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/utils/config.js` | **Create** | loadConfig, saveConfig, resolveModel, computeHash |
| `src/sidecar/setup.js` | **Create** | Interactive wizard logic |
| `src/cli.js` | **Modify** | Add `setup` command, make `--model` optional, resolve aliases |
| `src/utils/validators.js` | **Modify** | validateApiKey runs after alias resolution |
| `GEMINI.md` | **Replace** | Symlink to CLAUDE.md |
| `AGENTS.md` | **Replace** | Symlink to CLAUDE.md |
| `scripts/sync-agent-docs.js` | **Delete** | Replaced by symlinks |
| `CLAUDE.md` | **Modify** | Add Model Aliases section with hash comment |
| `skill/SKILL.md` | **Modify** | Simplify model section, reference aliases |

## Usage Examples

```bash
# First-time setup
sidecar setup

# Uses default model (no --model needed)
sidecar start --prompt "Review the auth flow"

# Use a specific alias
sidecar start --model opus --prompt "Deep analysis of the caching layer"

# Full model string still works
sidecar start --model openrouter/google/gemini-3.1-pro-preview --prompt "..."

# Add a custom alias
sidecar setup --add-alias fast=openrouter/google/gemini-3-flash-preview

# Headless with alias
sidecar start --model deepseek --prompt "Generate tests for src/utils/" --no-ui
```
