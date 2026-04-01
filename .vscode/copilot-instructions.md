# Shadow-Agent Project Instructions

This is a shadow-agent project — a passive visual observer for AI coding agents.

## Required Reading

1. Read `docs/north-star.md` for project vision
2. Read `AGENTS.md` for all workflow rules (mandatory)
3. Read `docs/architecture.md` for technical decisions

## Key Rules (from AGENTS.md)

- **Visual fidelity is the #1 priority** — port agent-flow's Canvas2D renderer directly
- **Prompt changes require the 3-location workflow** — see AGENTS.md Rule 1
- **Read-only constraint** — shadow-agent never writes files or acts on behalf of the observed agent in v1
- **Todo items go in docs/todo.md** with dates, mirrored as GitHub issues
