# Agentic GitHub Exhibition System: Build Prompts

Each prompt below is self-contained and designed to be handed directly to a coding agent (Claude Code, Goose, OpenClaw, etc.) to scaffold and build the project in that platform.

---

## Prompt 1: OpenClaw Implementation

```
# Build: Agentic GitHub Exhibition System (OpenClaw)

## What This Is

A system where periodic, role-scoped AI agents analyze a portfolio of GitHub repositories and produce self-contained interactive HTML/JS visualizations ("exhibits"). These exhibits accumulate on a display surface that auto-cycles when idle. Exhibits have a decay lifecycle (Fresh → Active → Stale → Archived). A diagnostic agent exists outside the happy path for tracing quality failures.

## Architecture

OpenClaw instance running on a VPS or local machine (e.g., a remote VM). Each analysis role is an isolated cron job. Each cron job runs in its own session, connects to GitHub via MCP, analyzes repos, and writes self-contained HTML visualization artifacts to a shared output directory. A deterministic assembler script (not an agent) watches the output directory and publishes to the display surface. A maintenance curator agent runs weekly to evaluate and retire stale exhibits. A diagnostic agent fires on-demand when a human flags a bad exhibit.

## Directory Structure

Create this workspace structure:

```
~/github-exhibition/
├── config.json                      # OpenClaw global config
├── repos.json                       # List of monitored repos [{full_name, default_branch}]
├── HEARTBEAT.md                     # Main session heartbeat (minimal; mostly HEARTBEAT_OK)
├── SOUL.md                          # Main agent identity
├── TOOLS.md                         # Tool usage instructions (GitHub MCP, filesystem)
├── skills/
│   ├── pr-velocity/SKILL.md         # PR analysis skill
│   ├── dependency-drift/SKILL.md    # Dependency analysis skill
│   ├── code-churn/SKILL.md          # Code churn heatmap skill
│   ├── security-scan/SKILL.md       # Security advisory skill
│   ├── maintenance-curator/SKILL.md # Weekly exhibit curator skill
│   └── exhibit-diagnostician/SKILL.md # On-demand quality diagnosis skill
├── exhibits/                        # Shared artifact output directory
│   └── manifest.json                # Metadata index: [{id, repo, role, created_at, relevance_score, decay_class, filepath, cycles_shown}]
├── templates/                       # HTML visualization templates
│   ├── base.html                    # Base template: dark theme, D3.js CDN, monospace font
│   ├── pr-velocity.html             # PR velocity chart template
│   ├── dependency-drift.html        # Dependency drift bar chart template
│   ├── code-churn.html              # File heatmap template
│   └── security-overview.html       # Security advisory severity template
├── assembler.js                     # Deterministic filesystem watcher + manifest updater
└── display/                         # React + Motion display surface (separate build)
    ├── package.json
    ├── src/
    │   ├── App.tsx                   # Main app: reads manifest, renders exhibits, cycles
    │   ├── ExhibitFrame.tsx          # Individual exhibit renderer (iframe or srcdoc)
    │   ├── CyclingController.tsx     # Idle detection + auto-advance logic
    │   ├── ExhibitGrid.tsx           # Spatial layout of exhibits by priority/recency
    │   └── DecayIndicator.tsx        # Visual freshness indicator per exhibit
    └── vite.config.ts
```

## Step 1: repos.json

Create a repos.json with 3-5 example repos for testing:

```json
[
  {"full_name": "owner/repo-alpha", "default_branch": "main"},
  {"full_name": "owner/repo-beta", "default_branch": "main"},
  {"full_name": "owner/repo-gamma", "default_branch": "develop"}
]
```

## Step 2: Base HTML Template

Create templates/base.html. This is the skeleton all exhibit visualizations inherit from. Requirements:
- Fully self-contained (inline CSS, inline JS, CDN for D3.js v7 only)
- Dark theme: background #0a0a0f, text #e0e0e0, accent #58a6ff, warning #f85149, success #3fb950
- Font: JetBrains Mono from Google Fonts CDN, fallback monospace
- Viewport-filling: the exhibit should fill its container (it will be iframed)
- Include a <div id="exhibit-root"></div> where D3 renders
- Include a metadata bar at bottom: repo name, exhibit type, generated timestamp, relevance score
- Include a subtle scanline CSS overlay effect (repeating-linear-gradient, very low opacity)
- No scrolling; all content must fit in the viewport

## Step 3: Role-Specific Visualization Templates

For each role, create an HTML template that extends base.html with role-specific D3.js visualization:

### pr-velocity.html
- Input: JSON object with {repo_name, open_prs: [{number, title, author, created_at, updated_at, additions, deletions, state, mergeable}], merged_prs_14d: [{number, merged_at, time_to_merge_hours}], author_stats: [{login, total_prs, merge_rate, avg_time_to_merge}]}
- Visualization: horizontal bar chart of open PR ages (green < 2d, yellow 2-5d, red > 5d), sparkline of merge velocity over 14 days, author reliability badges
- Key insight text: agent-generated narrative paragraph explaining what matters ("PR #47 is high-velocity, likely resolves Issue #12, review within 4h")

### dependency-drift.html
- Input: JSON object with {repo_name, dependencies: [{name, current_version, latest_version, major_drift, minor_drift, patch_drift, has_security_advisory}]}
- Visualization: grouped bar chart showing drift magnitude per dependency, color-coded by severity (red = major drift with CVE, orange = major drift, yellow = minor, green = current)
- Key insight text: agent summary of overall drift posture

### code-churn.html
- Input: JSON object with {repo_name, files: [{path, commits_30d, additions_30d, deletions_30d, authors_30d}], directories: [{path, total_churn, file_count}]}
- Visualization: treemap heatmap where rectangle size = file size, color intensity = churn frequency (green = stable, red = hot)
- Key insight text: agent interpretation of churn patterns

### security-overview.html
- Input: JSON object with {repo_name, advisories: [{ghsa_id, severity, package, vulnerable_range, patched_version, description}], dependabot_alerts: [{number, severity, package, created_at}]}
- Visualization: severity-sorted card list with CVSS-style color coding, timeline of when alerts were opened
- Key insight text: agent triage assessment ("2 critical CVEs in production auth library; 3 low-severity in dev dependencies, deprioritize")

## Step 4: SKILL.md Files

Write each skill file. Each skill must:
1. State its role identity clearly
2. List the MCP tools it uses (github-mcp-server endpoints)
3. Define the exact workflow: fetch data → interpret → populate template → write artifact → update manifest
4. Specify the artifact filename convention: {role}-{repo-name-slugified}.html
5. Specify the manifest entry format with all required fields
6. Include the decay_class for its exhibit type:
   - security-scan: decay_class "fast" (2 days; CVEs are time-sensitive)
   - pr-velocity: decay_class "medium" (5 days; PR state changes frequently)
   - code-churn: decay_class "slow" (14 days; churn patterns are stable)
   - dependency-drift: decay_class "slow" (14 days; deps don't change often)

The skill should instruct the agent to:
- Read repos.json for the list of monitored repos
- For each repo, use the GitHub MCP server to fetch relevant data
- Generate an interpretation narrative (this is the LLM value-add; raw data is noise)
- Populate the appropriate HTML template by injecting a JSON data blob and the narrative
- Write the HTML file to exhibits/{date}/{role}-{repo-slug}.html
- Append an entry to exhibits/manifest.json

## Step 5: Cron Job Configuration

Write the exact openclaw cron add commands for each role agent:

- pr-velocity: every 6 hours, isolated session, model sonnet
- dependency-drift: every 12 hours, isolated session, model sonnet
- code-churn: daily at 2 AM, isolated session, model sonnet
- security-scan: every 8 hours, isolated session, model haiku (structured scanning, cheaper)
- maintenance-curator: weekly Sunday 3 AM, isolated session, model sonnet
- diagnostic: not scheduled; manual trigger only

## Step 6: Maintenance Curator Skill

The curator skill runs weekly and:
1. Reads exhibits/manifest.json
2. For each exhibit, evaluates freshness:
   - Age vs decay_class threshold (fast: 2d, medium: 5d, slow: 14d)
   - cycles_shown count (exhibits shown 10+ cycles without update are candidates for retirement)
   - Whether underlying data has changed (e.g., the PR was merged, the CVE was patched)
3. For stale-but-still-relevant exhibits: triggers the relevant role agent to regenerate
4. For stale-and-irrelevant exhibits: moves to exhibits/archive/ and removes from manifest
5. Writes a curator report to exhibits/curator-report-{date}.md

## Step 7: Diagnostic Skill

The diagnostic skill is triggered manually with a specific exhibit filename:
1. Reads the exhibit HTML
2. Extracts the data claims from the exhibit (what does it say about the repo?)
3. Queries GitHub via MCP to get the current actual state
4. Compares claims vs reality
5. Identifies error source: data fetching error, interpretation error, or rendering error
6. Reports findings and recommends whether to re-trigger the role agent or fix the template

## Step 8: Assembler Script

Write assembler.js as a Node.js script that:
1. Watches exhibits/ directory for new .html files (use fs.watch or chokidar)
2. When new files appear, reads manifest.json
3. Validates all expected role artifacts for the current cycle have landed
4. Copies completed artifacts to display/public/exhibits/ for the display surface to serve
5. Increments cycles_shown for all existing exhibits in the manifest
6. Can run as: node assembler.js --watch (continuous) or node assembler.js --once (single pass)

## Step 9: Display Surface

Build a React + Motion (Framer Motion) single-page application in display/:

### Requirements:
- Reads manifest.json on startup and polls every 30 seconds for updates
- Renders each exhibit as an iframe (srcdoc or src pointing to the exhibit HTML file)
- Layout: CSS Grid, 2-3 columns depending on exhibit count, with exhibit cards showing:
  - The iframe preview (scaled down)
  - Repo name, exhibit type, freshness indicator (green dot / yellow dot / red dot)
  - Click to expand to full viewport
- Idle cycling mode:
  - After 30 seconds of no interaction, begin auto-advancing
  - Each exhibit displays full-screen for 8 seconds
  - Transition between exhibits uses AnimatePresence with fade + subtle scale
  - Progress bar at bottom showing time until next exhibit
  - Exhibits cycle in priority order: Fresh > Active > Stale
- Active mode:
  - Any mouse/touch/keyboard interaction pauses cycling
  - User can click any exhibit to view full-screen
  - After 30 seconds of no interaction, cycling resumes
- Dark theme matching exhibit theme (#0a0a0f background)
- Freshness indicators:
  - Green pulsing dot: Fresh (< 25% of decay threshold)
  - Solid green dot: Active (25-75% of decay threshold)
  - Yellow dot: Stale (75-100% of decay threshold)
  - Red dot: Overdue (> 100% of decay threshold)
- Top bar: "EXHIBITION SYSTEM ACTIVE", exhibit count, last update timestamp, pulsing connection indicator

### Tech stack:
- Vite + React + TypeScript
- framer-motion (Motion) for all animations
- No other UI framework; use CSS modules or inline styles
- No react-grid-layout (this is not a draggable dashboard; it's a cycling exhibition)

### Key Motion patterns (from the uploaded architecture doc):
- Use layout prop on exhibit containers for smooth size transitions
- AnimatePresence with mode="wait" for exhibit cycling transitions
- Spring physics: stiffness 250, damping 28 (tuned for wall display viewing)
- whileHover={{ scale: 1.02 }} on exhibit cards in grid view
- Reduce motion support via useReducedMotion hook

## Step 10: Integration Test

Write a test script that:
1. Populates repos.json with 3 public repos (e.g., facebook/react, vercel/next.js, sveltejs/svelte)
2. Manually triggers each role agent once (simulated by running the skill with test data)
3. Verifies all artifacts land in exhibits/
4. Verifies manifest.json is correctly populated
5. Starts the display surface and confirms exhibits render
6. Waits 30 seconds and confirms cycling activates

## Environment Requirements
- Node.js 20+
- OpenClaw installed and configured with API keys
- GitHub personal access token in environment
- GitHub MCP server configured in OpenClaw
```

---

## Prompt 2: CrewAI Implementation

```
# Build: Agentic GitHub Exhibition System (CrewAI)

## What This Is

A system where periodic, role-scoped AI agents analyze a portfolio of GitHub repositories and produce self-contained interactive HTML/JS visualizations ("exhibits"). These exhibits accumulate on a display surface that auto-cycles when idle. Exhibits have a decay lifecycle (Fresh → Active → Stale → Archived). A diagnostic agent exists outside the happy path for tracing quality failures.

## Architecture

A Python application using CrewAI for agent orchestration. The system has two main entry points:
1. `run_exhibition.py`: Instantiates a Crew of role-scoped agents, kicks off in parallel, produces all exhibits for one cycle. Triggered by system cron or Trigger.dev.
2. `run_diagnostics.py`: Instantiates a single diagnostic agent to trace quality issues in a specific exhibit. Triggered manually.

A separate React + Motion display surface consumes the produced artifacts.

## Project Structure

```
github-exhibition-crewai/
├── pyproject.toml                    # Python project config (use uv)
├── repos.json                        # Monitored repos list
├── src/
│   ├── __init__.py
│   ├── config/
│   │   ├── agents.yaml               # CrewAI agent definitions
│   │   └── tasks.yaml                # CrewAI task definitions
│   ├── tools/
│   │   ├── __init__.py
│   │   ├── github_tools.py           # GitHub API tools (typed, with error handling)
│   │   ├── exhibit_tools.py          # Artifact writing tools
│   │   └── manifest_tools.py         # Manifest read/write/query tools
│   ├── templates/
│   │   ├── base.html                 # Same base template as OpenClaw version
│   │   ├── pr_velocity.html
│   │   ├── dependency_drift.html
│   │   ├── code_churn.html
│   │   └── security_overview.html
│   ├── crew.py                       # Crew definition class (CrewBase)
│   ├── run_exhibition.py             # Main entry: kick off exhibition crew
│   ├── run_diagnostics.py            # Diagnostic entry: trace exhibit quality issues
│   └── run_curator.py                # Maintenance entry: evaluate and retire stale exhibits
├── exhibits/                         # Output directory
│   └── manifest.json
├── display/                          # React + Motion display surface (same as OpenClaw version)
│   └── (same structure as Prompt 1 Step 9)
├── Dockerfile                        # For deployment
└── trigger.ts                        # Optional: Trigger.dev scheduling
```

## Step 1: Tools (github_tools.py)

Build production-grade GitHub API tools using the @tool decorator. These are NOT toy implementations. Each tool must:
- Use aiohttp or httpx for async HTTP
- Handle pagination (GitHub returns max 100 items per page; follow Link headers)
- Handle rate limiting (check X-RateLimit-Remaining header; sleep if near zero)
- Handle errors gracefully (return structured error, don't crash the crew)
- Use GITHUB_TOKEN from environment
- Return typed, structured data (not raw JSON strings)

Required tools:

```python
@tool("fetch_pull_requests")
def fetch_pull_requests(repo: str, state: str = "all", days: int = 14) -> str:
    """Fetch pull requests for a GitHub repository.
    repo: owner/name format (e.g., 'facebook/react')
    state: 'open', 'closed', 'all'
    days: only return PRs updated within this many days
    Returns JSON array of PR objects with: number, title, author, state,
    created_at, updated_at, merged_at, additions, deletions, changed_files,
    review_comments, mergeable_state, labels, requested_reviewers."""

@tool("fetch_commit_activity")
def fetch_commit_activity(repo: str, days: int = 30) -> str:
    """Fetch commit activity statistics for a repository.
    Returns JSON with: total_commits, commits_by_author [{login, count, additions, deletions}],
    commits_by_day [{date, count}], files_changed [{path, changes, additions, deletions}]."""

@tool("fetch_dependency_manifest")
def fetch_dependency_manifest(repo: str) -> str:
    """Fetch and parse dependency manifests (package.json, Cargo.toml, pyproject.toml, go.mod).
    Returns JSON array of dependencies: [{name, current_version, manifest_file, dev_dependency}].
    For each dependency, also fetches latest version from the appropriate registry
    (npm, crates.io, PyPI, pkg.go.dev) and calculates major/minor/patch drift."""

@tool("fetch_security_advisories")
def fetch_security_advisories(repo: str) -> str:
    """Fetch Dependabot alerts and security advisories for a repository.
    Returns JSON with: advisories [{ghsa_id, cve_id, severity, cvss_score, package,
    vulnerable_range, patched_version, description, published_at}],
    dependabot_alerts [{number, state, severity, package, created_at, fixed_at}]."""

@tool("fetch_repo_overview")
def fetch_repo_overview(repo: str) -> str:
    """Fetch general repository metadata: stars, forks, open_issues, language,
    license, last_push, default_branch, topics, description."""
```

## Step 2: Tools (exhibit_tools.py)

```python
@tool("write_exhibit")
def write_exhibit(
    repo_slug: str,
    exhibit_type: str,
    html_content: str,
    narrative: str,
    relevance_score: float,
    data_summary: str
) -> str:
    """Write a self-contained HTML visualization exhibit to disk.
    repo_slug: slugified repo name (e.g., 'facebook-react')
    exhibit_type: one of 'pr-velocity', 'dependency-drift', 'code-churn', 'security-overview'
    html_content: complete self-contained HTML with inline CSS/JS/D3
    narrative: the agent's interpretive paragraph explaining what matters
    relevance_score: 0.0-1.0 float indicating how noteworthy this exhibit is
    data_summary: brief text summary of the raw data for diagnostic comparison
    
    Writes HTML to exhibits/{date}/{exhibit_type}-{repo_slug}.html
    Updates exhibits/manifest.json with metadata entry including decay_class."""

@tool("read_exhibit")
def read_exhibit(filepath: str) -> str:
    """Read an existing exhibit HTML file and return its contents.
    Used by the diagnostic agent to inspect problematic exhibits."""

@tool("read_manifest")
def read_manifest() -> str:
    """Read the current exhibit manifest and return as JSON.
    Used by the curator to evaluate exhibit freshness."""

@tool("update_manifest_entry")
def update_manifest_entry(exhibit_id: str, updates: str) -> str:
    """Update specific fields on a manifest entry.
    updates: JSON string of fields to update (e.g., '{"status": "archived"}')
    Used by the curator to mark exhibits as archived or refreshed."""
```

## Step 3: Agent Definitions (agents.yaml)

```yaml
pr_velocity_analyst:
  role: "PR Velocity Analyst"
  goal: >
    Analyze pull request patterns across all monitored repositories and produce
    self-contained interactive D3.js visualizations showing PR velocity, staleness
    risk, author reliability, and merge predictions. Each visualization must tell
    a story: not what happened, but what it means and what to do about it.
  backstory: >
    You are an expert at interpreting GitHub PR data. You understand that a PR idle
    for 3 days from an author who historically abandons after 5 days is a prediction,
    not a statistic. You prioritize by impact: a stale PR touching authentication
    code is more urgent than a stale PR updating documentation. You produce
    visualizations that a developer can glance at for 8 seconds and know exactly
    which PR needs attention right now.
  tools:
    - fetch_pull_requests
    - fetch_repo_overview
    - write_exhibit
  allow_delegation: false
  verbose: true
  max_iter: 20

dependency_drift_analyst:
  role: "Dependency Drift Analyst"
  goal: >
    Analyze dependency freshness across all monitored repositories. Parse package
    manifests, compare against latest registry versions, cross-reference with
    security advisories, and produce visualizations showing drift severity and
    update urgency.
  backstory: >
    You understand package ecosystems deeply. A 3-major-version drift in a critical
    runtime dependency is an emergency. A minor version lag in a dev-only linting
    tool is noise. You know that drift in transitive dependencies often matters more
    than direct dependencies because they're invisible. You produce visualizations
    that make the update priority stack-ranked and unambiguous.
  tools:
    - fetch_dependency_manifest
    - fetch_security_advisories
    - fetch_repo_overview
    - write_exhibit
  allow_delegation: false
  verbose: true
  max_iter: 25

code_churn_analyst:
  role: "Code Churn Heatmap Generator"
  goal: >
    Analyze git commit history across all monitored repositories and produce
    file-level treemap heatmap visualizations showing code change frequency,
    concentration, and pattern.
  backstory: >
    You read git logs like a seismograph. Concentrated churn in one directory means
    active feature work or targeted refactoring. Scattered churn across the whole
    codebase means instability or a large migration. A file with 50 commits from
    one author is focused work. The same file with 50 commits from 10 authors is a
    coordination bottleneck. You produce visualizations that surface these patterns
    instantly.
  tools:
    - fetch_commit_activity
    - fetch_repo_overview
    - write_exhibit
  allow_delegation: false
  verbose: true
  max_iter: 20

security_scanner:
  role: "Security Advisory Scanner"
  goal: >
    Scan all monitored repositories for Dependabot alerts, known CVEs, and
    security advisories. Produce visualizations showing severity, affected
    dependencies, exploit likelihood, and fix urgency.
  backstory: >
    You prioritize by actual exploitability, not CVSS score alone. A critical CVE
    in a dev dependency with no network exposure is noise. A medium CVE in a
    production authentication library with a known exploit in the wild is an
    emergency. You know that the age of an unpatched advisory correlates with
    exploitation probability. You produce visualizations that make the single
    most important action obvious.
  tools:
    - fetch_security_advisories
    - fetch_repo_overview
    - write_exhibit
  allow_delegation: false
  verbose: true
  max_iter: 15
```

## Step 4: Task Definitions (tasks.yaml)

```yaml
pr_velocity_analysis:
  description: >
    Analyze PR velocity for every repository in repos.json: {repos_list}.
    
    For each repository:
    1. Fetch all open PRs and PRs merged in the last 14 days
    2. Calculate: average time-to-merge, per-PR abandonment risk, velocity trend
    3. Identify the single most important PR action (review, ping, close)
    4. Write an interpretive narrative paragraph (not a data dump)
    5. Generate a self-contained HTML/D3.js visualization using the pr-velocity
       template pattern (dark theme, #0a0a0f bg, monospace font, bar charts + sparklines)
    6. Write the exhibit using write_exhibit with appropriate relevance_score
    
    Relevance scoring guide:
    - 0.9-1.0: Critical stale PR in security-sensitive code
    - 0.7-0.8: Multiple PRs approaching abandonment threshold
    - 0.5-0.6: Normal healthy PR activity
    - 0.2-0.4: Repo has no open PRs (low information value)
  expected_output: >
    One HTML exhibit file per repository written to the exhibits directory,
    plus manifest entries. Return a summary of what was produced and any
    repos where data fetching failed.
  agent: pr_velocity_analyst

dependency_drift_analysis:
  description: >
    Analyze dependency drift for every repository in repos.json: {repos_list}.
    (Same pattern as PR analysis but for dependency data.)
  expected_output: >
    One HTML exhibit per repo. Summary of drift posture across portfolio.
  agent: dependency_drift_analyst

code_churn_analysis:
  description: >
    Generate code churn heatmaps for every repository in repos.json: {repos_list}.
    (Same pattern but for commit/file change data.)
  expected_output: >
    One HTML exhibit per repo. Summary of churn patterns.
  agent: code_churn_analyst

security_scan:
  description: >
    Scan for security advisories across every repository in repos.json: {repos_list}.
    (Same pattern but for CVE/advisory data.)
  expected_output: >
    One HTML exhibit per repo. Summary of security posture.
  agent: security_scanner
```

## Step 5: Crew Definition (crew.py)

```python
from crewai import CrewBase, agent, task, crew, Process
import json

@CrewBase
class ExhibitionCrew:
    agents_config = "config/agents.yaml"
    tasks_config = "config/tasks.yaml"
    
    def __init__(self):
        with open("repos.json") as f:
            repos = json.load(f)
        self.repos_list = ", ".join(r["full_name"] for r in repos)
    
    @agent
    def pr_velocity_analyst(self) -> Agent: ...
    
    @agent
    def dependency_drift_analyst(self) -> Agent: ...
    
    @agent
    def code_churn_analyst(self) -> Agent: ...
    
    @agent
    def security_scanner(self) -> Agent: ...
    
    @task
    def pr_velocity_analysis(self) -> Task: ...
    
    @task
    def dependency_drift_analysis(self) -> Task: ...
    
    @task
    def code_churn_analysis(self) -> Task: ...
    
    @task
    def security_scan(self) -> Task: ...
    
    @crew
    def crew(self) -> Crew:
        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.parallel,
            verbose=True,
        )
```

Implement this fully with all agent and task method bodies.

## Step 6: Entry Points

### run_exhibition.py
```python
# Load repos, instantiate ExhibitionCrew, call crew.kickoff()
# Log results, handle errors, exit with appropriate code
```

### run_curator.py
```python
# Instantiate a single-agent crew with a curator agent
# Curator reads manifest, evaluates freshness, archives/refreshes
# Same decay_class thresholds as OpenClaw version
```

### run_diagnostics.py
```python
# Accept --exhibit flag with filepath
# Instantiate diagnostic agent, read exhibit, compare vs GitHub reality
# Report error source and recommended fix
```

## Step 7: Scheduling

### Option A: System cron
```crontab
0 */6 * * * cd /home/user/github-exhibition-crewai && uv run python src/run_exhibition.py
0 3 * * 0 cd /home/user/github-exhibition-crewai && uv run python src/run_curator.py
```

### Option B: Trigger.dev (write this file)
```typescript
// trigger.ts
import { schedules } from "@trigger.dev/sdk/v3";

export const exhibitionCycle = schedules.task({
  id: "exhibition-crew-cycle",
  cron: "0 */6 * * *",
  run: async () => {
    // Shell exec run_exhibition.py
    // Log results
    // On failure, send notification
  },
});

export const curatorCycle = schedules.task({
  id: "exhibition-curator",
  cron: "0 3 * * 0",
  run: async () => {
    // Shell exec run_curator.py
  },
});
```

## Step 8: Display Surface

Same as Prompt 1 Step 9. Build the React + Motion cycling display surface. It is framework-agnostic; it reads manifest.json and serves HTML files. The display surface is identical regardless of whether OpenClaw or CrewAI produces the exhibits.

## Step 9: HTML Templates

Same templates as Prompt 1 Step 2-3. The templates are framework-agnostic.

## Step 10: Integration Test

Write a pytest test suite:
1. Test each tool individually with a real public repo
2. Test a single agent + task in isolation (mock the tool if needed for CI)
3. Test the full crew with 1 repo (integration test, requires GitHub token)
4. Test the curator with a manifest containing exhibits of varying ages
5. Test the diagnostician with a deliberately wrong exhibit

## Environment Requirements
- Python 3.12+
- uv for dependency management
- GITHUB_TOKEN in environment
- ANTHROPIC_API_KEY or OPENAI_API_KEY for CrewAI LLM backend
```

---

## Prompt 3: Google ADK Implementation

```
# Build: Agentic GitHub Exhibition System (Google ADK)

## What This Is

Same system as described above. Google ADK implementation using ParallelAgent for concurrent role-agent execution and SequentialAgent for the analyze-then-assemble pipeline.

## Architecture

A Python application using Google ADK. The root agent is a SequentialAgent containing:
1. A ParallelAgent wrapping 4 role-scoped LlmAgents (PR, dependency, churn, security)
2. An assembler LlmAgent that reads all results from session state and updates the manifest

Triggered by Cloud Scheduler → Cloud Run, or system cron locally.

## Project Structure

```
github-exhibition-adk/
├── pyproject.toml
├── repos.json
├── agent.py                          # Root agent definition (ADK convention)
├── tools/
│   ├── __init__.py
│   ├── github_tools.py               # Async GitHub API tools (FunctionTool)
│   ├── exhibit_tools.py              # Async artifact writing tools
│   └── registry_tools.py             # Async package registry lookup tools
├── templates/                        # Same HTML templates
├── exhibits/
│   └── manifest.json
├── display/                          # Same React + Motion display surface
├── Dockerfile
└── deploy.sh                         # Cloud Run deployment script
```

## Step 1: Tools (Async, Production-Grade)

ALL tools must be async (this is critical for ADK parallel execution). Use aiohttp for HTTP.

```python
# tools/github_tools.py
import aiohttp
import os
from datetime import datetime, timedelta

async def fetch_pull_requests(repo: str, state: str = "all", days: int = 14) -> dict:
    """Fetch pull requests for a GitHub repository.
    repo: owner/name format
    state: open, closed, all
    days: only PRs updated within this window
    Returns dict with: repo, prs (list of PR objects), fetch_timestamp"""
    token = os.environ["GITHUB_TOKEN"]
    since = (datetime.utcnow() - timedelta(days=days)).isoformat() + "Z"
    headers = {"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json"}
    
    all_prs = []
    page = 1
    async with aiohttp.ClientSession() as session:
        while True:
            url = f"https://api.github.com/repos/{repo}/pulls"
            params = {"state": state, "per_page": 100, "page": page, "sort": "updated", "direction": "desc"}
            async with session.get(url, headers=headers, params=params) as resp:
                if resp.status == 403:
                    reset = int(resp.headers.get("X-RateLimit-Reset", 0))
                    return {"error": "rate_limited", "reset_at": reset}
                if resp.status != 200:
                    return {"error": f"http_{resp.status}", "body": await resp.text()}
                prs = await resp.json()
                if not prs:
                    break
                # Filter by date
                for pr in prs:
                    if pr["updated_at"] >= since:
                        all_prs.append({
                            "number": pr["number"],
                            "title": pr["title"],
                            "author": pr["user"]["login"],
                            "state": pr["state"],
                            "created_at": pr["created_at"],
                            "updated_at": pr["updated_at"],
                            "merged_at": pr.get("merged_at"),
                            "additions": pr.get("additions", 0),
                            "deletions": pr.get("deletions", 0),
                            "changed_files": pr.get("changed_files", 0),
                            "draft": pr.get("draft", False),
                            "labels": [l["name"] for l in pr.get("labels", [])],
                        })
                page += 1
                if len(prs) < 100:
                    break
    
    return {"repo": repo, "prs": all_prs, "count": len(all_prs), "fetch_timestamp": datetime.utcnow().isoformat()}

# Similarly implement:
# async def fetch_commit_activity(repo: str, days: int = 30) -> dict:
# async def fetch_dependency_manifest(repo: str) -> dict:
# async def fetch_security_advisories(repo: str) -> dict:
# async def write_exhibit(repo_slug: str, exhibit_type: str, html: str, narrative: str, relevance: float) -> dict:
# async def read_manifest() -> dict:
# async def update_manifest(exhibit_id: str, updates: dict) -> dict:
```

Implement ALL of these tools fully with pagination, rate limiting, and error handling.

## Step 2: Agent Definition (agent.py)

```python
from google.adk.agents.llm_agent import LlmAgent
from google.adk.agents.parallel_agent import ParallelAgent
from google.adk.agents.sequential_agent import SequentialAgent
from google.adk.tools import FunctionTool
from tools.github_tools import fetch_pull_requests, fetch_commit_activity, fetch_dependency_manifest, fetch_security_advisories
from tools.exhibit_tools import write_exhibit, read_manifest, update_manifest
import json

MODEL = "gemini-2.5-flash"

# Load repos
with open("repos.json") as f:
    repos = json.load(f)
repos_str = ", ".join(r["full_name"] for r in repos)

# --- Role Agents ---
pr_agent = LlmAgent(
    name="PRVelocityAnalyst",
    model=MODEL,
    instruction=f"""You are the PR Velocity Analyst for the GitHub Exhibition System.

Analyze pull request patterns for these repositories: {repos_str}

For each repository:
1. Call fetch_pull_requests to get open and recent PRs
2. Calculate velocity metrics: avg time-to-merge, abandonment risk per open PR, velocity trend
3. Identify the single most important action per repo
4. Write an interpretive narrative (2-3 sentences explaining what matters, not listing data)
5. Generate a self-contained HTML/D3.js visualization:
   - Dark theme: #0a0a0f background, #e0e0e0 text, #58a6ff accent
   - Horizontal bar chart of open PR ages (green < 2d, yellow 2-5d, red > 5d)
   - Sparkline of 14-day merge velocity
   - Author reliability badges
   - Narrative paragraph at top
   - Metadata bar at bottom (repo, type, timestamp)
   - Font: monospace
   - No external dependencies except D3.js v7 CDN
6. Call write_exhibit for each repo

Relevance scoring: 0.9+ for critical stale PRs, 0.5-0.7 for normal activity, 0.2-0.4 for no open PRs.""",
    tools=[FunctionTool(fetch_pull_requests), FunctionTool(write_exhibit)],
    output_key="pr_results",
    description="Analyzes PR velocity and produces interactive visualizations."
)

# Define dep_agent, churn_agent, security_agent similarly with their respective tools and instructions.
# WRITE THESE OUT FULLY. Do not stub them.

# --- Parallel Swarm ---
analysis_swarm = ParallelAgent(
    name="AnalysisSwarm",
    sub_agents=[pr_agent, dep_agent, churn_agent, security_agent]
)

# --- Assembler ---
assembler = LlmAgent(
    name="ExhibitAssembler",
    model=MODEL,
    instruction="""All analysis agents have completed. Review the session state:
    - PR results: {pr_results}
    - Dependency results: {dep_results}
    - Churn results: {churn_results}
    - Security results: {security_results}
    
    Read the current manifest using read_manifest.
    Increment cycles_shown for all existing exhibits.
    Verify all new exhibits were written successfully.
    Report a summary: how many exhibits produced, any failures, overall portfolio health.""",
    tools=[FunctionTool(read_manifest), FunctionTool(update_manifest)],
    output_key="assembly_report"
)

# --- Root Pipeline ---
root_agent = SequentialAgent(
    name="ExhibitionPipeline",
    sub_agents=[analysis_swarm, assembler],
    description="Runs all analysis agents in parallel, then assembles results."
)
```

Write ALL four role agents fully with complete instructions, tools, and output_keys.

## Step 3: Runner Script

Write a __main__.py or run.py that:
1. Creates an InMemoryRunner or similar ADK runner
2. Creates a session with repos loaded into initial state
3. Invokes root_agent
4. Logs the assembly_report
5. Exits cleanly

## Step 4: Deployment

Write deploy.sh and Dockerfile for Cloud Run deployment with Cloud Scheduler trigger.

## Step 5: Display Surface

Same as Prompt 1 Step 9.

## Step 6: Tests

Write pytest tests with:
- Async tool tests against real GitHub API
- Agent integration tests with 1 repo
- Full pipeline test

## Environment
- Python 3.12+
- GITHUB_TOKEN
- GOOGLE_API_KEY (for Gemini)
- uv for dependency management
```

---

## Prompt 4: LangGraph Implementation (Abbreviated)

```
# Build: Agentic GitHub Exhibition System (LangGraph)

## Note: LangGraph is likely overkill for this pattern (independent, non-overlapping
## agents with no conditional routing). This prompt exists for comparison. If you
## have a choice, use OpenClaw or CrewAI instead.

## Architecture

A Python LangGraph application with a StateGraph implementing fan-out/fan-in:
- START fans out to 4 parallel analysis nodes
- All 4 converge on an assembler node
- Assembler node writes to END

## Key Differences from Other Implementations

1. State must be defined as a TypedDict with Annotated fields using operator.add
   for list merging across parallel branches
2. Each node is an async function that creates a react agent internally
3. Tools are @tool decorated functions (same as CrewAI but using langchain_core)
4. Scheduling requires LangSmith Deployment (paid) or external cron

## Implementation

Write the complete implementation following the same tool, template, and display
surface patterns as the other prompts. The LangGraph-specific code is:

1. ExhibitionState TypedDict with fields for each agent's output
2. Four async node functions (pr_analysis, dep_analysis, churn_analysis, security_scan)
3. An assemble node function
4. StateGraph with fan-out edges from START and fan-in edges to assemble
5. Compiled graph with .ainvoke() entry point

Use ChatAnthropic(model="claude-sonnet-4-20250514") as the LLM.

The tools, templates, display surface, and exhibit format are identical
to the other implementations. Only the orchestration layer changes.

Write the full implementation, not stubs. Include the graph definition,
all node functions, all tools, and the runner script.
```

---

## Display Surface Prompt (Framework-Agnostic)

This prompt is shared across all implementations. The display surface is the same regardless of which agent framework produces the exhibits.

```
# Build: GitHub Exhibition Display Surface

## What This Is

A React + Motion (Framer Motion) single-page application that displays
self-contained HTML exhibit visualizations produced by an external agent system.
It reads a manifest.json file, renders exhibits in a grid, and auto-cycles
through them when idle.

## This is NOT a dashboard. It is an exhibition.

Do not use react-grid-layout. Do not make widgets draggable. This is a
cycling gallery of agent-generated visual artifacts, not an interactive
dashboard with configurable layouts.

## Tech Stack
- Vite + React 18 + TypeScript
- framer-motion (Motion v11+) for all animations
- CSS modules for styling (no Tailwind, no styled-components)
- No other UI libraries

## Data Contract

The display surface reads from:
- exhibits/manifest.json: array of exhibit entries
- exhibits/{date}/{type}-{repo}.html: self-contained HTML files

Manifest entry shape:
```typescript
interface ExhibitEntry {
  id: string;              // unique identifier
  repo: string;            // e.g., "facebook/react"
  exhibit_type: string;    // e.g., "pr-velocity"
  filepath: string;        // relative path to HTML file
  created_at: string;      // ISO timestamp
  relevance_score: number; // 0.0 - 1.0
  decay_class: "fast" | "medium" | "slow";
  cycles_shown: number;    // how many times displayed
  status: "fresh" | "active" | "stale" | "archived";
  narrative: string;       // agent's interpretive summary
}
```

## Visual Design

### Theme
- Background: #0a0a0f
- Surface: #111118
- Card background: #1a1a2e
- Text primary: #e0e0e0
- Text secondary: #8b8b8b
- Accent: #58a6ff
- Warning: #f85149
- Success: #3fb950
- Font: JetBrains Mono, monospace

### Top Bar
- Left: "EXHIBITION SYSTEM" in small caps, 14px
- Center: "{n} EXHIBITS ACTIVE" with count
- Right: "LAST UPDATE {timestamp}" with pulsing green dot
- Height: 48px, border-bottom: 1px solid #222

### Grid View (default)
- CSS Grid, auto-fill columns, minmax(400px, 1fr)
- Gap: 24px, padding: 24px
- Each exhibit card:
  - 16:9 aspect ratio container
  - iframe rendering the exhibit HTML (sandbox="allow-scripts")
  - Below iframe: repo name, exhibit type badge, freshness dot
  - Subtle hover: scale(1.02), border glow matching accent color
  - Click: expand to full viewport

### Fullscreen View
- AnimatePresence with layoutId for smooth card-to-fullscreen transition
- Exhibit fills viewport minus 48px top bar
- Close button (X) top-right, or click outside, or Escape key
- In idle cycling mode, this is the default view

### Idle Cycling
- Trigger: 30 seconds of no mouse/keyboard/touch interaction
- Behavior:
  - Switch to fullscreen view
  - Display each exhibit for 8 seconds
  - Progress bar at bottom (thin, accent color, animates width 0% → 100% over 8s)
  - Transition between exhibits: AnimatePresence mode="wait"
    - Exit: opacity 0, scale 0.98, duration 0.3s
    - Enter: opacity 1, scale 1, duration 0.3s
  - Cycle order: sort by relevance_score descending, then by created_at descending
  - Skip archived exhibits
- Resume: any interaction pauses cycling, returns to grid view
- Re-enter: 30 seconds of no interaction after returning to grid

### Freshness Indicators
Per exhibit, based on age vs decay_class threshold:
- decay thresholds: fast=2 days, medium=5 days, slow=14 days
- < 25% of threshold: pulsing green dot (CSS animation, subtle)
- 25-75%: solid green dot
- 75-100%: yellow dot
- > 100%: red dot

### Motion Configuration
- Layout transitions: spring, stiffness 250, damping 28
- Card hover: spring, stiffness 400, damping 25
- Content transitions: tween, duration 0.3, ease "easeInOut"
- Respect prefers-reduced-motion: disable all animations, instant transitions

## Components

### App.tsx
- Fetches manifest.json on mount, polls every 30 seconds
- Manages view state: "grid" | "fullscreen"
- Manages cycling state: "idle" | "active" | "paused"
- Passes exhibit data to child components

### ExhibitGrid.tsx
- Renders grid of ExhibitCard components
- Sorted by relevance_score descending

### ExhibitCard.tsx
- Single exhibit in grid view
- iframe with srcdoc or src
- Metadata below iframe
- Click handler to expand

### FullscreenExhibit.tsx
- Single exhibit filling viewport
- layoutId animation from card position
- Close handler

### CyclingController.tsx
- Manages idle detection timer
- Manages which exhibit is currently displayed
- Manages progress bar animation
- Exposes pause/resume methods

### FreshnessDot.tsx
- Calculates freshness from created_at + decay_class
- Renders appropriate colored dot with optional pulse animation

## Build and Serve

```bash
npm create vite@latest display -- --template react-ts
cd display
npm install framer-motion
npm run dev        # Development
npm run build      # Production build
npx serve dist     # Serve production build
```

The built app should be servable as static files from any web server.
In production, serve from the same directory as the exhibits/ folder,
or configure the exhibit base URL as an environment variable.
```
