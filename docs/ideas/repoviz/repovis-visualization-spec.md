# RepoVis Visualization Specification
## Complete Design Document

---

# PART 1: AMBIENT BACKGROUND VISUALIZATION

## Overview
A living, breathing visualization of your codebase designed for ambient display on a second monitor or background window. Not a dashboard to read, but a digital terrarium to feel.

---

## Core Principles

1. **Peripheral First** — Information conveyed through color, motion, and rhythm
2. **No Alerts** — Only beauty that occasionally rewards attention with insight
3. **Zero Text Default** — Text only appears on interaction
4. **Always 60fps** — Stutter destroys the ambient effect

---

## Layer 1: Ambient (Peripheral Vision)

### Color Field
Your entire screen is a slowly shifting gradient representing "code weather":
- **Deep blue-purple** = calm, few commits
- **Warm amber** = building activity
- **Electric teal pulses** = someone else pushed to main
- **Red-veined** = merge conflicts, broken builds

You don't read this. You *feel* it.

### Particle Drift
Tiny dots float across the screen:
- More particles = more file changes today
- Faster drift = recent activity (last hour)
- Particles cluster near their "home repo" zone

---

## Layer 2: Attract Mode (Catches Your Eye)

### The Flare
Visual events when something significant happens:
- **New PR merged** = lens flare ripples across screen
- **Hot file edited** = thermal bloom glows then fades
- **Many commits** = comet trails streak and dissolve

These aren't alerts to act on. They're *beautiful interruptions* you notice, then decide if you care.

### Rhythm Changes
Animation speed subtly shifts:
- **Steady pulse** = your normal commit cadence
- **Staccato** = you committed 5 times in 10 minutes (debugging furiously?)
- **Long pause** = no commits in hours (deep design mode?)

---

## Layer 3: Focus (When You Actually Look)

### Handheld Magnifying Glass
On mouse over:
- Area under cursor "clears" like wiping fog from glass
- Text labels fade in *only* where you're looking
- Connected elements light up (files touched together glow same hue)

### Time Scrub
Scroll or drag to see the day:
- Morning fog lifts to reveal afternoon activity
- Evening commits leave long shadows
- Feel your productivity rhythm visually

---

## Visual Concepts (Non-Cosmology)

### Living Texture Approach
Screen is a procedural texture (lava lamp / oil slick):
- **Viscosity** = repo size (larger = thicker, slower)
- **Color mixing** = cross-repo commits (color blend where files touch multiple repos)
- **Turbulence** = churn (hot files create swirling eddies)

### Crystal Growth Approach
- Each repo grows crystal structures from center
- New files = new facets
- Edited files = facets pulse with inner light
- Deleted files = facets crumble and fall away
- Shape tells architecture (spiky = many small files, smooth = few large ones)

### Weather System Approach
- Each repo is a weather cell
- Commits = rain intensity
- PRs = storm fronts moving across
- Tests passing = rainbow arcs
- Tests failing = lightning forks

---

## Serendipitous Insights

| Pattern You Notice | Insight |
|-------------------|---------|
| Two repos pulsing same color | "Working on same feature across frontend and backend" |
| Normally calm repo suddenly turbulent | "Something's broken over there" |
| Crystal grown lopsided | "Neglecting tests/docs" |
| Comet trail crosses another's path | "These changes might conflict" |
| Morning fog didn't burn off | "Haven't committed today... why?" |

---

## Compact Widget Mode

For corner display when space is limited:

```
ColdVox    [██████░░░░] 6 active    2 commits ahead
MyProject  [░░░░░░░░░░] clean       up to date
WorkRepo   [████████░░] 12 changed  ⚠️ 3 conflicts
```

- Simple bars, colors, counts
- Click to expand if interested
- Hover for details

---

# PART 2: COSMOLOGY VISUALIZATION

## The Celestial Model

Transform your repos into a living universe where every element encodes data.

---

## 🌞 The Star = Repo

### Color = State (Instant Read, No Text)

| Star Color | Meaning | Actionable |
|------------|---------|------------|
| Steady white-yellow | Healthy, active | No action |
| Pulsing red | Build failing / conflicts | Hover to see which |
| Blue-shifted | Ahead of remote (unpushed) | Push reminder |
| Dimming gray | Stale, no commits in 2 weeks | Archive or revive |
| Flaring white | Someone else just pushed | Pull opportunity |

### Visual Features

- **Corona spikes** = open PRs (count them visually)
- **Rotation speed** = commit velocity (frantic spin vs. stately turn)
- **Pulse rhythm** = commit cadence (regular = healthy, erratic = stressed)

---

## 🪐 The Planets = Branches

Each planet orbiting the star = a branch you're working on:

| Visual Feature | Data Encoded |
|----------------|--------------|
| Orbit radius | Age (farther = older branch) |
| Orbit tilt | How divergent from main |
| Planet size | Lines changed |
| Planet texture | File types (dots=code, swirls=docs, noise=assets) |
| Moons | Related files touched together |
| Ring system | Commit history (each ring = a commit) |

**The Insight**: Planet with wild tilt, far orbit, many rings = "Old, divergent branch with lots of commits—should merge or rebase soon."

---

## 🌑 The Moons = Files

Moons orbiting planets = files in that branch:

| Moon Property | Meaning |
|---------------|---------|
| Size | Large file (many lines) |
| Brightness | Heavily edited today |
| Color | File type (rust=orange, ts=blue, md=white) |
| Phase | Completeness (full=done, crescent=WIP) |
| Glow intensity | Recency of edits |

**Eclipses** = merge conflicts (moons align and cast shadows)

---

## 🌌 The Constellations = Relationships

Faint lines connecting stars:

| Line Type | Meaning |
|-----------|---------|
| Bright lines | Shared commits (files moved between repos) |
| Pulsing lines | Active cross-repo work happening now |
| Fading lines | Historical relationship, growing cold |

**Clusters** = project groups (work repos vs. side projects vs. forks)

---

## 🌫️ Space Phenomena = Code Metrics

### The Nebula = Test Coverage
- Color density = coverage percentage
- Dark patches = uncovered code
- Lightning inside = failing tests
- Gentle glow = all green

### The Asteroid Belt = TODOs/Comments
- Each asteroid = a TODO comment
- Size = lines of TODO
- Color = age (fresh=white, old=brown)
- Drift toward star = "aging debt"

### The Comet = Recent Commit
- Streaks across screen then fades
- Tail length = commit size
- Tail color = commit type (feat/fix/chore)
- Origin point = author (you vs. collaborator)

### The Black Hole = Deleted Code
- Swirls near files with lots of deletions
- Accretion disk = recently removed files
- Event horizon size = total lines deleted today

---

## 🔍 Zoom Levels (Beauty → Data Transition)

### Level 1: Galaxy View (Ambient)
- See 5-10 repos as stars
- Notice: "Something's red over there"
- Don't read anything, just feel the mood

### Level 2: Solar System (Hover/Click Star)
- Repo expands to fill center
- Planets (branches) visible with faint labels
- See: 3 planets, 2 have many moons
- Think: "3 branches, 2 are complex"

### Level 3: Planetary (Click Planet)
- Branch expands, moons (files) labeled
- Click moon → file contents/code preview
- Commit rings clickable → show diff

**Transition**: Motion blur and particle trails—feels like flying through space, not loading a page.

---

## 🎛️ HUD Layer (On Demand)

Press `Space` or hover edge → subtle overlay:

```
┌────────────────────────────────┐
│ ☉ ColdVox                      │
│   ⚡ 4 commits today           │
│   🔴 1 failing check           │
│   🪐 3 active branches         │
│                                │
│ [press 1-3 to jump to branch]  │
│ [press C to see commits]       │
│ [press ESC to dismiss]         │
└────────────────────────────────┘
```

Default: **Zero text**. Just the cosmos.

---

## Insight Moments (Cosmology)

| You Notice | You Understand | You Do |
|------------|----------------|--------|
| Moon just brightened | "I edited that file" | Keep working or check it |
| Two planets on collision course | "Branches will conflict" | Merge now or rebase |
| Star turned red | "Main is broken" | Stop and check CI |
| New comet from edge | "Collaborator pushed" | Review their changes |
| Asteroid belt thickening | "TODOs accumulating" | Schedule cleanup |
| One planet much larger | "This branch is huge" | Consider splitting PR |

---

## Technical Requirements

### Performance
- **60fps always** — GPU shaders, not DOM
- **WebGL/Three.js** — particle systems, bloom, motion blur
- **Seamless loop** — feels infinite, never obviously repeating
- **Low CPU when idle** — pause expensive effects when not focused

### Data Pipeline (For Reference)
- GitHub API integration
- Local git hook listener
- WebSocket or polling (30-60s refresh)
- Multi-repo scanner (auto-discover repos in ~/Projects)
- WebSocket push for immediate updates

---

## The Test

Can you look at this for 3 seconds and answer:
1. "Is my main branch healthy?"
2. "Am I working on too many things?"
3. "Is there something I should look at?"

If yes, and it's still beautiful enough to be a screensaver—**you nailed it**.

---

## File Format Note

The existing HTML exhibits in the temp folder are:
- Static, hardcoded ColdVox data
- Self-contained (no external deps)
- Single-file HTML/CSS/JS
- Good reference for styling but not dynamic

This spec describes the **next evolution**: live-connected, GPU-rendered, ambient-first.

---

*Generated for background ambient visualization of all repositories.*
