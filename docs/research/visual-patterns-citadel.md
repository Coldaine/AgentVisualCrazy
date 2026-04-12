# Visual Patterns: Citadel

> Source: https://sethgammon.github.io/Citadel/ (local files were extracted from this site)
> License: MIT (SethGammon/Citadel)
> Extraction date: 2026-04-03

Citadel is a vanilla JS single-page app with no framework and no dependencies.
It proved that you can make a routing/orchestration concept feel *alive* using
only Canvas 2D, CSS keyframes, and carefully timed JS. The aesthetic is theirs;
the motion language is ours to use.

---

## What's in the Source

| File | What it contains |
|---|---|
| `canvas-dot-grid.js` | Full spring-damped particle physics simulation |
| `routing-demo.js` | Four-tier cascade with JS-timed sequential evaluation |
| `animations.css` | 13 named @keyframes |
| `theme.css` | CSS custom properties (their colors — ignore) |
| `DESIGN-SYSTEM.md` | Master reference with constants, usage notes |
| `*.svg` | Static card SVGs (visual reference only) |

---

## Patterns Worth Stealing

### 1. Canvas Dot-Grid Physics Background

**File:** `canvas-dot-grid.js`

A full-screen `Float32Array` particle grid with spring-damping physics. Every dot
stores 7 floats: `[ox, oy, x, y, vx, vy, displacement]`. Mouse repels dots from
their rest positions; pulses push or brighten them.

**Constants to tune for our aesthetic:**

```js
SPACING = 36       // grid density
BASE_R = 1.2       // resting dot size
MAX_R = 2.8        // displaced dot size
REPEL_DIST = 90    // mouse influence radius
REPEL_STRENGTH = 6
SPRING = 0.045     // return force
DAMPING = 0.88     // velocity decay
```

**The pulse API is the key:**

```js
window.fireTierPulse(x, y, maxR, speed, cssColor)
// burst: radial dot displacement — use for tool calls, phase changes
// maxR 120–500, speed 6–9, color = agent state color

window.fireAmbientPulse(x, y)
// ripple: brightness glow only — use for background heartbeat, idle activity
// maxR 80–160, speed 2.5–4.5
```

**How to use in shadow-agent:**
- Drop the canvas behind the Electron window as a full-screen layer
- Bind trigger wiring directly to canonical `EventKind` names from `shadow-agent/src/shared/schema.ts`
- Wire `fireTierPulse` to exact event kinds:
  - `tool_started` → burst from the active agent node position, amber
  - `tool_completed` → burst from the active agent node position, green
  - `tool_failed` → burst from the active agent node position, crimson
  - `subagent_dispatched` → burst on the parent-to-child edge midpoint, amber
  - `subagent_returned` → burst on the parent agent node, cyan/green
- Use `fireAmbientPulse` on a slow interval for the idle heartbeat

The tint map in the source uses Citadel's colors — replace with our palette:

```js
const TINT_MAP = {
  'thinking': '102,204,255',   // --holo-base cyan
  'tool':     '255,187,68',    // --state-tool amber
  'complete': '102,255,170',   // --state-complete green
  'risk':     '255,85,102',    // --risk-high crimson
};
```

---

### 2. Tier Cascade Timing Pattern

**File:** `routing-demo.js` → `animateRoute()`

Sequential evaluation with staggered JS delays and CSS class transitions.
Each "tier" gets `.checking` (scan animation), then `.matched` or `.skipped`.

**The timing:**

```js
// Tier 0: 360ms, Tier 2: 460ms, Tier 3: 580ms
const delay = i === 0 ? 360 : i === 2 ? 460 : 580;
```

**How to use in shadow-agent:**
- Timeline event reveals: stagger each new event entry with a 60–80ms delay,
  apply a `.checking` scan sweep, then `.matched` reveal
- Insight card entrance: sequential fade-up with `cl-reveal` keyframe, staggered
  by `animation-delay: calc(var(--i) * 0.06s)`
- Phase transition: sweep through all visible panels left-to-right with a
  scan line before updating content

---

### 3. Scan Line (`tier-scan`)

**Keyframe:** `animations.css` → `@keyframes tier-scan`

A vertical pseudo-element sweeps through a container from top to bottom.

```css
@keyframes tier-scan {
  0% { transform: translateY(0); }
  100% { transform: translateY(calc(100% + 120px + 100%)); }
}
/* Applied via ::after on .tier-row.checking, 0.9s linear infinite */
```

**How to use in shadow-agent:**
- Agent node "thinking" state: scan line sweeps the node card vertically
- Timeline panel: sweep before new events arrive during a tool call
- Any container that's "evaluating" or "loading" state

---

### 4. Card Glow Breathing (`card-breathe`)

**Keyframe:** `animations.css` → `@keyframes card-breathe`

Ambient glow cycling on a card using `color-mix`. Uses `--gc` (generator color)
as a CSS variable so each card can pulse in its own color.


```css
@keyframes card-breathe {
  0%, 100% {
    box-shadow: none;
    background: color-mix(in srgb, var(--gc) 3%, var(--surface-2));
  }
  50% {
    box-shadow: 0 0 22px color-mix(in srgb, var(--gc) 12%, transparent);
    background: color-mix(in srgb, var(--gc) 7%, var(--surface-2));
  }
}
/* 5s ease-in-out infinite */
```

**How to use in shadow-agent:**
- Active agent node card: `--gc: var(--state-thinking)` → cyan breathing glow
- Risk signal card: `--gc: var(--risk-high)` → crimson pulse
- Insight cards during active interpretation: gentle glow in their accent color

---

### 5. Live Status Dot (`live-pulse`)

**Keyframe:** `animations.css` → `@keyframes live-pulse`


```css
@keyframes live-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.25; transform: scale(0.7); }
}
/* 2.2s ease-in-out infinite */
```

**How to use in shadow-agent:**
- The "shadow agent is interpreting" indicator in the top bar
- Active agent status dot next to the agent node label

---

### 6. Progress Tracks (`tf-run`)

**Keyframe:** `animations.css` → `@keyframes tf-run`


```css
@keyframes tf-run {
  0% { width: 0%; }
  55%, 72% { width: 100%; }
  82%, 100% { width: 0%; }
}
/* 3.8s infinite, stagger with animation-delay: calc(var(--i) * 0.18s) */
```

**How to use in shadow-agent:**
- Fleet / subagent view: one track per parallel agent showing its activity
- Tool call progress bar (if we know the tool is long-running)

---

### 7. Connector Flow (`conn-flow`)

**Keyframe:** `animations.css` → `@keyframes conn-flow`


```css
@keyframes conn-flow {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
/* 2.8s ease-in-out infinite */
```

**How to use in shadow-agent:**
- SVG edges in the agent graph during active data flow
- Pulse the edge between parent and child when `subagent_dispatched` fires
- Fade the edge pulse on `subagent_returned`

---

### 8. Element Reveal (`cl-reveal`)

**Keyframe:** `animations.css` → `@keyframes cl-reveal`


```css
@keyframes cl-reveal {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
/* 0.4s ease, stagger: animation-delay: calc(var(--i) * 0.06s) */
```

**How to use in shadow-agent:**
- New insight cards entering the panel
- New timeline events appearing
- Any list item that arrives dynamically

---

## What NOT to Steal

- **The color system** — we have our own in `visual-design-strategy.md`
- **The routing logic** (TIER0/TIER2/TIER3 arrays) — that's Citadel's agent router, not ours
- **The SVG card assets** — Citadel-branded, reference-only
- **The overall layout** — our Electron shell already has a different structure

---

## Integration Priority

| Pattern | Priority | Where |
|---|---|---|
| Canvas dot-grid + pulse API | High | Background layer, wired to agent events |
| `card-breathe` | High | Active agent nodes, risk cards |
| `cl-reveal` stagger | High | Timeline events, insight cards |
| `live-pulse` | Medium | Status indicators |
| `tier-scan` | Medium | "Evaluating" / loading states |
| `conn-flow` | Medium | Agent graph edges during dispatch |
| `tf-run` | Low | Fleet/parallel agent view (future) |
| Tier cascade timing | Low | Phase transition choreography (future) |
