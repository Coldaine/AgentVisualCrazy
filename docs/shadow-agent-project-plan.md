# Shadow Agent Project Plan

## Purpose

Build a new project that combines the strongest patterns from `sidecar` and `agent-flow`:

- `sidecar`: a separate runtime, independent model execution, context handoff, second-window behavior
- `agent-flow`: live event ingestion, session watching, hook-based observation, graph-oriented visualization

The resulting system is **not** a second chat client.

It is a **shadow agent system**:

- the main agent keeps doing the real work
- a hidden secondary agent observes the main session
- the shadow agent interprets, synthesizes, and enriches what is happening
- the UI renders that interpretation as a rich visual surface

## Core Product Definition

The shadow project should do four jobs:

1. Observe the main agent session in real time.
2. Normalize the observed activity into a common event model.
3. Run a shadow intelligence layer that derives higher-level structure from those events.
4. Render a live visual interface driven by the shadow layer, not just raw logs.

This is the key distinction:

- `agent-flow` shows what happened
- `sidecar` runs another model in parallel
- the new project should show what the shadow agent thinks is happening

## What We Are Actually Building

The first useful version should be:

- one new project called `shadow-agent`
- one live UI surface
- one event adapter for the main agent
- one shadow runtime that consumes the same event stream
- one derived-state layer that emits structured visual insights

That means the UI should show more than:

- nodes
- tool calls
- timing

It should also show:

- inferred objective
- current phase
- likely next steps
- ambiguity or drift
- alternate strategy candidates
- confidence or uncertainty
- subproblem clustering

## Direct Mapping From The Two Existing Repos

### Patterns to reuse from `sidecar`

- separate runtime process
- explicit context packaging
- hidden secondary model execution
- session persistence
- Electron window pattern if a standalone desktop surface is desired
- MCP inheritance and model-routing ideas

### Patterns to reuse from `agent-flow`

- hook-based ingestion
- session watcher architecture
- normalized event stream
- replayable simulation model
- graph-oriented renderer
- transcript and timeline panels

### Patterns to avoid copying directly

- do not make the primary UX another chat box
- do not make the output only a final fold summary
- do not limit the interface to literal hook playback

## Proposed Repo Layout

The clean target layout is:

```text
AgentVisualCrazy/
  docs/
  third_party/
    sidecar/
    agent-flow/
  shadow-agent/
    package.json
    README.md
    docs/
    src/
      adapters/
      runtime/
      schema/
      derive/
      ui/
      persistence/
    tests/
```

### Notes on layout

- `third_party/sidecar/` and `third_party/agent-flow/` are references, not development targets
- `shadow-agent/` is the actual product code
- the new project should copy ideas selectively, not merge codebases wholesale

## Why We Should Not Literally Merge The Two Repos

A direct merge would create avoidable coupling:

- `sidecar` is centered on OpenCode runtime management and fold workflows
- `agent-flow` is centered on VS Code extension behavior and visualization
- their product assumptions are different

The right move is:

- define a fresh internal event schema
- build adapters into that schema
- borrow code patterns where they fit

This keeps the new project from inheriting unnecessary product constraints from either source.

## Architecture

## 1. Event Ingestion Layer

This layer observes the main agent.

Responsibilities:

- watch hooks
- watch transcript files
- optionally ingest JSONL replays
- assign session IDs
- normalize tool events, message events, agent lifecycle events, and permission events

Suggested first adapters:

- Claude Code transcript watcher
- Claude Code hook adapter
- replay-file adapter for local development

Output:

- a canonical event stream

## 2. Canonical Event Schema

The new project should define its own schema instead of depending on either upstream shape.

Minimum event types:

- `session_started`
- `session_ended`
- `agent_spawned`
- `agent_completed`
- `agent_idle`
- `message`
- `tool_started`
- `tool_completed`
- `tool_failed`
- `subagent_dispatched`
- `subagent_returned`
- `permission_requested`
- `context_snapshot`
- `shadow_insight`

Each event should carry:

- `sessionId`
- `source`
- `timestamp`
- `actor`
- `kind`
- `payload`

## 3. Shadow Runtime

This is the actual differentiator.

It should subscribe to the canonical event stream and maintain a live interpretation state.

Responsibilities:

- infer what phase the main agent is in
- summarize current intent
- detect loops, stalls, thrash, and drift
- identify important files and clusters of activity
- generate alternate next-step hypotheses
- track uncertainty and confidence

Important constraint:

- shadow runtime starts read-only
- it does not edit files
- it does not issue tools on behalf of the main agent in v1

This keeps the first version safe and understandable.

## 4. Derived State Layer

Do not ask the UI to derive complex meaning directly from raw events.

Instead, maintain an internal derived model such as:

- `currentObjective`
- `activePhase`
- `activeAgents`
- `toolHeatmap`
- `riskSignals`
- `candidateNextMoves`
- `attentionGraph`
- `narrativeSummary`

This layer can be partly rule-based at first and later upgraded with model-based interpretation.

## 5. UI Layer

The UI should render both:

- raw activity
- shadow interpretation

Recommended surfaces:

- graph canvas
- timeline
- transcript
- active file heatmap
- “shadow summary” side panel
- “possible next moves” panel
- “risk / uncertainty” panel

The visual surface should answer:

- what is happening now
- why it is happening
- what matters most
- what is likely next

## UI Direction

The interface should not look like a generic dev dashboard.

It should feel like an active observability and interpretation system.

Good characteristics:

- large central graph or flow field
- strong session-state indicators
- focused side panels for interpretation
- clear visual separation between factual events and inferred insights

Bad characteristics:

- chat-first layout
- wall of logs
- decorative graph with no interpretation

## Development Strategy

## Phase 0: Workspace Organization

Goal:

- establish a clean structure for reference repos and the new product

Tasks:

- move `sidecar` into `third_party/sidecar`
- keep `agent-flow` in `third_party/agent-flow`
- create `shadow-agent/`

Deliverable:

- workspace structured around the new project rather than one borrowed repo

## Phase 1: Schema + Replay MVP

Goal:

- prove the visual model before touching live integrations

Tasks:

- define canonical event schema
- create replay loader
- convert one or two fixture sessions into canonical events
- build a minimal UI that renders:
  - graph
  - timeline
  - transcript
  - shadow insight panel

Deliverable:

- local replay demo with zero live dependencies

Why this first:

- fastest path to useful iteration
- easy to test
- avoids hook complexity early

## Phase 2: Claude Code Live Adapter

Goal:

- ingest a real live session

Tasks:

- port session-watcher concepts from `agent-flow`
- port hook-configuration concepts from `agent-flow`
- emit canonical events
- support live streaming into the UI

Deliverable:

- live visualization of one real session

## Phase 3: Shadow Interpretation Engine

Goal:

- make the UI intelligent instead of descriptive only

Tasks:

- implement rule-based phase inference
- implement loop/thrash detection
- implement file-attention ranking
- implement “probable next steps”
- add confidence and uncertainty markers

Deliverable:

- visual layer that explains the session, not just replays it

## Phase 4: Parallel Model-Assisted Shadowing

Goal:

- add real secondary model reasoning

Tasks:

- reuse `sidecar` context packaging ideas
- feed structured session state to a background model
- let it emit bounded `shadow_insight` events
- keep it sandboxed and read-only in v1

Deliverable:

- hybrid system: hooks + deterministic state + model-assisted interpretation

## Phase 5: Optional Intervention Features

Goal:

- decide whether the shadow layer should influence the main run

Possible features:

- suggested next actions
- suggested retries
- drift warnings
- alternative plan proposals

Important rule:

- these are suggestions first, not automatic interventions

## Answering The Likely Questions Up Front

## Is this possible?

Yes.

The pieces already exist across the two repos:

- `agent-flow` proves live observation and visualization
- `sidecar` proves separate runtime and parallel model execution

The missing piece is a new product boundary and a derived-state layer.

## Is combining the code useful?

Yes, but combining the **patterns** is more useful than combining the repos directly.

Useful:

- porting watcher and hook ideas
- porting parallel-runtime and context-handoff ideas
- borrowing renderer concepts

Not useful:

- forcing one repo to absorb the other’s product assumptions

## Should the shadow agent be visible as chat?

Not initially.

A text panel may exist for explanation, but the primary UX should be visual interpretation.

## Should the shadow agent write files?

No in v1.

Read-only shadowing is simpler, safer, and easier to trust.

## Should the system depend on MCP immediately?

No.

MCP can become a source of context later, but the first version should work with:

- hooks
- transcript files
- replay fixtures

## Electron or VS Code webview?

Recommended approach:

- first ship as a standalone web app or local desktop shell for speed
- keep the UI layer portable enough to embed in VS Code later

If immediate proximity to Claude Code is more important than portability, use a VS Code webview first.

If product identity matters more, use standalone first.

## Should the shadow agent use the same model every time?

No hard requirement.

The shadow runtime should accept:

- deterministic rules only
- optional model assistance
- configurable model routing later

## How do we know if it is working?

Success criteria for the MVP:

- a replay session can be loaded and understood visually
- the UI identifies the active phase accurately
- the UI surfaces useful next-step hypotheses
- the UI highlights the same critical files a human reviewer would
- the system is helpful without requiring another chat exchange

## Risks

## Product risk

The biggest failure mode is building a pretty replay tool that adds no real insight.

Mitigation:

- measure usefulness around interpretation, not rendering

## Technical risk

Live hook streams may be noisy, partial, or tool-specific.

Mitigation:

- canonical schema
- replay fixtures
- rule-based fallback logic

## UX risk

Too much inferred information can feel fake or distracting.

Mitigation:

- visually separate observations from inferences
- include confidence markers
- keep inference bounded and falsifiable

## Recommended Immediate Next Steps

1. Re-root the workspace so both upstream repos live under `third_party/`.
2. Create `shadow-agent/` as a new project.
3. Define the canonical event schema.
4. Build a replay-only prototype before live hooks.
5. Add the first shadow-insight panel before adding model assistance.

## Concrete First Build Slice

If starting now, the first implementation slice should be:

1. `shadow-agent/src/schema/events.ts`
2. `shadow-agent/src/adapters/replay-loader.ts`
3. `shadow-agent/src/derive/basic-insights.ts`
4. `shadow-agent/src/ui/` with:
   - graph view
   - timeline
   - transcript panel
   - shadow summary panel
5. one fixture replay converted from `agent-flow` mock data or a captured session

That slice would be enough to validate whether the concept has real product value.
