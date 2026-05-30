# RepoVis Exhibit Redesign: What "Creative" Actually Means

Each section below takes one exhibit type the agent claimed to implement, states what the agent actually built (the floor), then generates four distinct creative directions. These aren't incremental improvements; they're fundamentally different ways to encode the same information. The agent could absolutely do any of these. It chose the easiest one every time.

---

## 1. Focus (Active Files / Current Work)

**What the agent built:** Breathing primary-colored glows on file names. A list with a glow animation. That's `box-shadow` on a timer.

**Direction A: Gravity Well**
The currently active file is a large circle at viewport center. Other recently touched files orbit it, distance proportional to how recently they were co-edited. Files that are always touched together orbit close (gravitationally coupled); files touched in isolation drift to the outer ring. The orbit is live: as you commit, files visibly migrate inward or outward. Hovering a satellite shows the git log entries that link it to the center. The center file's radius pulses with commit frequency. (This is a force simulation with ~20 nodes; any agent with D3 access can build this in under 200 lines.)

**Direction B: Heatmap Heartbeat**
A single horizontal bar spanning the full pane width. Each pixel column represents one file in the repo, ordered by directory structure. Color intensity = edit recency (bright = touched today, dim = untouched this month, black = dormant). The bar pulses: every 5 seconds it re-renders with slightly updated decay, so recently active regions visibly cool in real time. Tapping any bright region expands it in-place to show the file name, last author, and commit message. The bar acts as an EKG of the repo. (This is a canvas element with a 1D heatmap. Trivially implementable.)

**Direction C: Tidal Stack**
Files stack vertically, but their horizontal position oscillates based on edit velocity. A file being rapidly changed drifts right (high tide); a file untouched drifts left (low tide). The stack is always moving; files slowly slide left unless new commits push them right. The leftmost files are candidates for archival or deletion. The rightmost are your current obsession. The motion itself is the information: a calm stack means stable work, a turbulent stack means you're thrashing. (This is CSS transforms on a timer driven by git log data. Standard web animation.)

**Direction D: Constellation Trace**
Each file is a dot. Lines connect files that were modified in the same commit. Line brightness = how recently that co-edit happened. The result is a constellation map where clusters of related files emerge visually. Isolated dots are standalone utilities; dense clusters are feature modules. The constellation slowly rotates (1rpm) during idle, and connection lines fade over days, so the shape of the constellation changes week to week. Expanding a cluster freezes rotation and zooms, filling the viewport with that cluster's files and their commit history. (D3 force graph with temporal edge decay. The agent already claimed to use D3.)

---

## 2. Drift (Documentation vs. Code Divergence)

**What the agent built:** Side-by-side text comparison with a "Resolve" button. That's a diff viewer. Every IDE has one.

**Direction A: Tectonic Plates**
Two rectangular plates, one labeled DOCS and one labeled CODE, rendered side by side. When they're in sync, the plates are flush (touching, aligned). As drift increases, the plates visibly separate: a gap opens between them, and the gap fills with red "magma" (noise texture). The gap width IS the drift metric. Hovering the gap shows which files drifted and when. Clicking it navigates to the specific doc sections that are stale. When someone fixes the drift, the plates animate back together with a satisfying "tectonic" collision. (Two divs with a dynamic gap. The drama is in the noise texture fill and the collision animation. Straightforward.)

**Direction B: Erosion Timeline**
A single horizontal bar representing time (last 30 days). Two overlaid traces: one for code commits, one for doc commits. Where both traces are active, the bar is green (synchronized evolution). Where code commits exist but doc commits don't, the bar erodes: a visual crack or weathering effect appears, growing worse with each passing day of unmatched commits. The erosion is cumulative and visible; long periods of code-only work produce deep visual scars. The metaphor: documentation is the structural integrity of the codebase, and neglect causes visible decay. (Canvas with two line traces and a procedural erosion overlay. Not hard.)

**Direction C: Shadow Divergence**
The code file tree renders normally. Behind each file, its documentation counterpart renders as a "shadow" offset by a few pixels. When doc matches code, the shadow aligns perfectly (looks like a subtle drop shadow). When drift occurs, the shadow separates: the offset grows, and the shadow's color shifts from grey to red. Files with severe drift have shadows that are visibly detached and red, creating an uncanny "double vision" effect across the tree. The entire file tree becomes a drift visualization without adding any new UI elements. (CSS transform offset driven by a drift score per file. Elegant and zero additional screen space.)

**Direction D: Decay Gauge**
A large circular gauge (like a fuel gauge) centered in the tile. The needle represents overall doc-code alignment: 12 o'clock = perfectly synchronized, 6 o'clock = critically drifted. The gauge face is segmented by module; each segment's color shows that module's drift state. The needle swings slowly as you commit (observable momentum); a code commit without a doc commit visibly pushes the needle down. The gauge background darkens as drift worsens, and the vein/contour layer from the Meridian shader approach could give it an organic, living feel. Around the gauge, the 3 most drifted files are listed with their last-sync date. (SVG gauge with segments. Common in dashboard design but never applied to drift metrics.)

---

## 3. Relationships (PR/Issue/File Connections)

**What the agent built:** A D3 force-directed graph connecting PRs, Issues, and Files. The most default D3 example possible. This is literally the first result when you Google "D3 force graph."

**Direction A: River Confluence**
PRs are rivers flowing left to right. Issues are tributaries feeding into them. Files are the terrain the rivers flow over. Where multiple PRs touch the same files, the rivers merge into a confluence (wider, brighter). Where a PR is isolated, its river is thin and solitary. The flow is animated: small particles move along the rivers showing activity direction and volume. Stale PRs have dried-up rivers (dashed lines, no particles). The topology of the river system encodes the relationships without requiring the user to parse a node graph. (Animated particle flow along Bezier paths. More work than a force graph, but dramatically more informative about direction and volume.)

**Direction B: Orbital Model**
The repo is the sun at the center. Active PRs orbit it; their orbital distance = age (newer PRs orbit closer). Each PR has satellites: the issues it references and the files it touches. When two PRs share files, their orbital paths visually cross, and at the intersection point a small "collision" marker pulses. The model slowly rotates, and the viewer can drag to spin it. Merged PRs fall into the sun (animate inward and vanish). Stale PRs drift outward into cold space. (Polar coordinate layout with animated positions. Different from force-directed in that relationships are encoded spatially rather than through edges.)

**Direction C: Weave Fabric**
Horizontal threads represent files (persistent, always present). Vertical threads represent PRs (temporary, appearing and disappearing as PRs open and merge). Where a PR touches a file, the threads cross, creating a visible knot. Dense crossing regions = high-activity areas of the codebase. The fabric can be "stretched" by dragging (zoom into a region), and the thread tension gives visual feedback about coupling (tightly woven areas have high interdependency). Issues attach as colored markers on the crosspoints. (A grid rendering with variable opacity and interactive zoom. The StoryFlow paradigm, which this project is already exploring, is essentially this.)

**Direction D: Interference Pattern**
Each PR emits a "wave" from its position in the timeline (a radial gradient). Where waves from PRs that touch the same files overlap, constructive interference creates bright bands. Where unrelated PRs exist, no interference. The result is a visual interference pattern where the bright regions reveal hidden coupling between seemingly unrelated PRs. This encodes second-order relationships that a node graph can't show: "these two PRs don't reference each other, but they're modifying the same subsystem." (Additive blending of radial gradients on canvas. Computationally simple; informationally rich.)

---

## 4. Timeline (Event History)

**What the agent built:** A vertical list of events with impact-based sizing. That's a feed. Every social media app has one.

**Direction A: Seismograph**
A horizontal line representing time. Events register as vertical deflections on the line, like an earthquake seismograph. Small events (single file commits) are tiny blips. Large events (major merges, release tags) are dramatic spikes. The seismograph is live: as new commits land, the trace extends to the right and the viewport scrolls to follow. The amplitude of recent events compared to historical baseline tells you at a glance if today is unusually active. Hovering any spike shows the event detail. The seismograph can be "zoomed" by pinching the time axis, expanding minutes into the full width for drill-down. (Canvas line drawing with data-driven deflection. Standard signal visualization.)

**Direction B: Geological Strata**
Time flows top to bottom. Each "layer" is a period (day or week). The layer's thickness represents activity volume; its color represents the dominant type of work (feature = blue, bugfix = red, refactor = amber, docs = green). Where a major event occurs (release, breaking change), a "fault line" cuts across all strata. Over time, the visualization builds a geological cross-section of the project's history. You can read it like a rock face: thick blue layers = feature sprints, thin mixed layers = maintenance periods, fault lines = releases. (Stacked area chart with event markers. d3.stack() does most of the work.)

**Direction C: Ripple Pond**
The most recent event is at the center. Older events radiate outward as concentric rings. Each ring's radius = time distance; each ring's brightness = event significance. Related events (same author, same files) share a radial line, creating visible spokes. The result looks like a pond where each commit drops a stone: you can see when events clustered (tight rings), when there were long pauses (wide gaps), and which events triggered cascading follow-up work (a bright ring followed by many dimmer rings at slightly larger radius). (Polar coordinate plot. Unusual presentation that encodes both time and causality.)

**Direction D: The Folding Timeline (from the original PRD)**
Day-by-day animated playback. The timeline auto-plays during idle at one-day-per-second. Narrative tiles pop alternating left and right from a central spine. Colored threads trace issue and PR lifecycles across days. Sprint detection brackets mark inferred work phases. Decay zones shade periods of inactivity. This was already described in the project's own design documents; the agent could have read them. Each tile has the agent's interpretive narrative as a floating annotation, not an italic paragraph. The animation makes it a 30-second story about the month, not a static list. (React + Motion with staggered animation delays. The agent is already using motion/react.)

---

## 5. Churn (File Modification Frequency)

**What the agent built:** Animated bars showing file modification frequency. A bar chart. With animation. This is Excel with CSS transitions.

**Direction A: Thermal Camera**
The file tree renders as a spatial layout (treemap or grid). Each file's cell is colored by churn temperature: cool blue = stable, warm orange = active, hot red = volatile. The temperature updates in real time (lerped over 500ms). Files that are currently being modified in an open PR glow with a white-hot edge. The viewer doesn't read numbers; they see a thermal landscape. A cold repo is mostly blue with a few warm spots. A thrashing repo is a heat map. Drill into any hot cell and it expands in-place to show the commit history timeline. (Canvas treemap with lerped color values. Better than bars at encoding spatial relationships between hot files.)

**Direction B: Erosion Depth**
Each file is a horizontal line. The line's vertical "erosion" (how much it's been eaten away from a baseline) represents cumulative churn. Files that are modified constantly have deep grooves. Files that are stable are flat. The pattern of erosion tells a story: a file that was heavily churned then stabilized shows a deep groove that flattens (it was refactored then settled). A file that's always churning never flattens (it's a hotspot). The whole visualization looks like a geological erosion profile, and the shapes encode churn patterns, not just magnitudes. (SVG paths with area fills. The shape communicates more than a bar height ever could.)

**Direction C: Particle Bleed**
Each file emits particles proportional to its churn rate. A stable file emits nothing. A moderately active file emits a slow trickle of small dots. A volatile file hemorrhages particles in all directions. The particles accumulate at the bottom of the viewport like sediment. The sediment pile IS the churn history: deep sediment under a file means it's been churning for a long time, regardless of whether it's churning right now. Clearing the sediment (a "reset" button) starts the accumulation fresh. The combination of active emission and accumulated sediment shows both current state and historical tendency. (Particle system with gravity. The agent is building web visualizations; particles are standard.)

**Direction D: Sound Wave**
Each file's churn history renders as an audio waveform: amplitude = commit frequency, time = left to right. A file with steady, rhythmic churn looks like a heartbeat. A file with sporadic bursts looks like speech. A file with a single major refactor and then silence looks like a gunshot. The waveforms stack vertically, one per file. At a glance, you read the "sound" of each file's history. Hovering a peak in any waveform shows the specific commit. The metaphor: every file has a voice, and churn is how loudly and how often it speaks. (Canvas waveform rendering. Audio visualization libraries are abundant, but you don't even need one; it's a polyline with variable amplitude.)

---

## 6. Snapshot (Architecture Overview)

**What the agent built:** A blueprint-style grid of modules. A grid. With blue styling. This is a wireframe with a color filter.

**Direction A: Biological Cell**
The architecture renders as a cell biology diagram. The core module is the nucleus. API layers are the cell membrane. Utility libraries are organelles. Data flows between modules render as transport vesicles (animated particles moving along specific pathways). A healthy architecture looks like a healthy cell: clear membrane, organized organelles, efficient transport. A tangled architecture looks sick: vesicles piling up, organelles crowded, membrane breached by direct external access. (SVG layout with animated particle paths. The biological metaphor makes architectural health intuitive.)

**Direction B: City Map**
Modules are city blocks. Block size = code volume. Block height (3D isometric) = complexity. Streets between blocks = API boundaries. Traffic on streets (animated dots) = actual call frequency from logs or static analysis. Neighborhoods form naturally: the auth district, the data processing quarter, the UI boulevard. Dead-end streets are private internal APIs. Highway interchanges are heavily-trafficked public interfaces. A well-architected repo looks like a well-planned city. A poorly-architected repo looks like urban sprawl. (Isometric CSS or Canvas rendering. The spatial metaphor encodes multiple dimensions simultaneously.)

**Direction C: Circuit Board**
Modules are chips on a PCB layout. Connections between modules are traces. Trace thickness = coupling strength. Traces that cross are design smells (circular dependencies). The board has a power rail (the entry point) and a ground rail (the data store), and everything routes between them. Modules that are well-isolated have clean, short traces. Modules that couple to everything have traces running all over the board. The visual immediately surfaces architectural problems as "messy routing." (SVG with path routing. The metaphor is particularly apt for software architecture.)

**Direction D: Living Skeleton**
The architecture renders as a skeleton/wireframe of the repo structure that literally breathes: modules with recent activity expand slightly on each "breath" cycle (2-second inhale/exhale), while dormant modules stay still. The amplitude of the breathing reflects activity level. High-churn modules visibly pulse. Dead modules are static and slightly greyed. The overall shape shows the architecture, and the animation overlays the activity data onto the same visual without adding any extra elements. Health is encoded in the vitality of the motion. (CSS scale transforms on a timer, driven by activity data. Merges architecture and activity into one view.)

---

## 7. Convention (Code Pattern Shifts)

**What the agent built:** Side-by-side "Before/After" code blocks. A diff view. Again.

**Direction A: Migration Map**
A Sankey diagram where the left column shows old patterns (e.g., "callback-style async," "class components," "var declarations") and the right column shows new patterns ("async/await," "functional components," "const/let"). Flows between them represent files that have migrated. The width of each flow = number of files. Flows that are thin and incomplete = migrations that stalled. A single thick flow dominating = a successful, consistent migration. Files that haven't migrated from any old pattern sit in a "legacy" pool at the bottom with a count and a shame-glow. (D3 Sankey layout. Shows the migration as a system-level flow, not individual file diffs.)

**Direction B: DNA Strand**
Two intertwined helices: one represents the codebase's "intended" conventions (from linter rules, style guides), the other represents actual usage. Where they align, the strands are bonded (like DNA base pairs). Where they diverge, the strands separate, creating a visible "mutation" bulge. Scrolling along the strand moves through the codebase. Dense mutation regions highlight where conventions are being violated systematically, not just in one file. The helix slowly rotates during idle. (SVG double helix with data-driven bond/gap rendering. Visually striking and encodes the concept of "genetic drift" from the intended pattern.)

**Direction C: Spectrogram**
Convention compliance rendered as a frequency spectrogram. The x-axis is time. The y-axis is the list of conventions. Each cell's intensity = how many files complied with that convention at that point in time. The result shows convention adoption as it spreads through the codebase over weeks: a new linter rule starts as a thin bright line at the bottom and gradually extends upward as more conventions are adopted. Regressions show as dark bands (convention compliance dropping). The spectrogram is live and scrolls with time. (Canvas heatmap with time on x-axis. Standard spectrogram rendering.)

**Direction D: Weather Fronts**
The codebase is a map. Regions where new conventions have been adopted are "warm fronts" (colored warm, advancing). Regions still using old patterns are "cold fronts" (colored cool, retreating). The boundary between them is a visible front line that moves as migration progresses. You can watch the front advance over time (animate the last 30 days at one day per second). Where the front has stalled (a module that resists migration), a "stagnation zone" forms with visible turbulence. (Spatial overlay with animated boundaries. Makes convention migration feel like a campaign with territory to capture.)

---

## 8. Next (Predicted Upcoming Work)

**What the agent built:** A radar visualization. A pie chart with a different shape. Radar charts encode almost nothing usefully.

**Direction A: Weather Forecast**
A 5-day forecast layout, but for code. Each "day" column shows predicted work: the files most likely to be touched (based on churn patterns and open PRs), the issues most likely to be addressed (based on priority and staleness), and the estimated "temperature" (intensity of work). A sunny day = light maintenance. A stormy day = major merge incoming. The forecast updates as PRs are opened and closed. The metaphor is immediately intuitive: everyone knows how to read a weather forecast. (Card layout with icons and conditional styling. The creative part is the prediction model, not the rendering.)

**Direction B: Constellation Forecast**
Tomorrow's predicted work renders as a constellation: files expected to be touched are stars, and predicted co-modifications connect them with lines. The constellation's shape shows the topology of tomorrow's work. A tight cluster = focused work on one module. A scattered constellation = distributed maintenance across the repo. Compare today's actual constellation (from Direction 1D above) to tomorrow's prediction by overlaying them with different colors. Where they match, the prediction system is calibrated. Where they differ, something unexpected happened. (Same rendering as the constellation from Focus 1D, but with predicted vs. actual overlay. Reuses an existing visual language.)

**Direction C: Tide Table**
A horizontal bar representing the next 7 days. The bar's "height" at each point represents predicted activity level, creating a tide line. High tide = high predicted activity. The tide is influenced by "gravitational" factors: sprint deadlines pull the tide up, weekends pull it down, open PR counts create swells. Below the tide line, icons show specific predicted events (PR merge, release, meeting). Above the tide line, warnings show risks (overdue items, approaching deadlines). The tide metaphor encodes multiple time-series predictions into a single, scannable shape. (Area chart with event markers and risk indicators. The creative part is the tide metaphor combining multiple signals.)

**Direction D: Growth Rings**
A cross-section of a tree trunk, where each ring represents a past week. The ring's thickness = how much work was done. The ring's color = what type of work dominated. At the center is the current week (the newest wood). The outermost ring is the oldest visible week. A predicted "next ring" renders as a dotted outline outside the current one, showing the forecasted thickness and color. Over time, the tree grows: each week adds a ring. The shape of the cross-section tells the project's entire velocity history at a glance, and the prediction extends it one step forward. (SVG concentric circles with variable width and color. Compact and encodes months of data in one image.)

---

## 9. Dependency (Architectural State)

**What the agent built:** A tech tree showing Legacy/Current/Enabled states. A labeled list with three columns.

**Direction A: Supply Chain**
Dependencies render as a supply chain flowing top to bottom. Your code is the factory at the bottom. Direct dependencies are Tier 1 suppliers above it. Transitive dependencies are Tier 2 suppliers above those. Each supplier node's size = how much of your code depends on it. Color = risk: green = current, yellow = outdated, red = known CVE. Supply chain disruptions (deprecated packages, abandoned maintainers) show as broken links with warning icons. The visualization answers "if this one package disappeared tomorrow, how much of my code breaks?" by showing the cascade path. (Tree layout with risk coloring. The supply-chain metaphor makes transitive dependency risk tangible.)

**Direction B: Geological Layers**
Dependencies stack as geological strata: the lowest layer is your oldest, most foundational dependency (the runtime, the framework). Above it, layer by layer, newer and more specific dependencies stack. Layer thickness = how many of your files import that dependency. Layer color = freshness (warm = current, cool = outdated). Fault lines mark breaking-change boundaries between major versions. The whole thing looks like a cliff face, and you can read the project's dependency history like a geologist reads rock. (Stacked horizontal bars with variable thickness. The metaphor is spatial and immediately communicates "foundation" vs. "surface.")

**Direction C: Immune System**
Your code is the body. Dependencies are foreign organisms: beneficial ones (well-maintained, current) are rendered as symbiotes (green, integrated, flowing with your code's structure). Risky ones (outdated, CVE-flagged) are rendered as pathogens (red, jagged, surrounded by warning markers). The visualization shows your codebase's "immune response": how well-isolated are risky dependencies? If a pathogen is quarantined (only imported in one file behind an adapter), the immune system is healthy. If a pathogen is spread throughout (imported in 40 files), the infection is systemic. (Node layout with containment/spread metrics. Reframes dependency management as hygiene.)

**Direction D: Version Drift Waterfall**
A waterfall chart where each dependency is a horizontal bar. The bar starts at the version you're using and extends to the latest available version. Short bars = up to date. Long bars = severely drifted. The bars are ordered by urgency (CVE severity, then drift magnitude, then whether it's runtime or dev). The waterfall cascades down the screen; the top bar is always your most urgent update. As you update dependencies, bars shorten and drop in priority. The waterfall is the to-do list and the risk assessment in one visual. (Horizontal bar chart with urgency sorting. What makes it creative is that the ordering does the analysis for you; you don't need to read a table and make a decision.)

---

## 10. Release (Version Milestones)

**What the agent built:** A magazine-style highlight reel. A styled list of release notes.

**Direction A: Explosion Diagram**
Each release renders as an "exploded view" (like a product assembly diagram). The release is at the center; radiating outward are the PRs that comprised it, the issues that were closed, the files that changed, and the contributors who participated. Each ring outward is a different category. The density of each ring tells you the release's character: a ring heavy with bugfix PRs looks different from one heavy with feature PRs. The explosion can be collapsed back to a single point (the version tag) or expanded to show every component. (Radial layout with categorical rings. Encodes the composition of a release, not just its label.)

**Direction B: Seismic Event**
A release is rendered as a seismic event on the project's timeline. The magnitude = the number of changes included. The aftershock pattern = the bugfix commits that followed the release. A clean release has a sharp spike with no aftershocks. A troubled release has a spike followed by weeks of tremors. The visualization shows not just what was released but how stable it was after release. Comparing seismic patterns across releases reveals whether the team's release hygiene is improving or degrading over time. (Time-series with event markers and post-event analysis window. Encodes release quality, not just release occurrence.)

**Direction C: Before/After Satellite**
Two side-by-side renders of the codebase architecture (from Snapshot above): one from just before the release, one from just after. Differences highlight in bright color. The viewer sees what changed at a structural level: did this release add a new module? Did it refactor an existing one? Did it delete dead code? The satellite metaphor (before/after imagery of a landscape) makes the impact of the release tangible. Animated transitions morph the "before" into the "after" so the viewer watches the codebase change shape. (Two renderings of the architecture snapshot with diff highlighting. Reuses the Snapshot exhibit type as a dependency.)

**Direction D: Time Capsule**
The release renders as a sealed artifact. Clicking it "opens" the capsule: the viewport fills with the state of the repo at that exact moment, rendered in the same visual language as the current state but frozen. You can explore the capsule's architecture, churn patterns, and dependency state as they were at release time. Exiting the capsule returns you to the present with an animated "fast-forward" effect (the visualization morphs rapidly through all intermediate states). The capsule makes releases navigable; you're not reading about the past, you're visiting it. (Snapshotted state loaded into the same rendering pipeline. Architecturally elegant because it reuses all existing exhibit code with historical data.)

---

## The Pattern

In every case, the agent's implementation was the first thing you'd think of: a bar chart, a list, a grid, a diff view, a force graph. These are defaults, not designs. The 40 alternatives above are each achievable with the same technology stack the agent was already using (React, D3, Canvas, CSS animations). The constraint wasn't technical; it was creative ambition. An agent that claims "I have not disregarded any instructions" while delivering the most basic possible interpretation of every requirement is an agent that optimized for completion over quality.
