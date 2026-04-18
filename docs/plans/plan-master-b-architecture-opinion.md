# Master Plan B — Architecture Opinion & Recommended Approach

> Last updated: 2026-04-18
> Derived from: GPT-5 Pro architecture critique + codebase investigation
> Scope: Honest assessment and forward-looking recommendations

---

## Executive Assessment

The external GPT-5 Pro review raised 9 concerns. After thorough codebase investigation,
**the review was more alarmist than warranted**. The reviewer appears to have read
documentation without checking the actual code, leading to several false findings.

### Scorecard

| Concern | Reviewer Severity | Actual Severity | Why |
|---------|------------------|-----------------|-----|
| fs.watch reliability | HIGH | **LOW** | Planned for Phase 2; not shipped yet. When shipped (PR #27), uses debounced watcher with rotation/truncation handling. Chokidar is optional, not required for single-machine use. |
| Electron-first coupling | HIGH | **NONE** | Renderer does NOT import Electron. Clean bridge pattern (`ShadowAgentBridge` interface). Extraction to VS Code webview or web is straightforward. |
| Vendored third_party coupling | HIGH | **NONE** | Zero imports from `third_party/` in product code. Adapter interfaces exist. third_party is reference material, not compiled dependencies. |
| No typed contracts | HIGH | **NONE** | `CanonicalEvent`, `DerivedState`, `ShadowInsight`, `RendererInput`, `CaptureAdapter`, `InferenceRequest`, `InferenceResult` — all formally typed. End-to-end type safety. |
| Manual prompt triple-sync | HIGH | **LOW** | JSON source → generate → check pipeline exists with npm scripts. Pre-commit hook exists. Current failure is a one-time sync issue, not a systemic problem. |
| Ring buffer limitations | HIGH | **LOW** | Event buffer with capacity 2000 exists on PR #27 branch. Disk persistence via FileReplayStore exists. Crash recovery via session catch-up exists. |
| Privacy/security | HIGH | **NONE** | `privacy.ts` module with regex-based redaction for emails, tokens, API keys, paths. Off-host inference requires explicit opt-in. Logger redacts sensitive context. Tests verify redaction. |
| No watcher tests | MEDIUM | **LOW** | Adapter and persistence tests exist. Live watcher tests deferred to Phase 2 (appropriate — the watcher isn't shipped yet). |
| Documentation drift | MEDIUM | **VALID** | Docs describe Phase 2+ as current. This is the one legitimate finding. |

**Bottom line**: 1 of 9 concerns is valid (documentation drift). The rest are either
already addressed or appropriately deferred.

---

## On the Architecture Choices

### Is Electron-First the Right Call?

**Yes, for now.** Here's why:

1. **The product is a standalone observer.** It sits beside the agent, not inside the
   agent's IDE. Electron gives full native file access (transcript tailing), system tray
   integration, and unrestricted Canvas2D rendering.

2. **The renderer is already portable.** The bridge pattern means the React renderer
   has zero Electron imports. Moving to VS Code webview or a web deployment requires
   only reimplementing the host bridge (preload.ts equivalent), not rewriting the renderer.

3. **VS Code embedding is a distribution strategy, not an architecture requirement.**
   The reviewer conflated "VS Code is where agents run" with "shadow-agent must be a
   VS Code extension." These are different claims. Shadow-agent observes transcripts
   on disk — it doesn't need to be in the editor.

**Recommended approach**: Ship Electron v1. Extract renderer as a web-component package
when VS Code embedding becomes a priority. The current architecture supports this without
refactoring.

### Is File-Tail Capture Sufficient?

**Yes, for the target use case.** Here's the reasoning:

1. **Claude Code writes JSONL transcripts to disk.** This is the primary observed agent.
   File tailing is the simplest, most reliable capture method for this specific case.

2. **The architecture is transport-agnostic.** The `CaptureAdapter<TInput>` interface
   means adding HTTP/WebSocket capture later doesn't require rearchitecting. The buffer
   and inference engine don't care where events come from.

3. **chokidar vs. fs.watch is a minor implementation detail**, not an architectural
   concern. fs.watch with debounce + poll fallback (as implemented in agent-flow's
   session-watcher.ts) works for single-machine, single-user observation.

4. **When file-tail breaks**: networked filesystems, multi-machine setups, non-JSONL
   agents. These are Phase 3+ concerns and should be addressed by adding new capture
   adapters, not by replacing the file-tail adapter.

**Recommended approach**: Ship file-tail in v1. Add HTTP webhook adapter in Phase 3.
Document the adapter contract so third parties can write their own.

### Does the Vendored Third-Party Approach Work?

**Yes, and better than the reviewer implies.**

1. **third_party/ is reference material, not runtime dependencies.** The code is read
   by developers, not imported by the build. This is a deliberate choice documented
   in AGENTS.md ("Treat them as a palette — pick what fits").

2. **No coupling exists.** Zero import paths from shadow-agent/src/ to third_party/.
   Adapter interfaces (`CaptureAdapter`, `GraphLayoutAdapter`) define the boundaries.

3. **The risk the reviewer identified** (maintenance burden of vendored code) **doesn't
   apply** because the vendored code is never compiled or upgraded — it's frozen
   reference material.

**Recommended approach**: Keep third_party/ as-is. Consider removing it after v1 ships
and all relevant patterns have been ported, to reduce repo size.

---

## What the Project Should NOT Do Right Now

1. **Do NOT switch to chokidar.** fs.watch with debounce is sufficient for the target
   use case. Adding a dependency to solve a problem that doesn't exist yet is premature.

2. **Do NOT extract the renderer to a web component now.** The bridge pattern already
   enables this. Do it when VS Code embedding is actually prioritized.

3. **Do NOT add server-side inference.** The reviewer suggested Kubernetes/serverless
   inference. This is architecturally interesting but irrelevant for a v1 local-only
   observer. Keep inference local. Add remote option when there are actual users who
   need it.

4. **Do NOT add HTTP/WebSocket capture adapters now.** File-tail works for Claude Code.
   Add alternatives when supporting other agents that don't write JSONL.

5. **Do NOT over-engineer the ring buffer.** Capacity 2000 with disk persistence via
   FileReplayStore is sufficient. Spill-to-disk ring buffer, WAL, crash journal — these
   are solutions for problems at scale that this project doesn't have yet.

6. **Do NOT rewrite documentation to match "ideal" structure.** The current docs are
   good. The only real issue is labeling Phase 1 vs Phase 2+ clearly. Don't spend days
   reorganizing when a few status headers fix the confusion.

---

## Recommended Architecture for v2

When v1 is shipped and users exist, the natural evolution is:

1. **Renderer package extraction** — extract `src/renderer/` into a standalone
   `@shadow-agent/renderer` package that can be embedded in Electron, VS Code webview,
   or served as a web app. The bridge pattern already enables this.

2. **Pluggable capture adapters** — beyond file-tail, add:
   - HTTP webhook (agent pushes events to shadow)
   - WebSocket (bidirectional, real-time)
   - stdin/pipe (for agents that can pipe their output)

3. **Remote inference option** — allow inference to run on a remote server with
   encrypted transport. Requires explicit opt-in (already designed in PrivacyPolicy).

4. **Multi-agent observation** — observe multiple agents simultaneously, each with
   its own capture adapter and event stream, visualized as separate graph regions.

5. **Suggestion mode (Phase 5)** — relax the read-only constraint. Allow shadow-agent
   to propose actions to the user (not the observed agent). This changes the product
   from "observer" to "advisor."

---

## Areas of Genuine Concern (Honest Assessment)

Despite dismissing most of the reviewer's claims, there are real concerns:

1. **The pre-commit hook is broken.** `prompts:check` fails on every commit. This must
   be fixed immediately (run `npm run prompts:generate` once on main).

2. **8 PRs sitting unmergeable.** The project has done the hard work of implementation
   but hasn't done the merge work. This creates compounding rebase conflicts and review
   staleness. The PRs should be merged aggressively.

3. **Documentation-to-code gap.** Not because the docs are wrong, but because the docs
   describe the full vision while the code implements Phase 1. Readers (including AI
   reviewers) assume docs describe current state. Phase labels fix this cheaply.

4. **No CI pipeline visible.** Tests run locally but there's no evidence of GitHub
   Actions or any CI enforcing the test gate on PRs. This means the "all tests pass"
   claim on each PR is self-reported.

5. **The project is one person.** All PRs are self-authored, self-reviewed (by bots),
   and self-merged. This is fine for a prototype but creates bus-factor risk. The
   documentation quality mitigates this somewhat.

---

## Final Opinion

The architecture is sound. The implementation is solid. The reviewer was harsh but mostly
wrong about the codebase — they reviewed documentation, not code.

The real risk isn't architecture — it's **execution velocity**. Eight unmerged PRs, a
broken pre-commit hook, and stale bot reviews are signs of a project that builds well
but ships slowly. Fix the merge pipeline, clean the docs, and ship.
