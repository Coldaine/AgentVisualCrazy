# Tooling Philosophy

> This file captures the principles that govern how shadow-agent's internal tooling
> (build pipelines, CI, hooks, generated artifacts, structured config) is sized and
> structured. It exists because "why didn't we just X" is a question future-me will
> ask repeatedly, and the cost of looking up the answer is much higher than the cost
> of writing it down once.

## Audience: future-me

Shadow-agent is personal tooling. The intended reader for every comment, plan, and
rationale doc is **future-me, six months from now, with zero context**. Future-me
is smart but does not remember why I rejected an approach, why a check exists, or
what the constraint was that pushed a design in a particular direction.

This is different from team-tooling, where the audience is a colleague who might
disagree with you in code review. For team tooling, the WHY belongs in commit
messages and PR descriptions. For personal tooling, the WHY belongs in the
artifact itself, because the artifact is where future-me will be looking.

## Principle 1: Ceremony matches team size, not aspirations

Solo project = solo ceremony. Drift between three files is not a problem if one
person edits one file at a time. CI minutes are not a problem if no one is paying
for them or blocked on them. Eval harnesses are not a problem if there is no one
complaining that quality regressed this week.

Build infrastructure when there's a consumer for it. Not before.

Concrete consequences:
- Single-file source-of-truth over generated-artifact pipelines
- Pre-push hooks (one cost per push) over pre-commit hooks (one cost per WIP
  commit) for expensive checks
- Inline-string prompts over structured prompt manifests, until a prompt-management
  platform is consuming the structure
- Plain markdown docs over CMS-shaped JSON+generator schemes

## Principle 2: The most valuable WHY notes are about decisions NOT taken

In a team setting, the WHY is for the reviewer who has to maintain your code.
In personal tooling, the WHY is for future-me's pattern-recognition: *"oh right,
I rejected that approach in May 2026 because…"*.

This means the highest-leverage comments are ones like:
- "Why didn't we add an eval harness here?" (with triggers for when to add one)
- "Why didn't we use a managed platform like LangFuse?" (with the boundary)
- "Why didn't we build a hook receiver for Codex yet?" (with the dependency)
- "Why did we collapse the JSON-source pipeline into a single file?" (with what
  it replaced and what would trigger reinstating it)

Without these notes, future-me will either rebuild what was rejected (wasting
time) or never build what was intended (missing the upgrade trigger).

Plan files (`docs/plans/*.md`) should include a "Rejected alternatives" or
"Why not X" section by default. The plan that survives is rarely the only one
that was considered.

## Principle 3: Don't pay for problems you don't have

Every pipeline, check, hook, generated artifact, and structured config costs
ongoing maintenance attention. If the problem it solves is hypothetical, the
maintenance cost is real and the benefit is not.

Examples of problems that may not exist yet:
- Multi-editor file drift (only one editor)
- Cost attribution (no users → no costs to attribute)
- Prompt regression in production (no production)
- Cross-platform build divergence (only one platform in use)
- CI minute budget (running on a tier with abundant minutes)

When unsure: write down the trigger that would create the problem, ship without
the infrastructure, and re-evaluate when the trigger fires. See the "When to
upgrade" sections that appear in artifact comments (e.g., the doc comment in
`src/inference/prompts.ts`).

## Principle 4: Anchor decisions on the north star

When in doubt about whether to build, fix, or keep something, check whether it
ultimately serves the three pillars in `docs/north-star.md`:

1. **Watch** — passive capture from observed agents
2. **Interpret** — shadow model produces structured insights
3. **Render** — rich holographic visualization (priority #1)

Tooling that supports the work that supports the work is suspect. The multi-harness
refactor passes the test (more harnesses = more contexts where the visualization
is useful). The prompts-generation pipeline did not (it made editing the prompt
harder without making the rendered output better, sooner, or more reliable).

## Principle 5: WHERE the WHY lives

Two places, no more:

- **Plan files** (`docs/plans/*.md`). Architectural WHY. Include a "Rejected
  alternatives" section in every new plan. High leverage because plan files are
  what future-me reads when picking up after a long pause.
- **The artifact itself** when the WHY isn't obvious from naming. Short prose
  at the top of unusual files (config, prompts, scripts that do something
  surprising). Not on every function. Not on every variable.

Where the WHY does *not* belong:

- `docs/architecture.md`. The rule is that it points at domain docs, not
  duplicates them (`.claude/rules/docs.md` rule 1).
- Inline code comments unless removing them would confuse a reader (this is
  the default code-comment policy, not something special to this project).
- Three files that must agree by tooling. If you find yourself building drift
  enforcement, consolidate the files instead.

## When this philosophy stops applying

This file describes how shadow-agent should be tooled *while it remains personal
tooling for one developer*. The triggers that change the calculus:

- First non-me user → ceremony for handoffs starts paying for itself
- First contributor → drift between files starts being a real problem
- First customer-style obligation → eval/observability/cost-tracking earn their
  cost

When any of those happen, revisit this file. The principles above were correct
for a context that has changed.
