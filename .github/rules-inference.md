---
applyTo: "shadow-agent/src/inference/prompt*"
---

# Rules for Runtime Prompt Code

1. **Must exactly match** the documented version in `docs/prompts/shadow-system-prompt.md`.
2. **Changes here require updating the documentation file first** — see `AGENTS.md` Rule 1.
3. **Do not add prompt text that isn't documented.** No inline prompt strings outside
   the canonical prompt files.
