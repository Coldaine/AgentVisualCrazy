# Visual Patterns: Agent Flow

> Extracted from vendored `third_party/agent-flow/` — the live agent visualization VS Code extension by Simon Patole.
> Original: https://github.com/patoles/agent-flow

## What Agent Flow Is

A **real-time visualization of Claude Code agent orchestration** built as a VS Code extension. It renders agent sessions as an interactive node graph showing how agents think, branch, coordinate, make tool calls, and complete tasks.

**This is the single most important visual reference for shadow-agent.** It already solves the "show an agent session as a live visual" problem. Shadow-agent should absorb its visual language and surpass it.

---

## 1. Design Language: Holographic / Cyberpunk

The entire UI adopts a **holographic, cyberpunk aesthetic** — deep space backgrounds, cyanotic glows, particle trails.

### Color Palette (`web/lib/colors.ts`)

```
void:             #050510   (deep space background)
hexGrid:          #0d0d1f   (hex pattern grid)
holoBase:         #66ccff   (cyan primary)
holoBright:       #aaeeff   (bright cyan)
holoHot:          #ffffff   (white hot)

Agent States:
  idle:               #66ccff   (cyan)
  thinking:           #66ccff   (cyan pulse)
  tool_calling:       #ffbb44   (amber — "expensive, watch!")
  complete:           #66ffaa   (neon green)
  error:              #ff5566   (crimson)
  paused:             #888899   (gray)
  waiting_permission: #ffaa33   (orange)

Subagent:         #cc88ff   (purple)
System events:    #555577   (soft gray)
```

All colors use **heavy alpha transparency** (0.03–0.25) for a glass/holographic effect.

### Glassmorphism (`web/app/globals.css`)

```css
.glass-card {
  background: rgba(10, 15, 30, 0.7);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(100, 200, 255, 0.15);
  border-radius: 8px;
  box-shadow:
    0 0 20px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(100, 200, 255, 0.08);
}

.glass-card::before {
  /* Glowing top edge */
  background: linear-gradient(90deg, transparent, rgba(100, 200, 255, 0.15), transparent);
}
```

Scale-in/scale-out animations (0.2s ease-out) for mount/unmount.

---

## 2. Rendering: Custom Canvas2D + D3-Force Physics

**No React Flow. No Three.js.** Agent-flow uses **raw Canvas2D rendering** with **D3-Force** for physics simulation.

### Dependencies (minimal)

```
d3-force: ^3.0.0     # Physics simulation for graph layout
react: 19.2.4         # Framework
next: 16.1.6          # Web/webview bundling
tailwindcss: ^4.2.0   # Styling
tw-animate-css: 1.3.3 # Animation utilities
```

### The Draw Loop

```
Canvas2D draw loop:
├── drawAgents()      — hexagon nodes + context ring + glow
├── drawEdges()       — tapered bezier curves
├── drawParticles()   — comet trails flowing along edges
├── drawToolCalls()   — tool cards + spinning rings
├── drawDiscoveries() — found items floating toward targets
└── bloom post-processing — additive glow overlay
```

### Agent Nodes (Hexagons)

Agents are rendered as **hexagonal nodes** with:
- **Context ring**: Proportional donut chart showing token breakdown (system prompt, user messages, tool results, reasoning, subagent results)
- **Status glow**: Pulsing colored aura matching agent state
- **Message bubbles**: Queued text shown directly on canvas near the node
- **Scale/opacity animation**: Smooth entry/exit

### Edges (Tapered Bezier Curves)

Connections between agents use **tapered bezier paths** — thicker at the source, thinner at the destination. Not straight lines.

### Particles (Data Flow Visualization)

```typescript
interface Particle {
  edgeId: string        // Which edge it flows on
  progress: number      // 0 = start, 1 = end
  type: 'dispatch' | 'return' | 'tool_call' | 'tool_return' | 'message'
  color: string
  size: number
  trailLength: number
  label?: string        // "auth.ts 142 lines", "permission request"
}
```

Particles flow along edges as **comet trails** with labels, creating a visual sense of data moving through the system.

### Tool Call Cards

Tools are rendered as **floating cards** near their parent agent with:
- Tool name
- Running state indicator (spinning ring animation)
- Human-readable args summary (e.g., "read: auth.ts")
- Token cost when completed
- Error state with message

### Discoveries

When an agent finds something important (file, pattern, code), a **discovery node** animates from the tool call toward a target position, showing what was found.

---

## 3. Panel Layout

The UI layers multiple floating panels over the full-screen canvas:

```
┌───────────────────────────────────────────────────┐
│ Top Bar (session tabs, connection status, toggles) │
├──────────┬────────────────────────────────────────┤
│ Message  │                                         │
│ Feed     │         CANVAS (full screen)            │
│ Panel    │    hexagon agents + particles + tools    │
│ (left)   │                                         │
│          │         [Agent Detail Card]              │
│          │         (floating, tethered)             │
│          │                                         │
│          │                          ┌─────────────┤
│          │                          │ Chat Panel   │
│          │                          │ (bottom-right)│
├──────────┴──────────────────────────┴─────────────┤
│ Control Bar (play/pause/seek/speed)                │
├───────────────────────────────────────────────────┤
│ Timeline Panel (Gantt-style, slide-in bottom)      │
└───────────────────────────────────────────────────┘
│ File Attention Panel (slide-in right)              │
│ Session Transcript Panel (slide-in right)          │
```

### Z-Index Hierarchy

```typescript
info: 10, sidePanel: 40, controlBar: 50, chatPanel: 50,
transcriptPanel: 60, detailCard: 100, contextMenu: 200
```

---

## 4. Event Model

### Event Types

```
agent_spawn, agent_complete, agent_idle,
message, context_update, model_detected,
tool_call_start, tool_call_end,
subagent_dispatch, subagent_return,
permission_requested, error
```

### Agent Data Model

```typescript
interface Agent {
  id: string
  name: string
  state: AgentState
  parentId: string | null
  tokensUsed: number
  tokensMax: number
  contextBreakdown: {
    systemPrompt: number
    userMessages: number
    toolResults: number     // Expensive!
    reasoning: number
    subagentResults: number
  }
  toolCalls: number
  timeAlive: number
  x: number, y: number     // Canvas position
  vx: number, vy: number   // Velocity (d3-force)
  pinned: boolean
  isMain: boolean
  messageBubbles: MessageBubble[]
}
```

---

## 5. Architecture: Event Pipeline

```
Extension Host (Node.js)
├── HookServer (HTTP) ← Claude Code hooks
│   └── Transforms hook payloads → AgentEvent
├── SessionWatcher ← JSONL transcript files
│   └── Parses transcript → AgentEvent
└── VisualizerPanel
    └── postMessage() → Webview

Webview (React)
├── vscodeBridge ← window.message events
├── useAgentSimulation (animation loop)
│   ├── processEvent() → mutate SimulationState
│   ├── d3-force simulation → physics
│   └── computeNextFrame() → positions, opacity
└── Canvas2D draw loop
    ├── drawAgents(), drawEdges(), drawParticles()
    ├── drawToolCalls(), drawDiscoveries()
    └── bloom post-processing
```

---

## 6. What Shadow-Agent Should Steal

### Must-Have

| Pattern | Why |
|---------|-----|
| Holographic color palette | The cyan/amber/green/crimson state vocabulary is immediately readable |
| Particle data flow | Visually shows information moving through the system — the "alive" feeling |
| Hexagonal agent nodes with context rings | Communicates agent identity + resource usage at a glance |
| Glass cards with blur | Floating panels feel layered and spatial, not flat |
| D3-Force physics for graph layout | Organic, self-organizing layout that responds to structure |

### Should Adapt

| Pattern | Adaptation |
|---------|------------|
| Raw Canvas2D rendering | Consider React Flow + custom renderers for better interaction handling |
| Full-screen canvas + floating panels | Keep the concept but add shadow-specific panels (interpretation, next moves) |
| Tool call cards | Add shadow-agent's derived risk signals and confidence markers |
| Message bubbles on canvas | Extend to show shadow interpretations alongside raw messages |

### Avoid

| Pattern | Why |
|---------|-----|
| VS Code webview-only deployment | Shadow-agent targets standalone Electron first |
| Hook server as sole input | Shadow-agent also needs replay fixtures and transcript watchers |
