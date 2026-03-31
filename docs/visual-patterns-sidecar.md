# Visual Patterns: Sidecar

> Extracted from vendored `third_party/sidecar/` — the parallel AI conversation window by John Renaldi.
> Original: https://github.com/jrenaldi79/sidecar (v0.5.2)

## What Sidecar Is

A **companion Electron window** that runs alongside Claude Code, allowing you to fork conversations into parallel models, build context, and fold summaries back. The visual language is warm, minimal, and tool-like — not flashy, but extremely functional.

**This is the primary reference for shadow-agent's Electron shell, session management, and runtime patterns.** The UX mechanics (setup wizard, session recovery, fold workflow) are templates for shadow-agent's own workflows.

---

## 1. Design Language: Warm Dark Minimal

### Color Palette

```
Background:       #2D2B2A   (warm charcoal)
Surface:          #3A3836   (slightly lighter)
Text:             #E8E0D8   (warm cream)
Accent:           #D97757   (burnt orange)
Accent Hover:     #E89070   (light orange)
Subtle:           #888380   (muted warm gray)
Border:           #4A4744   (dark warm gray)
Error:            #E84040   (red)
Success:          #4CAF50   (green)
```

**Contrast with agent-flow:** agent-flow is cold/cyberpunk (cyan, void black). Sidecar is warm/workshop (orange, charcoal). Shadow-agent can blend these — cold visualization canvas, warm controls and panels.

### Typography

```
Primary:        -apple-system, Segoe UI, sans-serif
Code:           'Consolas', 'Courier New', monospace
Body size:      14px
Small:          12px
Header:         16px (bold 600)
```

### Key CSS Properties

```css
/* Main window */
body {
  background: #2D2B2A;
  color: #E8E0D8;
  font-family: -apple-system, 'Segoe UI', sans-serif;
  font-size: 14px;
  margin: 0;
  overflow: hidden;
}

/* Buttons */
.primary-button {
  background: #D97757;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 600;
  transition: background 0.2s;
}
.primary-button:hover {
  background: #E89070;
}

/* Toolbar */
.toolbar {
  height: 40px;
  background: #1E1C1B;
  border-top: 1px solid #4A4744;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
}
```

---

## 2. Electron Architecture

### Window Layout: BrowserView Dual-Pane

```
┌─────────────────────────────────┐
│                                 │  BrowserView (top)
│     OpenCode Web UI             │  Loads: http://localhost:port
│     (model conversation)        │  Height: window - 40px
│                                 │
├─────────────────────────────────┤
│ 🔧 toolbar: fold | status | ⋮  │  loadFile (bottom)
│                                 │  Height: 40px fixed
└─────────────────────────────────┘
```

**Key insight:** Sidecar doesn't render a monolithic Electron app. It embeds an external web UI (OpenCode) as a BrowserView in the top pane and renders only a minimal toolbar in the bottom. This is a lean, composable approach.

### Tray Integration

```
System Tray Icon → Click: show/hide window
                 → Context Menu:
                    ├── Show Sidecar
                    ├── About
                    └── Quit
```

### Window Properties

```typescript
const mainWindow = new BrowserWindow({
  width: 800,
  height: 900,
  show: false,                    // Hidden until ready
  frame: true,                    // Native chrome
  backgroundColor: '#2D2B2A',
  titleBarStyle: 'hiddenInset',   // macOS traffic lights
  webPreferences: {
    nodeIntegration: true,
    contextIsolation: false,
  }
});
```

---

## 3. Setup Wizard (4-Step Flow)

Sidecar presents a setup wizard on first launch with **progress dots** and step-by-step configuration.

### Flow

```
Step 1: Welcome
  "Welcome to Sidecar"
  Brief description + Continue button

Step 2: Configure Model
  Provider dropdown (OpenAI, Anthropic, etc.)
  API key input (password field)
  Model selection

Step 3: Configure Integration
  Claude Code session directory path
  Auto-detect button
  Validation indicator (✓ / ✗)

Step 4: Ready
  Summary of configuration
  "Start Sidecar" button
```

### Progress Dots

```html
<div class="progress-dots">
  <div class="dot active"></div>
  <div class="dot"></div>
  <div class="dot"></div>
  <div class="dot"></div>
</div>
```

```css
.dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #4A4744;
  transition: background 0.3s;
}
.dot.active {
  background: #D97757;
}
```

---

## 4. Fold Mechanism (Key UX Pattern)

"Folding" is sidecar's signature interaction — summarize the sidecar conversation and inject it back into Claude Code's context.

### Visual Flow

```
1. User clicks "Fold" button in toolbar
   └── Button: orange accent, icon: ↩

2. Overlay appears (full-screen spinner)
   └── "Folding conversation..."
   └── Pulsing animation

3. HTTP request to fold endpoint
   └── Polling for completion (1s intervals)
   └── Progress indicator updates

4. Summary generated
   └── Preview shown in overlay
   └── "Accept" / "Edit" / "Cancel"

5. Fold accepted
   └── Summary injected into Claude Code session
   └── Sidecar window closes (optional)
   └── Toast notification: "Fold complete ✓"
```

### Overlay CSS

```css
.fold-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.fold-spinner {
  width: 48px;
  height: 48px;
  border: 3px solid #4A4744;
  border-top: 3px solid #D97757;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
```

---

## 5. Session Management

### Session Recovery

```
On startup:
├── Check for active Claude Code session
│   ├── Found → Resume (show conversation state)
│   └── Not found → Show "waiting for session..." state
├── Check for stale sidecar state
│   ├── Stale → "Previous session expired. Start new?"
│   └── Fresh → Resume
└── Monitor for session changes
    └── FileSystemWatcher on Claude Code JSONL
```

### Drift Detection (`src/drift.js`)

Sidecar detects when Claude Code's conversation has **drifted** from the sidecar's last known state:

```
Drift signals:
├── Token count divergence (>30% change since last fold)
├── Topic shift detection (embedding similarity < threshold)
├── Time gap (>10 min since last interaction)
└── Conflict detection (Claude Code + Sidecar editing same file)
```

When drift is detected:
```
┌─────────────────────────────────────┐
│ ⚠ Context Drift Detected            │
│                                     │
│ Claude Code has moved significantly  │
│ since your last fold.                │
│                                     │
│ [Refresh Context]  [Continue Anyway] │
└─────────────────────────────────────┘
```

---

## 6. Context Building (`src/prompt-builder.js`)

### JSONL Transcript Parsing

```javascript
// Parse Claude Code transcript
const transcript = fs.readFileSync(sessionPath, 'utf8')
  .split('\n')
  .filter(line => line.trim())
  .map(line => JSON.parse(line));

// Extract conversation turns
const turns = transcript
  .filter(entry => entry.type === 'user' || entry.type === 'assistant')
  .map(entry => ({
    role: entry.type,
    content: extractContent(entry),
    timestamp: entry.timestamp,
    tokens: countTokens(entry)
  }));
```

### Token Counting (tiktoken)

```javascript
import { encoding_for_model } from 'tiktoken';
const enc = encoding_for_model('gpt-4');
const tokenCount = enc.encode(text).length;
```

---

## 7. What Shadow-Agent Should Steal

### Must-Have

| Pattern | Why |
|---------|-----|
| BrowserView dual-pane architecture | Clean separation of visualization (webview) from controls (native) |
| Setup wizard with progress dots | Shadow-agent needs first-run configuration too |
| Fold overlay UX | Template for any "processing" modal (e.g., computing shadow interpretation) |
| Session recovery flow | Shadow-agent must handle interrupted sessions gracefully |
| Drift detection | Shadow-agent should detect when the observed agent's behavior shifts |
| JSONL transcript parsing | Core shared capability — shadow-agent already has this |

### Should Adapt

| Pattern | Adaptation |
|---------|------------|
| Warm dark minimal aesthetic | Blend with agent-flow's cold holographic — warm controls, cold canvas |
| 40px fixed toolbar | Expand to a richer control surface with interpretation controls |
| System tray integration | Good for "always watching" mode |
| Fold mechanism | Shadow-agent equivalent: "publish shadow interpretation" or "share insight" |

### Avoid

| Pattern | Why |
|---------|-----|
| Embedding external web UI (BrowserView) | Shadow-agent owns its own UI |
| Single-model focus | Shadow-agent should be model-agnostic from the start |
| No persistence layer | Shadow-agent already has file-backed persistence — keep it |
