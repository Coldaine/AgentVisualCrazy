---
paths:
  - "prompts/**"
  - "docs/prompts/**"
  - "shadow-agent/src/inference/prompts.ts"
---

# Rules for the Shadow System Prompt

The shadow system prompt is the single most important piece of behavioral
configuration in shadow-agent. Treat it accordingly.

## Where it lives

The canonical source is `prompts/shadow-system-prompt.json`. Generated artifacts
must stay in sync:

- `docs/prompts/shadow-system-prompt.md`
- `shadow-agent/src/inference/prompts.ts`

Do not edit generated prompt docs or runtime files directly. Change the JSON
source, then run `npm run prompts:generate` and `npm run prompts:check`.

## Rules

1. **Every constraint in the prompt has a stated reason.** The source JSON
   records section commentary and design principles. If you add a new
   constraint, add the rationale in the same edit. If you remove one, document
   why in the iteration log and in `git log` — every line is there because of
   an observed regression.

2. **Confidence calibration language must be preserved.** The instruction
   "not every situation warrants 0.9+" exists because models default to high
   confidence. Do not weaken or remove it without a measured replacement.

3. **Update the iteration log for notable changes.** Trivial edits (typo,
   reformatting) don't need a log entry — `git log` covers them. Notable
   changes (new constraint, removed constraint, restructured output schema,
   model-behavior fix) get a one-line entry in the source JSON's iteration
   log so future-me can scan the history without re-reading every commit.

4. **Generated runtime stays static.** The companion context packet is built
   separately in `prompt-builder.ts`; the generated system prompt itself stays
   static and copy-paste-into-a-playground-able.

5. **Check parity before committing.** `npm run prompts:check` must pass
   locally, in pre-commit, and in CI.
