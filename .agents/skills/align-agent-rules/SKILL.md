---
name: align-agent-rules
description: Unify VS Code Copilot and Claude Code instruction files so both tools read the same project rules without duplication. Use when a project has mismatched agent configs such as .vscode/copilot-instructions.md, .github/rules-*.md with applyTo, or a .claude/CLAUDE.md that does not import AGENTS.md.
---

# Align Agent Rules

Unify AI instruction files for VS Code Copilot and Claude Code using only officially supported formats.

## Audit the current state

Look for these common misalignments:

- **`.vscode/copilot-instructions.md`** — VS Code does not load instructions from `.vscode/`. The correct always-on location for Copilot is `.github/copilot-instructions.md`, `AGENTS.md`, or `CLAUDE.md`.
- **`.github/rules-*.md` with `applyTo`** — These are Copilot file-based instructions. Claude Code does not read `applyTo`; it uses `paths`. Rules in this format are not shared with Claude.
- **`.claude/CLAUDE.md` without `@AGENTS.md`** — If this file exists but does not use the `@AGENTS.md` import syntax, Claude Code is not automatically loading the shared instructions.
- **Missing `.claude/rules/` equivalents** — If path-scoped rules exist only for Copilot, Claude will not see them.

## The canonical alignment pattern

1. **`AGENTS.md` at the project root** is the shared source of truth.
2. **`.claude/CLAUDE.md`** imports it with `@AGENTS.md` so Claude loads it at session start.
3. **`.claude/rules/*.md`** holds path-scoped rules using `paths` frontmatter. VS Code reads these when `chat.instructionsFilesLocations` includes `.claude/rules`.
4. **Remove duplicate or wrong-location files** so there is one source of truth per scope.

## Step-by-step procedure

1. **Ensure `AGENTS.md` exists at the project root** with the shared project-wide rules.
2. **Write `.claude/CLAUDE.md`** to import it:
   ```markdown
   @AGENTS.md

   # Claude Code
   [Add any Claude-specific instructions here]
   ```
3. **Move path-scoped rules** from `.github/rules-*.md` or `.github/instructions/*.instructions.md` into `.claude/rules/*.md`. Replace the Copilot `applyTo` frontmatter with Claude's `paths` frontmatter (array of glob patterns):
   ```markdown
   ---
   paths:
     - "src/api/**/*.ts"
   ---

   # API Development Rules
   - All endpoints must include input validation
   ```
   VS Code understands `paths` in `.claude/rules` files per the official custom-instructions documentation.
4. **Enable `.claude/rules` in VS Code** by adding or updating `.vscode/settings.json`:
   ```json
   {
     "chat.instructionsFilesLocations": {
       ".github/instructions": true,
       ".claude/rules": true
     }
   }
   ```
   The default workspace instruction location is `.github/instructions`; `.claude/rules` is **not** enabled by default for workspaces and must be added explicitly. Without this setting, VS Code will ignore `.claude/rules/*.md` entirely.
5. **Delete obsolete files**:
   - `.vscode/copilot-instructions.md`
   - Any `.github/rules-*.md` files that were moved to `.claude/rules/`

## AGENTS.md shape

`AGENTS.md` is plain markdown with natural language instructions. It does **not** use YAML frontmatter, `paths`, or `applyTo`. Write it as normal prose with headers and bullets. Both VS Code Copilot and Claude Code read it as always-on instructions.

## Official format reference

### VS Code Copilot
- **Always-on instructions**: `.github/copilot-instructions.md`, `AGENTS.md`, `CLAUDE.md`
- **File-based instructions**: `.github/instructions/*.instructions.md` with `applyTo` frontmatter
- **Settings**:
  - `chat.instructionsFilesLocations` — directories to scan for instruction files
  - `chat.useClaudeMdFile` — toggle `CLAUDE.md` support
  - `chat.useNestedAgentsMdFiles` — experimental toggle for subfolder `AGENTS.md` files (default `false`)
- **Agent skills locations**: `.claude/skills/` and `.github/skills/` are supported by default via `chat.agentSkillsLocations`
- **Required for `.claude/rules` recognition**: `.claude/rules` must be added to `chat.instructionsFilesLocations` in `.vscode/settings.json`

### Claude Code
- **Project instructions**: `./CLAUDE.md` or `./.claude/CLAUDE.md`
- **Imports**: `@path/to/file` syntax to load additional files into context
- **Path-scoped rules**: `.claude/rules/*.md` with `paths` frontmatter
- **User-level rules**: `~/.claude/rules/`
- **Project skills**: `.claude/skills/`

## What not to do
- Do not keep separate copies of the same rules in Copilot and Claude formats. Use `AGENTS.md` as the single root source and import it into Claude.
- Do not use `applyTo` in `.claude/rules/` files. Claude Code requires `paths`.
- Do not place Copilot instructions inside `.vscode/`. VS Code does not discover them there.
