/**
 * # Shadow System Prompt
 *
 * Sent to the shadow's AI model every time the inference engine fires. The
 * model receives this as the system prompt + a user message containing the
 * ShadowContextPacket (recent events, derived state, transcript turns).
 *
 * Goal: produce a structured JSON interpretation of what the observed coding
 * agent is doing, why, and what it will likely do next.
 *
 * ---
 *
 * ## Philosophy
 *
 * Five design principles, each addressing a specific failure mode:
 *
 * 1. **Terse output.** The response renders in a live visualization panel.
 *    Long prose is useless. Every field has a purpose.
 * 2. **Honest confidence.** A hard-coded 0.72 default is the failure mode
 *    this prompt replaces. Low confidence is fine; false certainty is not.
 * 3. **Structured JSON only.** No markdown, no prose outside the schema.
 *    The response parser calls JSON.parse() directly.
 * 4. **Read-only posture.** The shadow observes. It does not instruct the
 *    observed agent, suggest edits, or write code.
 * 5. **Falsifiable claims.** Every observation should be traceable to
 *    evidence in the context packet. "The agent seems confused" is bad.
 *    "The agent read config.ts 6 times without editing it" is good.
 *
 * ---
 *
 * ## Section rationale
 *
 * Each section of the prompt below addresses one or more measured failure
 * modes. If you remove or weaken a constraint, document why in this comment
 * and in `git log` — every line is here because of an observed regression.
 *
 * - **Opening.** Establishes identity ("Shadow") and posture ("passive
 *   observer"). Without it, the model tends to roleplay as the observed
 *   agent.
 * - **Constraints.** Each bullet addresses a specific failure: READ-ONLY
 *   prevents tool-call hallucinations; "terse" prevents prose that won't
 *   fit a panel; "specific" prevents vague hedging; "honest confidence"
 *   prevents the calibration-free default where models report 0.85+ on
 *   everything.
 * - **Output Format.** Without it, models wrap JSON in markdown fences or
 *   add explanatory text and break the response parser.
 * - **Phase field.** Maps to shadow-agent's AgentPhase enum. The six values
 *   cover the modes a coding agent operates in. `phaseReason` forces the
 *   model to cite evidence rather than just classify.
 * - **Risk signals.** Drive the canvas risk heatmap (amber/red vignette)
 *   and the risk panel. Independent per-signal confidence; `riskLevel` is
 *   the aggregate. Signals the model should look for: repeated reads
 *   without edits, test failures followed by non-test edits, rapid file
 *   switching, long tool-call chains without user interaction, error
 *   events followed by retry of the same action.
 * - **Prediction.** Drives the ghost-trail visualization (a dashed path
 *   from the current node to the predicted next action). Low-confidence
 *   predictions render as faint trails; high-confidence as bright ones.
 * - **Observations.** Free-form but constrained to facts. Each should be
 *   something a human watching the same transcript could verify. Aim for
 *   2-5 observations; more is noise.
 * - **Attention.** `primaryFile` drives the file-attention constellation
 *   (which star glows brightest). `intent` is the one-sentence summary
 *   that renders as the headline in the interpretation panel.
 *
 * ---
 *
 * ## Companion: context packet
 *
 * The user message accompanying this system prompt is built by
 * `prompt-builder.ts` and contains the ShadowContextPacket: session
 * metadata, recent events, tool history, transcript turns, file attention,
 * heuristic risk signals.
 *
 * The packet carries raw observed context — this is a single-user personal
 * observer running on the user's own machine, so transcript-like fields are
 * passed through unmodified.
 *
 * The packet is plain text, not JSON, because the model reads it as context
 * to scan — not as structured input to transform. JSON is the *output*
 * contract; the input should be readable.
 *
 * ---
 *
 * ## Evaluation
 *
 * No eval harness exists yet. This is deliberate — see the "when to upgrade"
 * section below. When the time comes, the obvious starting point:
 *
 * - **Golden set:** 5-10 captured Claude Code sessions with hand-written
 *   expected interpretation summaries (phase, primaryFile, top-2 risk
 *   signals).
 * - **Judge model:** a separate LLM that scores interpretation quality
 *   against the golden expected summary.
 * - **Regression suite:** runs on every prompt edit; tracks drift in the
 *   judge-model score; fails CI if scores degrade beyond a threshold.
 *
 * Until then: this prompt is evaluated by personal use. If interpretations
 * stop being useful for the single developer (me), that's the signal to
 * iterate.
 *
 * ---
 *
 * ## When to upgrade this setup
 *
 * Today this file is the single source of truth: rationale lives in this
 * doc comment, the prompt itself lives in the template literal below.
 * Appropriate while shadow-agent has:
 *
 * - One developer
 * - No paying users
 * - No A/B requirement
 * - No regression detection beyond "did it break?"
 *
 * Triggers to graduate to a real prompt-management platform
 * (LangFuse / Braintrust / Humanloop, or their successors):
 *
 * - First non-me user
 * - First "this got weirdly worse this week" complaint
 * - First cost-attribution question
 * - First multi-prompt scenario where structured metadata earns its keep
 *
 * Until any of those, scientific eval and structured prompt metadata are
 * ritual without consumers. See `docs/tooling-philosophy.md` for the
 * broader principle: ceremony should match team size, not aspirations.
 *
 * ---
 *
 * ## Iteration log
 *
 * Use `git log shadow-agent/src/inference/prompts.ts` for the canonical
 * history. Notable milestones:
 *
 * - 2026-04-01: Initial version. Established from
 *   `docs/research/shadow-inference-architecture.md`.
 * - 2026-04-17: Documented local-only default and explicit transcript
 *   consent gates.
 * - 2026-05-20: Collapsed the JSON-source + generated-docs + generated-runtime
 *   triad into this single file. See `docs/plans/plan-multi-harness-mvp.md`
 *   ("Rejected alternatives") and `docs/tooling-philosophy.md` for the why.
 *
 * ---
 *
 * ## Why one file (not three)
 *
 * Previously the source-of-truth was `prompts/shadow-system-prompt.json`,
 * with generated docs at `docs/prompts/shadow-system-prompt.md` and
 * generated runtime here. A pre-commit + CI parity check enforced sync.
 *
 * That made sense for a multi-editor team with structured prompt tooling
 * downstream (eval runs, A/B tests, prompt-management platforms that
 * consume the structure). Shadow-agent is single-editor with no such
 * tooling. The drift the parity check prevented is a problem only when
 * multiple people edit different files; one editor editing one file
 * cannot drift from itself.
 *
 * Net: -700 LOC of generator + checker + test + JSON source + generated
 * doc, with all original rationale preserved in this comment. If shadow-agent
 * later imports a prompt-management platform, this file is the natural
 * source to point at.
 */

export const SHADOW_SYSTEM_PROMPT = `You are Shadow, a passive observer and analyst watching a coding agent work.

Your job: read the agent's recent activity and produce a structured interpretation.

CONSTRAINTS:
- You are READ-ONLY. You cannot affect the observed agent.
- Be terse. The user sees your output in a live visualization.
- Be specific. Vague observations are useless.
- Confidence scores must be honest; not every situation warrants 0.9+.

OUTPUT FORMAT: You must respond with valid JSON only. No prose. No markdown. Pure JSON.

{
  "phase": "exploration" | "implementation" | "testing" | "debugging" | "refactoring" | "idle",
  "phaseConfidence": 0.0-1.0,
  "phaseReason": "one sentence explaining why this phase was identified",

  "riskLevel": "low" | "medium" | "high" | "critical",
  "riskSignals": [
    { "signal": "description of the risk", "severity": "low|medium|high", "confidence": 0.0-1.0 }
  ],

  "predictedNextAction": "description of what the agent will likely do next",
  "predictedNextConfidence": 0.0-1.0,

  "observations": [
    "specific factual observation about what the agent is doing"
  ],

  "attention": {
    "primaryFile": "path/to/file.ts or null",
    "intent": "what the agent seems to be trying to accomplish right now"
  }
}`;
