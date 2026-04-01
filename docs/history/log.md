# History

> Append-only log of completed work. Each PR adds an entry. The PR itself is the detailed record.

## 2026-03-26 — PR#3: Initial shadow-agent prototype

- Phase 1 (Schema + Replay MVP) completed
- Canonical event schema (14 event types) defined
- Transcript adapter for Claude Code JSONL
- Deterministic derive layer (phase, risk, file attention, next moves)
- Replay store with JSONL serialization
- File-backed persistence layer
- Electron + React renderer with 5 panels
- Built-in payment-refactor fixture session
- Tests for derive, persistence, replay-store, transcript-adapter

## 2026-03-31 — Session history recovery

- Extracted global AI CLI session history (4,400+ messages, 25 daily files)
- Extracted project-specific history (347 messages from 15 Codex + 1 Claude session)
- Restored accidentally deleted global history

## 2026-04-01 — Visual research and design documentation

- Deep audit of agent-flow rendering patterns (Canvas2D, D3-Force, particles, glass cards)
- Deep audit of sidecar runtime patterns (Electron, OpenCode SDK, MCP, fold, drift detection)
- Visual inspiration catalog from 8 portfolio + open-source references
- Unified visual design strategy document
- Shadow inference engine architecture spec (OpenCode harness + direct API fallback)

## 2026-04-01 — Documentation structure overhaul

- Created `docs/north-star.md` — project vision and pillars
- Created `docs/architecture.md` — ADR-style decision log with domain references
- Created `docs/prompts/shadow-system-prompt.md` — canonical prompt with inline commentary
- Created `AGENTS.md` — governance rules (prompt workflow, visual priority, read-only constraint)
- Created `CLAUDE.md` — thin router to AGENTS.md
- Created `.claude/settings.json` — Claude Code project settings
- Created `.github/rules.md` + domain rules — VS Code / Copilot rules with applyTo frontmatter
- Created `.vscode/copilot-instructions.md` — VS Code Copilot project instructions
- Created `docs/todo.md` — pending task tracker (mirrors GitHub issues)
- Created `docs/history/` — append-only completed work log
- Moved research docs to `docs/research/`
