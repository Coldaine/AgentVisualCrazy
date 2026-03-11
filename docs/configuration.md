# Configuration

## Environment Variables (.env)

```bash
# Required
OPENROUTER_API_KEY=sk-or-...              # Multi-model API access

# Optional
OPENCODE_COMMAND=opencode                 # Override OpenCode command path
SIDECAR_DEFAULT_MODEL=openrouter/google/gemini-2.5-flash
SIDECAR_TIMEOUT=15                        # Headless timeout in minutes
LOG_LEVEL=error                           # debug | info | warn | error

# Model Routing
SIDECAR_DISABLE_MODEL_ROUTING=true        # Disable auto-routing for subagent tasks
SIDECAR_EXPLORE_MODEL=openrouter/...      # Override model for Explore subagents

# Advanced / Debug
SIDECAR_CONFIG_DIR=/path/to/config        # Override config directory (~/.config/sidecar)
SIDECAR_ENV_DIR=/path/to/env              # Override .env file directory
SIDECAR_DEBUG_PORT=9223                   # CDP debug port (default: 9222)
SIDECAR_MOCK_UPDATE=available             # Mock update UI state for testing
```

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `electron` | ^28.0.0 | Interactive sidecar window |
| `tiktoken` | ^1.0.0 | Token estimation |
| `jest` | ^29.0.0 | Testing framework |
| `eslint` | ^8.0.0 | Code linting |
| `husky` | ^9.1.7 | Git hook management |
| `lint-staged` | ^16.3.2 | Run linters on staged files |

### Bundled Dependencies

- `opencode-ai` (>=1.0.0) - LLM conversation engine (installed automatically, no separate install needed)

---

## Model Names Reference

**IMPORTANT**: Always fetch current model names from the OpenRouter API before using them.

**API Endpoint**: `https://openrouter.ai/api/v1/models`

```bash
# Fetch available models
curl https://openrouter.ai/api/v1/models | jq '.data[].id' | grep -i gemini
```

**Common Model IDs** (as of 2026-03):
| Model | OpenRouter ID |
|-------|---------------|
| Gemini 3 Flash | `openrouter/google/gemini-3-flash-preview` |
| Gemini 3 Pro | `openrouter/google/gemini-3-pro-preview` |
| Gemini 3.1 Pro | `openrouter/google/gemini-3.1-pro-preview` |

**Note**: Model names change frequently. Always verify current names via the API or `opencode models openrouter`.

---

## Model Aliases

Sidecar supports model aliases configured via `sidecar setup`. Config is stored at `~/.config/sidecar/config.json`.

```bash
sidecar setup                              # Interactive wizard
sidecar start --prompt "Review auth"       # Uses config default model
sidecar start --model opus --prompt "..."  # Uses alias
sidecar start --model openrouter/google/gemini-3-flash-preview --prompt "..."  # Full string
```

Run `sidecar setup --add-alias name=model` to add custom aliases.
