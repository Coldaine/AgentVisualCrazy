---
paths:
  - "prompts/**"
  - "shadow-agent/src/inference/prompts.ts"
---

# Rules for the Shadow System Prompt

The shadow system prompt is the single most important piece of behavioral
configuration in shadow-agent. Treat it accordingly.

## Where it lives

There is **one file**: `shadow-agent/src/inference/prompts.ts`. The prompt
itself is the `SHADOW_SYSTEM_PROMPT` template literal. The rationale,
philosophy, per-section justification, evaluation plan, iteration log, and
"why this lives in one file" meta-decision all live in the file-level doc
comment immediately above it.

There is no separate JSON source, no generated markdown doc, no parity check.
The single-file model is deliberate — see the "Why one file" section in
`prompts.ts` itself and `docs/tooling-philosophy.md` for the broader principle.

## Rules

1. **Every constraint in the prompt has a stated reason.** The "Section
   rationale" block in the doc comment explains why each line exists and what
   failure mode it addresses. If you add a new constraint, add the rationale
   in the same edit. If you remove one, document why in the iteration log and
   in `git log` — every line is there because of an observed regression.

2. **Confidence calibration language must be preserved.** The instruction
   "not every situation warrants 0.9+" exists because models default to high
   confidence. Do not weaken or remove it without a measured replacement.

3. **Update the iteration log for notable changes.** Trivial edits (typo,
   reformatting) don't need a log entry — `git log` covers them. Notable
   changes (new constraint, removed constraint, restructured output schema,
   model-behavior fix) get a one-line entry in the doc comment's iteration
   log so future-me can scan the history without re-reading every commit.

4. **The prompt text must be a plain template literal.** No imports, no
   composition, no runtime substitution. The companion context packet is
   built separately in `prompt-builder.ts`; the system prompt itself stays
   static and copy-paste-into-a-playground-able.

5. **Do not introduce a second prompt file alongside this one** without
   first writing down (in `docs/plans/`) the trigger that justifies it.
   Two prompts is a different cost structure than one — at two, the
   single-file approach starts losing to a small prompt registry.
