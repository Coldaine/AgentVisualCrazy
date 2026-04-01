# AGENTS.md

> Governance rules for all AI agents working on this repository.
> This file is the authoritative source for workflow requirements.

## Project Purpose

Shadow-agent is a passive visual observer for AI coding agents. Read `docs/north-star.md`
for the full vision. Read `docs/architecture.md` for technical decisions.

## Required Reading Order

Before making changes, every agent must read:

1. `docs/north-star.md` — What we're building and why
2. `docs/architecture.md` — Technical decisions (references domain docs)
3. This file (`AGENTS.md`) — Workflow rules

---

## Rule 1: Prompt Change Workflow

**Any change to an agent prompt (system prompt, instruction, or structured input template)
must follow this workflow. No exceptions.**

### The Three Locations

Every prompt exists in three places:

1. **Documentation** (`docs/prompts/*.md`): The canonical version with inline commentary
   explaining *why* each section exists and what failure mode it addresses.

2. **Code** (`shadow-agent/src/inference/prompts.ts` or equivalent): The runtime version
   that the application actually loads and sends to the model.

3. **This governance file** (`AGENTS.md`): References the prompt files and states that
   they must be kept in sync.

### Required Steps for Any Prompt Change

1. **Edit the documentation file first** (`docs/prompts/shadow-system-prompt.md`).
   Update both the prompt text AND the inline commentary for the changed section.

2. **Update the iteration log** at the bottom of the prompt documentation file.
   Record the date, what changed, and why.

3. **Update the code file** (`shadow-agent/src/inference/prompts.ts`) to exactly match
   the documented prompt.

4. **Verify sync**: The prompt string in the code file must be character-for-character
   identical to the "Full Prompt (Copy-Paste Ready)" section in the documentation file.

5. **Commit message** must include `prompt:` prefix (e.g., `prompt: add risk loop detection`).

### Why This Process Exists

Prompts are the most important artifact in an AI-assisted system. They are the interface
between your intent and the model's behavior. Undocumented prompt changes lead to:
- Regression (removing a constraint that prevented a known failure mode)
- Drift (the documented prompt and the runtime prompt diverge)
- Opacity (no one knows why a section of the prompt exists)

---

## Rule 2: Documentation Structure

### Required Files

| File | Purpose | Location |
|------|---------|----------|
| `docs/north-star.md` | Project purpose and vision | Must exist |
| `docs/architecture.md` | ADR-style decision log | Must exist |
| `docs/todo.md` | Pending tasks (mirrors GitHub issues) | Must exist |
| `docs/history/*.md` | Completed work log (append-only per PR) | Created per PR |
| `docs/prompts/*.md` | Agent prompts with commentary | One per prompt |
| `docs/research/*.md` | Research, visual patterns, implementation plans | As needed |

### Documentation Rules

- **architecture.md** uses `@` references to domain-specific documents. It does not contain
  deep domain detail itself — it records decisions and points to where the detail lives.

- **todo.md** is a thin wrapper around GitHub issues. Every task in todo.md should have a
  corresponding GitHub issue. Small quick tasks (< 1 hour) can be single-line entries with
  a date. Larger tasks get their own issue.

- **docs/history/** is an append-only log. When a PR is merged, a brief entry is added
  recording what was accomplished. The PR itself is the detailed record.

- **docs/research/** contains implementation plans, visual research, and design explorations.
  These are not prescriptive — they are reference material for implementation.

---

## Rule 3: Visual Fidelity Priority

The #1 priority of this project is an **incredibly rich visual experience**.

When faced with a tradeoff between:
- Visual quality vs. faster implementation → Choose visual quality
- Pixel-perfect rendering vs. convenience abstractions → Choose pixel-perfect
- Copying agent-flow's approach vs. inventing something new → Copy agent-flow first

The vendored repos in `third_party/` are **literal source material**, not just inspiration.
Port code from agent-flow's Canvas2D renderer directly. Adapt to shadow-agent's data model,
but preserve the visual language.

---

## Rule 4: Read-Only Constraint

Shadow-agent is read-only in v1. No agent working on this project should implement:
- File writes on behalf of the observed agent
- Tool calls that affect the observed agent's session
- Automatic interventions or corrections

Shadow watches and interprets. It does not act.

---

## Rule 5: Todo and Issue Management

1. All pending work goes in `docs/todo.md` with a date added.
2. Non-trivial tasks (> 1 hour) also get a GitHub issue.
3. When a task is completed, remove it from `docs/todo.md`.
4. Add a brief entry to `docs/history/` as part of the completing PR.
5. The GitHub issue gets closed with a reference to the PR.

---

## Rule 6: Commit Messages

Follow conventional commits:
- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation only
- `refactor:` — Code restructuring
- `test:` — Test additions or changes
- `prompt:` — Prompt changes (triggers Rule 1 workflow)
- `chore:` — Build, deps, config

Always include the `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` trailer.
