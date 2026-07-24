# Plan: The Exhibit Floor — reviving the RepoVis vision as the shipped UI

Status: **design accepted, implementation in flight** (PR series below).
Date: 2026-07-23.

## Why this exists

This repo's original purpose: **an agent with a rich prompt creates interesting artifacts,
rendered by UI we built in advance.** That vision entered the repo on 2026-04-05
(`3ce52d8`, the RepoVis merge: a working 5-view animated prototype plus ~40 exhibit-grade
visualization concepts) and was demoted to an idea bank (`docs/ideas/repoviz/`) during the
2026-05-30 cleanup — never implemented. What shipped instead is a competent but modest
force-graph dashboard, with the model's rich output flattened to a phase chip, a risk list,
and one prediction line. `docs/north-star.md` is explicit that the idea bank "is the bar the
Render pillar is aiming for." This plan makes the app hit that bar.

## The inversion

Today: the LLM fills slots in a fixed dashboard. The renderer never even reads
`structuredPayload` — the one channel carrying the model's rich fields dead-ends at the
renderer boundary (`src/renderer` has zero consumers of it).

After this plan: **we pre-build an exhibit component library (the artifact vocabulary), and
the shadow LLM is the curator.** It receives large context packets, decides which exhibit
type fits the moment, fills that exhibit's typed contract with *curated, interpreted*
content plus a mandatory narrative, assigns relevance and decay, and the stage cycles the
resulting gallery like a museum floor. The UI is authored in advance; the *content and
curation* are authored live by the model. "Not a dashboard. It is an exhibition."

Design language is lifted directly from `docs/ideas/repoviz/exhibit-prototype.jsx` (the
orphaned working prototype): the dark spatial `Frame` (radial glows + faint grid +
vignette), `accentByKind` entity colors, chip eyebrows, curved SVG connectors with
draw-on animation, glass commentary panels, idle cycling with pause-on-hover.

## The exhibit vocabulary (v1: seven types)

Each exhibit is a pre-built React component with a **typed payload contract**. Five come
from the prototype's proven views, two from the idea bank's "best five" creative
directions (`codebase-comparison-matrix.md`), re-aimed from "repo observation" to
"agent-session observation."

| # | `exhibit_type` | Source | What it shows | Payload contract (summary) |
|---|---|---|---|---|
| 1 | `relationship_dag` | prototype view 01 | Curated map of the session's noteworthy entities: goals, turns, tool clusters, files, incidents. 8–20 nodes MAX — curation is the point. | `nodes: [{id, title, subtitle, kind: goal\|turn\|tool\|file\|incident\|artifact, x, y, note, urgent?}]`, `edges: [{from, to, label, strong?}]`, `focusNodeId` |
| 2 | `activity_narrative` | prototype view 02 (the Folding Timeline, 4D) | Interesting moments ONLY, as beats folding out of a central spine, colored threads tracing storylines (e.g. `pg18-recovery`, `token-rotation`). | `beats: [{at, title, body, side: top\|bottom, thread}]`, `threads: [{id, label, color?}]` |
| 3 | `walkthrough` | prototype view 03 | Deep-dive on ONE turn/task that deserves it: central narrative card, satellite tool-call/commit cards, touched-file tiles, plan-vs-outcome tags. | `headline`, `body`, `tags: [{label, kind: match\|addition\|risk}]`, `satellites: [{id, label, note, x, y}]`, `files: [{label, x, y}]` |
| 4 | `concern_snapshot` | prototype view 04 | The observed work abstracted into 5–8 *concerns* (not directories) with human-language roles, heat levels, and flows between them. | `concerns: [{id, title, role, x, y, w, h, heat: low\|medium\|high\|very-high}]`, `flows: [[id, id]]` |
| 5 | `momentum` | prototype view 05 | Gauge (0–100) + label, stat tiles, inferred what's-next items with evidence + confidence, and the curator's own refresh/retire recommendations. | `value`, `label`, `stats: [{label, value, tone}]`, `next: [{title, evidence, confidence}]`, `curation: [{artifactId, action: refresh\|retire, reason}]` |
| 6 | `seismograph` | creative alt 4A | The session as a seismic trace: events deflect the line, failures/aborts/merges spike, quiet stretches read flat. The narrative labels named tremors. | `trace: [{at, magnitude, kind, label?}]`, `annotations: [{at, text}]`, `windowMinutes` |
| 7 | `thermal_map` | creative alt 5A | File/subsystem churn as a thermal treemap — cool blue stable → hot red volatile — weighted by the model's own attention map, not just touch counts. | `cells: [{path, weight, heat: 0..1, label?}]`, `hottest: {path, why}` |

The existing Canvas2D force graph stays, reframed as exhibit type `live_graph` in the
rotation — it is a good exhibit; it was just never supposed to be the whole museum.

## The artifact envelope

Every exhibit the model authors is wrapped in the envelope from the original spec's
`ExhibitEntry` (A15), trimmed to what v1 renders:

```ts
interface ExhibitArtifact {
  id: string;                    // model-assigned, stable across refreshes
  exhibitType: ExhibitType;
  title: string;
  narrative: string;             // MANDATORY. What it means and why it's on the floor —
                                 // not what happened. Raw data is noise.
  relevance: number;             // 0..1, drives rotation order
  decayClass: 'fast' | 'medium' | 'slow';
  createdAtEvent: number;        // event index when authored
  refreshedAtEvent?: number;
  status: 'fresh' | 'active' | 'stale' | 'retired';
  payload: /* typed per exhibitType, discriminated union */;
}
```

## The curator prompt (v2)

`SHADOW_SYSTEM_PROMPT` is rewritten from "terse dashboard classifier" to **exhibit
curator**. Core changes:

- **Identity:** Shadow is the curator of a live exhibition about the observed agent's
  work. Read-only posture unchanged.
- **Input:** large packets (target 60–100k tokens): full recent detail + compressed
  digest of everything older + **the current gallery state** (every artifact's envelope +
  payload summary) + the curator's own prior narratives. The gallery IS the memory —
  feeding it back is what lets beats accumulate instead of restarting.
- **Output:** `{ galleryOps: [{op: 'create'|'refresh'|'retire', artifact}] }`. The model
  curates: create an exhibit when a moment deserves one, refresh one that's aging but
  still true, retire what stopped mattering (with a reason — retirement reasons render).
- **Craft constraints carried over from the idea bank:** curation over completeness
  (8–20 DAG nodes max; beats are "interesting moments only"); concerns not directories;
  narrative answers *why this is on the floor now*; honest confidence.
- The old flat fields (phase, riskLevel, prediction) survive as a small `pulse` object on
  every response — they still drive the status strip, risk vignette, and ghost trail.

Cadence: fewer, bigger calls — fire on turn boundaries (`agent_completed`), tool
failures, and a coarse time floor; not on every 10-event dribble. (Trigger tuning rides
on the existing trigger's immediate path; full packager overhaul is the companion
plan and can land after this.)

## The stage

New `ExhibitStage` surface registered in `renderer-surface-adapter.tsx` and made the
primary main-area surface in `App.tsx`:

- Left rail: gallery list (title, type icon, status, relevance), narrative preview.
- Main frame: the active exhibit inside the shared `Frame` treatment; idle cycling
  advances by relevance-weighted order every ~8s, pauses on hover/interaction —
  "curatorial motion, not a playlist."
- Commentary panel: the artifact's narrative + envelope metadata (relevance, cycles
  shown, status) — the agent-commentary card from the prototype.
- Retired artifacts collapse into an archive shelf (retirement reason on hover).
- `live_graph` (the current canvas) is always available in the rotation.

Tech: **framer-motion** added as a dependency (the prototype's animation idiom; porting
its `pathLength` draw-on and `AnimatePresence` swaps to react-spring would be a rewrite
for zero gain). Prototype primitives (`Frame`, `accentByKind`, `ExhibitNode`,
`curvedPath`, `arcPath`, chip styles) are ported to typed components under
`src/renderer/exhibits/`. Respect `prefers-reduced-motion`.

## Validation

Replay `tests/fixtures/transcripts/codex/rollout-2026-07-23-homelab-coordinator.jsonl`
through the full pipeline with a live model and capture the gallery timeline: which
exhibits the curator authored, when, with what narratives. The 4.5-hour database-recovery
session should yield an `activity_narrative` whose threads match the human ground truth
(plan pivot, PG18 recovery, token exposure, the not-done ending), a `seismograph` with
the GHCR-403 stall visible, and a final `momentum` exhibit that does NOT read "done."
That gallery dump — plus screen recordings of the stage cycling — is the acceptance
artifact.

## PR series

1. **PR-A `feat: exhibit floor design`** — this doc.
2. **PR-B `feat: exhibit component library + stage`** — `src/renderer/exhibits/`
   (types + envelope + 7 components + stage + rail/commentary), surface registration,
   fixture gallery so the stage renders standalone with zero inference. Storybook-style
   demo route not required; the fixture gallery in the app is the demo.
3. **PR-C `feat: curator prompt + gallery pipeline`** — prompt v2, response
   parser → `ExhibitArtifact` union, gallery state store (session-manager), gallery
   feedback into the context packet, wiring stage to live/replay data.
4. **PR-D `replay: homelab corpus gallery run`** — live replay, gallery dump,
   findings in `docs/history/log.md`.

## Non-goals (v1)

- The full cosmology (stars/planets/moons, WebGL) — stays in the idea bank; the Frame
  language and exhibit envelope are the bridge to it later.
- GitHub-fetching exhibits (PR velocity, dependency drift) — this app observes agent
  sessions; those contracts stay archived until a repo-observation mode exists.
- Packager 100k-token overhaul + Luna/Aperture routing — companion plan; PR-C keeps the
  current packager but injects gallery state, which is the piece the stage needs.
