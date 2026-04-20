# RepoVis VS Code Panel Specification
## Compact PR & Context Visualization with Guided Tour

---

## Overview

An always-visible VS Code panel occupying 1/4 to 1/8 of screen real estate that **automatically cycles through different views** — a guided tour of your repository state.

**Core Pattern**: **Temporal Progressive Disclosure** — instead of clicking to expand, artifacts rotate into view automatically. You glance, absorb, and it moves to the next insight.

**Analogy**: Like a weather channel cycling through conditions, or a digital photo frame showing memories. Everything important gets "air time" whether you actively engage or not.

---

## The Guided Tour Pattern

### Auto-Cycling Architecture

```
┌─────────────────────────────────────────┐
│  RepoVis Panel (Auto-Cycling)          │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  [Artifact 1: File Train]       │   │  ← 10 seconds
│  │  🚂 auth.ts → tests/ → docs/    │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ● ○ ○ ○ ○  (Artifact 2 of 5)          │  ← Progress indicator
│                                         │
│  [▶/⏸] [Explore] [Skip →]             │  ← Optional controls
└─────────────────────────────────────────┘
```

**Rotation Behavior**:
- Each artifact displays for **8-15 seconds** (configurable)
- Smooth cross-fade or slide transition between artifacts
- Cycle repeats automatically
- Pauses temporarily on user interaction (hover/click)
- Resumes after 5 seconds of inactivity

### Artifact Catalog

The system cycles through **dozens of artifact types**, each a complete, self-contained insight:

#### Category 1: Current Work

| Artifact | Duration | What's Shown |
|----------|----------|--------------|
| **File Train** | 10s | Changed files as connected cars (color = type, size = changes) |
| **Dependency Web** | 12s | Mini force graph showing which files touch each other |
| **Change Heatmap** | 8s | Grid of files, brightness = recency, color = type |
| **Diff Summary** | 10s | Lines added/removed by file type (code vs test vs doc) |

#### Category 2: Context & History

| Artifact | Duration | What's Shown |
|----------|----------|--------------|
| **Today's Timeline** | 12s | Micro heatmap of commit activity (9am-6pm) |
| **Commit Sequence** | 10s | Last 5 commits as cards with messages |
| **Branch Lineage** | 10s | How current branch diverged from main |
| **Author Fingerprint** | 8s | "You + 2 collaborators today" avatars |

#### Category 3: Quality & Risk

| Artifact | Duration | What's Shown |
|----------|----------|--------------|
| **Risk Radar** | 12s | 5-dimension chart: size, complexity, test coverage, conflicts, review status |
| **Impact Zone** | 10s | Files that import the files you're changing |
| **Test Gap** | 8s | Changed code without corresponding test changes |
| **Review Status** | 10s | PR checks, approvals, comments needing attention |

#### Category 4: Relationship & Dependencies

| Artifact | Duration | What's Shown |
|----------|----------|--------------|
| **Import Constellation** | 12s | Your files as nodes, lines = import relationships |
| **Shared Ownership** | 10s | "Alice also touched 3 of these files this week" |
| **Cross-Repo Links** | 10s | Related changes in other repos (if applicable) |
| **Upstream/Downstream** | 10s | What's blocked on this / what this depends on |

#### Category 5: Narrative & Story

| Artifact | Duration | What's Shown |
|----------|----------|--------------|
| **Work Summary** | 15s | LLM-generated: "Refactoring auth, 3 files changed, tests pending" |
| **Pattern Match** | 10s | "Similar to PR #387 from last month" |
| **Intent Guess** | 10s | LLM: "Looks like you're adding OAuth based on file names" |
| **Next Suggested** | 8s | "Consider: adding test, updating docs, checking conflicts" |

#### Category 6: Ambient/Aesthetic

| Artifact | Duration | What's Shown |
|----------|----------|--------------|
| **Breathing Stats** | 10s | Minimal numbers that pulse/animate (zen mode) |
| **Code Weather** | 12s | Abstract visualization: stormy = lots of changes, calm = stable |
| **Progress Ring** | 10s | Circular progress toward PR completion |
| **Activity Pulse** | 8s | EKG-style line showing commit cadence |

---

## Layout Modes

### Mode A: Cinema Display (1/4 screen)

Full artifact display with room for detail:

```
┌─────────────────────────────────────────┐
│  FILE EXPLORER  │  EDITOR               │
│                 │                       │
│                 │                       │
│                 │                       │
│                 │                       │
│                 │                       │
│                 ├───────────────────────┤
│                 │  REPOVIS CINEMA       │
│                 │  ┌─────────────────┐  │
│                 │  │                 │  │
│                 │  │  [ARTIFACT      │  │  ← Large, readable
│                 │  │   DISPLAYS      │  │
│                 │  │   HERE]         │  │
│                 │  │                 │  │
│                 │  │                 │  │
│                 │  └─────────────────┘  │
│                 │  ● ○ ○ ○ ○  Auto      │
│                 └───────────────────────┘
```

### Mode B: Ticker Strip (1/8 screen)

Ultra-compact, essential info only:

```
┌─────────────────────────────────────────┐
│  EDITOR                                 │
│                                         │
│                                         │
│                                         │
├─────────────────────────────────────────┤
│ REPOVIS TICKER                          │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐    │
│ │7 file│ │+420  │ │⚠️ 2  │ │✓ tests│   │  ← Rotating cards
│ │change│ │lines │ │risks │ │pass  │   │
│ └──────┘ └──────┘ └──────┘ └──────┘    │
└─────────────────────────────────────────┘
```

### Mode C: Dashboard Grid (1/4 screen)

Multiple mini-artifacts visible simultaneously:

```
┌─────────────────────────────────────────┐
│ REPOVIS DASHBOARD                       │
│ ┌──────────┐ ┌──────────┐              │
│ │ 🚂 Files │ │ ⏱️ Today │              │
│ │ 7 changed│ │ ▓▓▓░░▓▓▓ │              │
│ └──────────┘ └──────────┘              │
│ ┌──────────┐ ┌──────────┐              │
│ │ ⚠️ Risk  │ │ 👥 Who   │              │
│ │ medium   │ │ You+2    │              │
│ └──────────┘ └──────────┘              │
│         [Cycles in 8s]                 │
└─────────────────────────────────────────┘
```

---

## User Interaction Model

### Primary: Passive Observation (90% of time)

You glance over. The panel shows something. You understand it. You keep working.

**No action required.** The system ensures important information rotates into view.

### Secondary: Soft Interaction (10% of time)

| Action | Effect |
|--------|--------|
| **Hover** | Pauses cycle temporarily (5s), shows tooltip with extra detail |
| **Click artifact** | Opens that view in detail (main editor or expanded panel) |
| **Click pause** | Stops rotation, stays on current artifact |
| **Click skip** | Advances to next artifact immediately |
| **Click explore** | Opens full detail view of current artifact |

### Keyboard Shortcuts

```
Ctrl+Shift+R      → Toggle RepoVis panel
Ctrl+Shift+Space  → Pause/resume cycling
Ctrl+Shift+→      → Skip to next artifact
Ctrl+Shift+←      → Go back to previous
Ctrl+Shift+↑      → Expand current artifact
```

---

## LLM Integration (Background Population)

### Three-Tier System

**Tier 1: Instant (Local)**
- File classification (regex)
- Line counting
- Git status parsing
- **Result**: Basic artifacts immediately available

**Tier 2: Fast (Cloud - 2-3s)**
- Change summarization
- Risk assessment
- Pattern detection
- **Result**: Enriched artifacts pop in as they complete

**Tier 3: Deep (Cloud - 5-10s)**
- Architecture analysis
- Historical comparison
- Narrative generation
- **Result**: Premium artifacts with full insight

### Progressive Artifact Enhancement

Artifacts **upgrade in place** as better data arrives:

```
Initial load (Tier 1):
┌─────────────────────────────────┐
│ 🚂 Files Changed: 7             │
│ (analyzing...)                  │
└─────────────────────────────────┘

After 2s (Tier 2 arrives):
┌─────────────────────────────────┐
│ 🚂 Auth Refactoring in Progress │
│ 7 files | Medium risk detected  │
└─────────────────────────────────┘

After 8s (Tier 3 arrives):
┌─────────────────────────────────┐
│ 🚂 OAuth Implementation         │
│ 7 files | ⚠️ utils.ts widely    │
│ used | Consider adding tests    │
└─────────────────────────────────┘
```

---

## Artifact Detail: Examples

### Artifact: File Train

```
┌─────────────────────────────────────────┐
│ 🚂 Current Work (7 files)              │
│                                         │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐  │
│  │🟠│→│🔵│→│🟢│→│🟠│→│⚪│→│🔵│→│🟠│  │
│  │au│ │te│ │do│ │mi│ │RE│ │st│ │ty│  │
│  └──┘ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘  │
│  auth test doc  mid  RE   st   ty    │
│                                         │
│  🟠 = code  🔵 = test  🟢 = doc       │
│  Car size = change magnitude           │
│                                         │
│         [8s] → Risk Radar              │
└─────────────────────────────────────────┘
```

### Artifact: Risk Radar

```
┌─────────────────────────────────────────┐
│ ⚠️ Risk Assessment                      │
│                                         │
│        Size ●━━━━━━●━━━━○               │
│            /          \                 │
│   Complexity ●        ● Test Coverage   │
│            \          /                 │
│     Conflict ●━━━━━━● Review            │
│              Status                     │
│                                         │
│  MEDIUM RISK: Large change to widely    │
│  imported file without test coverage    │
│                                         │
│         [12s] → Dependency Web          │
└─────────────────────────────────────────┘
```

### Artifact: Today's Timeline

```
┌─────────────────────────────────────────┐
│ ⏱️ Your Activity Today                  │
│                                         │
│  9   10  11  12   1   2   3   4   5   │
│  │    │   │   │    │   │   │   │   │  │
│  ░░▓▓▓░░░▓▓▓▓▓▓░░░░▓▓░░░▓▓▓▓░░░▓░░  │
│      ↑      ↑    ↑        ↑             │
│    commit  deep  lunch   latest         │
│    burst   work          commit         │
│                                         │
│  4 commits | +420/-85 lines | 3 breaks │
│                                         │
│         [10s] → Commit Sequence         │
└─────────────────────────────────────────┘
```

### Artifact: Work Summary (LLM)

```
┌─────────────────────────────────────────┐
│ 📝 What You're Building                 │
│                                         │
│  "Implementing OAuth 2.0 authentication │
│   flow with token refresh. Main work    │
│   in auth.ts and new token-manager.     │
│   Tests added, documentation pending."  │
│                                         │
│  Confidence: 85% | Based on: file names │
│  imports, commit messages               │
│                                         │
│  Similar to: PR #387 (Nov 2024)         │
│                                         │
│         [15s] → File Train              │
└─────────────────────────────────────────┘
```

---

## Configuration

```typescript
interface RepoVisConfig {
  // Cycling behavior
  autoCycle: boolean;
  artifactDuration: number;      // Base seconds per artifact
  pauseOnHover: boolean;
  pauseDuration: number;         // Seconds to pause after interaction
  
  // Which artifacts to show
  enabledArtifacts: ArtifactType[];
  artifactOrder: 'auto' | 'priority' | 'custom';
  customOrder: ArtifactType[];
  
  // LLM settings
  llmProvider: 'openai' | 'anthropic' | 'local';
  llmTier2Enabled: boolean;
  llmTier3Enabled: boolean;
  
  // Display mode
  mode: 'cinema' | 'ticker' | 'dashboard';
  position: 'sidebar' | 'panel' | 'statusBar';
  
  // Privacy
  privacyLevel: 'local-only' | 'sanitized' | 'full';
  shareWithLLM: boolean;
}
```

---

## Smart Artifact Selection

The system doesn't just cycle randomly — it **intelligently orders artifacts** based on context:

### Priority Algorithm

```typescript
function selectNextArtifact(context: RepoContext): Artifact {
  const candidates = getEnabledArtifacts();
  
  // Boost priority based on:
  const scored = candidates.map(a => ({
    ...a,
    score: 
      a.relevanceToContext(context) * 0.4 +
      a.userEngagementHistory * 0.3 +
      a.urgency(context) * 0.2 +
      a.timeSinceLastShown * 0.1
  }));
  
  // Always show high-urgency artifacts
  if (hasHighUrgencyEvent(context)) {
    return findUrgentArtifact(scored);
  }
  
  // Otherwise, weighted random from top 3
  return weightedRandom(top3(scored));
}
```

### Context-Aware Examples

| Situation | Priority Artifacts |
|-----------|-------------------|
| CI just failed | Risk Radar, Review Status |
| Large PR (20+ files) | Impact Zone, File Train |
| No commits in 2 hours | Today's Timeline, Activity Pulse |
| Merge conflict detected | Conflict map, Branch Lineage |
| Review requested | Review Status, Shared Ownership |
| End of day | Progress Ring, Work Summary |

---

## Technical Implementation

### State Machine

```typescript
type CycleState = 
  | { type: 'playing'; artifact: Artifact; remainingMs: number }
  | { type: 'paused'; artifact: Artifact; pauseEndTime: number }
  | { type: 'transitioning'; from: Artifact; to: Artifact; progress: number };

const cycleMachine = createMachine({
  id: 'artifactCycle',
  initial: 'playing',
  states: {
    playing: {
      after: {
        [context.duration]: 'transitioning'
      },
      on: {
        HOVER: 'paused',
        CLICK_PAUSE: 'paused',
        SKIP: 'transitioning'
      }
    },
    paused: {
      after: {
        PAUSE_DURATION: 'playing'
      },
      on: {
        UNHOVER: 'playing',
        CLICK_PLAY: 'playing',
        SKIP: 'transitioning'
      }
    },
    transitioning: {
      after: {
        TRANSITION_DURATION: 'playing'
      }
    }
  }
});
```

### Rendering Strategy

```typescript
// Pre-render next artifact for smooth transitions
const ArtifactCarousel: React.FC = () => {
  const [current, setCurrent] = useState<Artifact>(artifacts[0]);
  const [next, setNext] = useState<Artifact>(artifacts[1]);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // Pre-load next artifact data
  useEffect(() => {
    preloadArtifact(next);
  }, [next]);
  
  const advance = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrent(next);
      setNext(selectNextArtifact());
      setIsTransitioning(false);
    }, TRANSITION_DURATION);
  };
  
  return (
    <div className="carousel">
      <ArtifactView 
        artifact={current} 
        className={isTransitioning ? 'exit' : 'active'}
      />
      <ArtifactView 
        artifact={next} 
        className={isTransitioning ? 'enter' : 'next'}
      />
    </div>
  );
};
```

---

## Summary

**The Core Innovation**: Information finds you. You don't hunt for it.

- **No digging through menus**
- **No clicking to expand**
- **No memorizing shortcuts**

Just **glance, absorb, continue**. The guided tour ensures everything important gets seen — whether you're passively aware or actively engaged.

---

*VS Code extension spec for ambient repository awareness through auto-cycling artifact displays.*
