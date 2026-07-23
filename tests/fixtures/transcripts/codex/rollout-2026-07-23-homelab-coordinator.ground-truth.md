# Ground Truth — Codex Homelab Coordinator Session

Fixture: `rollout-2026-07-23-homelab-coordinator.jsonl`
Source session: `019f8ee7-e51f-7ed1-b650-b7fb11ffecda` (Codex CLI 0.145.0, `codex-tui`,
cwd `C:\_projects\coldaine-homelab`), captured 2026-07-23, ~07:16–11:53 local (CDT).
Sanitized before commit: 17 unique secrets (4 `sk-` API keys, 13 base64 credential/JWT
blobs including a ghcr.io dockerconfigjson) replaced with `REDACTED_*` placeholders.
No other bytes changed; all 3,677 lines remain valid JSON.

These facts were established by independent human + agent forensic review of the raw
session and its downstream repo state. A correct interpretation pipeline replaying this
fixture should be able to recover them. They are the assertable expectations for
deterministic replay tests.

## Format profile (what the ingestion layer must handle)

Top-level line types: `session_meta` (1), `response_item` (2527), `event_msg` (1084),
`world_state` (39), `turn_context` (20), `compacted` (6).

Notable payload types: `reasoning` (821), `custom_tool_call`/`_output` (636 each),
`function_call`/`_output` (110 each), `agent_message` (154), `user_message` (17),
`task_started` (15) / `task_complete` (14), `mcp_tool_call_end` (35),
`patch_apply_end` (34), `web_search_end` (14), `context_compacted` (6),
`turn_aborted` (1), `token_count` (770).

This is the full Codex rollout surface in one real session: reasoning blocks, two
distinct tool-call encodings, subtask lifecycle, MCP calls, patch application, web
search, six context compactions, and one aborted turn.

## Session narrative (human-verified)

1. **~08:39 CDT** — user directive: "write a new plan exclusively focused (but with all
   the lessons learned) targeting standing up all the databases we need". Codex
   researches and produces a database-only execution plan.
2. **~09:04 CDT** — user: "Implement the plan." Implementation begins.
3. **~11:48 CDT** — coordinator's final status: custom PG18 image complete; PG18
   physical recovery and FalkorDB compatibility proven; platform manifests and recovery
   tooling still being repaired; `data-platform` not deployed; restores and cutovers not
   started.

The plan authored *inside this session* is the operative authority for the homelab
data-platform work; the repo doc `docs/plans/data-platform-databases.md` in that repo is
a projection of it.

## Facts a correct interpretation should recover

- **Phase transitions**: research/planning (≈08:39–09:04) → implementation (≈09:04 on),
  with the plan-authoring turn as the pivot.
- **The plan's completion definition** (verbatim in transcript): "A database is complete
  only when its service is healthy, selected data is restored, roles and secrets work,
  representative reads/writes pass, and recoverable backup artifacts have been proved."
- **Ordering constraint** (verbatim): "Merge and reconcile PG18 and FalkorDB first.
  Reconcile PG19 only through the compatibility gate below."
- **PG18 recovery scope** — exactly eight databases: `hangar`, `llm_archiver`,
  `llm_measurements`, `market_live`, `moosegoose`, `techdeals_work`, `todo_cards`, and
  historical `soil` (later merged with current Soil data). Earlier guesses
  (`config_fleet`, `cloud_inventory`) were disproved in-session.
- **Where it stopped** — stated critical path at the end: rotate token → finish/merge
  manifests → finish/merge recovery tooling → reconcile `data-platform` → restore
  PG18/PG19/FalkorDB → consumer cutovers. Deployment, restores, and cutovers had NOT
  started. An interpreter that reports this session as "databases done" has failed.
- **Risk signal**: an exposed `FORGEJO_INTERNAL_TOKEN` was identified in-session and
  deliberately not repeated or rotated unilaterally; rotation was deferred to Doppler.
