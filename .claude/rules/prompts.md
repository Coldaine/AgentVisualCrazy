---
paths:
  - "docs/prompts/**"
---

# Rules for Prompt Files

When reading, editing, or creating files in `docs/prompts/`:

1. **Every prompt section must have inline commentary** explaining why it exists
   and what failure mode it addresses. A prompt without commentary is incomplete.

2. **The iteration log at the bottom must be updated** with every change.
   Record: date, what changed, and why.

3. **The code-side prompt file must be updated in the same commit.**
   The documented prompt and the runtime prompt must be identical.
   See `AGENTS.md` Rule 1 for the full workflow.

4. **Do not remove constraints without documenting why.** Every constraint in a prompt
   exists because of a specific observed failure. Removing it risks regression.

5. **Confidence calibration language must be preserved.** The instruction "not every
   situation warrants 0.9+" exists because models default to high confidence.
   Do not weaken this instruction.
