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

These use the raw observed-agent wire format (Claude Code JSONL or Cursor hook JSON),
one JSON object per line.

| File | Harness | Description | Key events |
|------|---------|-------------|------------|
| `happy-path.jsonl` | Claude Code | Small clean session (~6 transcript lines) | Read + Write + success; phase = implementation |
| `tool-heavy.jsonl` | Claude Code | Dense tool session | Many Bash + Read calls; triggers bash-churn risk |
| `risk-escalation.jsonl` | Claude Code | Session with failures | Multiple `tool_result` errors; triggers failed-tool risk |
| `subagent-flow.jsonl` | Claude Code | Sub-agent delegation pattern | user→assistant→tool delegation messages |
| `cursor-hooks.jsonl` | Cursor | Hook-receiver payloads (`hook_event_name`) | sessionStart, tools, afterFileEdit, subagent, stop |

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
