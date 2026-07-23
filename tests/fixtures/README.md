# Test Fixture Corpus

This directory holds representative session fixtures used across parsing, derive, renderer,
and inference tests. All tests that need representative data should import from here rather
than defining ad-hoc inline data.

## Regenerating Fixtures

Transcript JSONL files are hand-crafted to match Claude Code transcript format. Replay JSONL
files are canonical `CanonicalEvent` objects serialized one-per-line. To update a fixture:
1. Edit the JSONL file directly.
2. Re-run `npm test` and confirm tests still pass.
3. If the schema changes (`CanonicalEvent`, `DerivedState`), update the fixtures accordingly
   and add a comment in this file noting the schema version the fixtures target.

---

## Transcript Fixtures (`transcripts/`)

These use the raw Claude Code transcript format as produced by `~/.claude/projects/.../*.jsonl`.
Each line is a JSON object with `sessionId`, optional `cwd`, and `message.{role, content}`.

| File | Description | Key events |
|------|-------------|------------|
| `happy-path.jsonl` | Small clean session (~6 transcript lines) | Read + Write + success; phase = implementation |
| `tool-heavy.jsonl` | Dense tool session | Many Bash + Read calls; triggers bash-churn risk |
| `risk-escalation.jsonl` | Session with failures | Multiple `tool_result` errors; triggers failed-tool risk |
| `subagent-flow.jsonl` | Sub-agent delegation pattern | user→assistant→tool delegation messages |

---

## Codex Rollout Fixture (`transcripts/codex/`)

`rollout-2026-07-23-homelab-coordinator.jsonl` is a **real, full-scale Codex CLI rollout**
(3,677 lines, ~10 MB) — a 4.5-hour coordinator session orchestrating homelab database
recovery. Unlike the hand-crafted fixtures above, it is frozen captured reality:
reasoning blocks, two tool-call encodings, subtask lifecycles, MCP calls, patch
applications, web searches, six context compactions, and one aborted turn.

It was sanitized before commit (17 secrets → `REDACTED_*` placeholders; every line still
valid JSON). Its human-verified expected interpretations live alongside it in
`rollout-2026-07-23-homelab-coordinator.ground-truth.md` — that file is the assertion
source for deterministic replay tests of the (future) Codex driver and the
interpretation engine. Do not edit either file; regenerate only from a new real capture.

---

## Replay Fixtures (`replays/`)

These are already-normalized `CanonicalEvent` objects in JSONL format, usable directly with
`parseReplay()` and `deriveState()`.

| File | Description |
|------|-------------|
| `happy-path.replay.jsonl` | ~12 clean canonical events; implementation phase |
| `subagent-flow.replay.jsonl` | Parent + subagent nodes with tool events |
| `risk-escalation.replay.jsonl` | Multiple tool failures + bash churn |
| `corrupt-partial.replay.jsonl` | Valid events followed by a truncated/corrupt line |
