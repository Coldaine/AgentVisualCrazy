# RepoVis Implementation Plan
## From Concept to VS Code Extension

---

## Executive Summary

**Goal**: Build a VS Code extension that provides ambient, visual awareness of git repository state through compact, glanceable panels using progressive LLM analysis.

**Scope**: MVP → Enhanced → Cosmology

**Timeline Estimate**: 4-6 weeks (MVP), 8-12 weeks (Full)

---

## Phase 0: Foundation & Research (Week 1)

### 0.1 Technical Feasibility Audit

#### VS Code Extension Capabilities
```
WebviewView API: ✅ Sidebar panels
Webview API: ✅ Custom HTML/CSS/JS in panels
SourceControl API: ✅ Git integration
FileSystemWatcher: ✅ Live file monitoring
Extension Host: ⚠️ No direct GPU access
```

**Critical Finding**: VS Code extensions run in restricted sandbox. Heavy WebGL/Three.js visualizations must run in Webview with message passing to extension host.

#### Performance Constraints
- Extension host: Single-threaded, must not block
- Webview: Isolated, can use GPU but limited by Electron
- Memory: Target <100MB for background extension
- CPU: Idle usage <1%

#### LLM Integration Options
| Approach | Pros | Cons |
|----------|------|------|
| Local (Ollama/lm-studio) | Private, no latency | Requires GPU, limited models |
| Cloud API (OpenAI/Anthropic) | Powerful, easy | Costs, privacy, latency |
| Hybrid (local small + cloud large) | Balanced | Complex orchestration |

**Recommendation**: Start with cloud APIs, add local option later.

### 0.2 Repository Analysis

Before building, analyze the extracted ColdVox data to understand:
- Typical repo structure (crates, packages)
- Commit patterns (frequency, size)
- File relationships (import graphs)
- PR characteristics (size, duration)

**Action Items**:
- [ ] Parse ColdVox git history for patterns
- [ ] Analyze file dependency graphs
- [ ] Document typical "day in the life" of a developer
- [ ] Identify pain points current tools don't solve

### 0.3 Technology Stack Decision

**Frontend (Webview)**:
- Framework: React + TypeScript (familiarity, ecosystem)
- Styling: CSS-in-JS (emotion/styled-components) for dynamic theming
- Visualization: 
  - MVP: SVG + CSS animations (simple, reliable)
  - Enhanced: D3.js (data-driven visualizations)
  - Cosmology: Three.js or PixiJS (WebGL)

**Backend (Extension Host)**:
- Language: TypeScript
- Git Operations: 
  - Simplechild_process` calls to git CLI
  - Or: isomorphic-git (pure JS, no CLI dependency)
- File Watching: VS Code's built-in FileSystemWatcher
- LLM Integration: 
  - HTTP clients for OpenAI/Anthropic
  - Streaming response handling
  - Caching layer for repeated analyses

**Data Layer**:
- State: Extension global state + workspace state
- Caching: In-memory with TTL, persist to disk
- Real-time: WebSocket or Server-Sent Events for updates

---

## Phase 1: MVP - The File Train (Weeks 2-3)

### 1.1 Extension Skeleton

```
repovis/
├── package.json              # Extension manifest
├── src/
│   ├── extension.ts          # Entry point
│   ├── webview/
│   │   ├── App.tsx           # Main React component
│   │   ├── components/
│   │   │   ├── FileTrain.tsx # The train visualization
│   │   │   └── StatusBar.tsx # Compact mode
│   │   └── index.tsx         # Webview entry
│   ├── core/
│   │   ├── GitProvider.ts    # Git operations
│   │   ├── FileTracker.ts    # File change tracking
│   │   └── StateManager.ts   # Extension state
│   └── types/
│       └── index.ts          # TypeScript definitions
├── media/
│   └── styles.css            # Shared styles
└── out/                      # Compiled output
```

### 1.2 Core Data Providers

#### GitProvider Class
```typescript
interface GitProvider {
  // Get current branch info
  getCurrentBranch(): Promise<BranchInfo>;
  
  // Get files changed in working directory
  getChangedFiles(): Promise<FileChange[]>;
  
  // Get current PR info (if on GitHub)
  getCurrentPR(): Promise<PRInfo | null>;
  
  // Get commit history for today
  getTodayCommits(): Promise<Commit[]>;
  
  // Watch for git state changes
  onDidChange(callback: () => void): Disposable;
}

interface FileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  type: 'code' | 'test' | 'doc' | 'config';
}
```

**Implementation Strategy**:
1. Use VS Code's built-in git extension API if available
2. Fallback to `git` CLI commands
3. Parse `git status --porcelain` for file states
4. Parse `git diff --numstat` for line counts
5. Watch `.git/index` for changes

#### FileTracker Class
```typescript
interface FileTracker {
  // Track file type (code/test/doc)
  classifyFile(path: string): FileType;
  
  // Track file relationships (imports)
  getFileDependencies(path: string): Promise<string[]>;
  
  // Watch for file changes
  watchFiles(glob: string): FileSystemWatcher;
}
```

**Implementation Strategy**:
- File classification: Regex on path (`.test.ts` → test, `docs/` → doc)
- Dependencies: Parse imports (TypeScript: `import`/`require`, Python: `import`)
- Use VS Code's language services for accurate parsing
- Cache dependency graphs, invalidate on file change

### 1.3 The File Train Component

#### Visual Design
```
┌─────────────────────────────────┐
│ 🚂 Current Work (7 files)       │
│                                 │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐     │
│  │🟠│→│🔵│→│🟢│→│🟠│→│⚪│     │
│  │au│ │te│ │do│ │mi│ │RE│     │
│  └──┘ └──┘ └──┘ └──┘ └──┘     │
│                                 │
│ [details appear on hover]      │
└─────────────────────────────────┘
```

**Component Structure**:
```typescript
interface FileTrainProps {
  files: FileChange[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onOpenFile: (path: string) => void;
}

// FileCar subcomponent
interface FileCarProps {
  file: FileChange;
  isSelected: boolean;
  position: number; // For animation
  onClick: () => void;
  onHover: () => void;
}
```

**Animation Strategy**:
- Train enters from left
- Cars have slight bounce (spring physics)
- Active car glows/pulses
- Hover: Car expands slightly, shows tooltip
- CSS transitions for smoothness (60fps target)

#### Color System
```typescript
const FILE_TYPE_COLORS = {
  code: '#f97316',      // Orange - main work
  test: '#3b82f6',      // Blue - testing
  doc: '#22c55e',       // Green - documentation
  config: '#a855f7',    // Purple - configuration
  asset: '#eab308',     // Yellow - assets
  unknown: '#64748b',   // Gray - uncategorized
};

const CHANGE_SIZE_SCALE = {
  tiny: 'scale(0.8)',      // <10 lines
  small: 'scale(0.9)',     // 10-50 lines
  medium: 'scale(1.0)',    // 50-200 lines
  large: 'scale(1.1)',     // 200-500 lines
  massive: 'scale(1.2)',   // >500 lines
};
```

### 1.4 VS Code Integration

#### Panel Registration
```typescript
// extension.ts
export function activate(context: vscode.ExtensionContext) {
  const provider = new RepoVisProvider(context.extensionUri);
  
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'repovis.sidebarPanel',
      provider
    )
  );
}

class RepoVisProvider implements vscode.WebviewViewProvider {
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };
    
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    
    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(message => {
      switch (message.command) {
        case 'openFile':
          vscode.workspace.openTextDocument(message.path)
            .then(doc => vscode.window.showTextDocument(doc));
          break;
        case 'showDiff':
          vscode.commands.executeCommand('git.openChange');
          break;
      }
    });
  }
}
```

#### Message Passing Architecture
```typescript
// Extension Host -> Webview
interface ExtensionMessage {
  type: 'gitUpdate' | 'fileChange' | 'llmResult';
  payload: any;
}

// Webview -> Extension Host
interface WebviewMessage {
  command: 'openFile' | 'showDiff' | 'requestAnalysis';
  data: any;
}

// Communication pattern
const messageBridge = {
  // Extension sends updates
  postToWebview: (message: ExtensionMessage) => {
    webview.postMessage(message);
  },
  
  // Webview receives and updates React state
  handleMessage: (event: MessageEvent) => {
    const { type, payload } = event.data;
    dispatch({ type, payload });
  }
};
```

### 1.5 MVP Features

**Must Have**:
- [ ] File train showing changed files
- [ ] Color coding by file type
- [ ] Click to open file
- [ ] Auto-update on git state change
- [ ] Compact mode (status bar item)

**Nice to Have**:
- [ ] Hover tooltips with file details
- [ ] File size indicator (car scale)
- [ ] Keyboard navigation
- [ ] Right-click context menu

### 1.6 MVP Testing

**Manual Testing Checklist**:
- [ ] Open workspace, see file train populate
- [ ] Edit file, see train update live
- [ ] Switch branches, see context change
- [ ] Click file car, file opens in editor
- [ ] Resize VS Code panel, layout adapts
- [ ] Long file list, train scrolls horizontally

**Performance Benchmarks**:
- Initial load: <500ms
- Git update reaction: <100ms
- File open: <50ms
- Memory usage: <50MB

---

## Phase 2: Enhanced - LLM Analysis (Weeks 4-5)

### 2.1 LLM Provider Architecture

```typescript
interface LLMProvider {
  // Tier 1: Instant classification
  classifyFile(path: string, content?: string): FileType;
  
  // Tier 2: Contextual analysis
  analyzeChanges(files: FileChange[]): Promise<ChangeAnalysis>;
  
  // Tier 3: Deep insights
  generateSummary(context: RepoContext): Promise<RepoSummary>;
  
  // Streaming support
  streamAnalysis(context: RepoContext, onChunk: (chunk: string) => void): void;
}

interface ChangeAnalysis {
  summary: string;           // "Auth refactoring with 3 new utilities"
  riskLevel: 'low' | 'medium' | 'high';
  concerns: string[];        // ["utils.ts widely imported"]
  suggestions: string[];     // ["Add edge case test"]
  affectedAreas: string[];   // ["authentication", "api"]
}
```

#### Provider Implementations

**OpenAI Provider**:
```typescript
class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private cache: Map<string, any>;
  
  async analyzeChanges(files: FileChange[]): Promise<ChangeAnalysis> {
    const prompt = this.buildPrompt(files);
    
    // Check cache first
    const cacheKey = hash(prompt);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    const response = await this.client.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 500,
    });
    
    const analysis = JSON.parse(response.choices[0].message.content);
    this.cache.set(cacheKey, analysis);
    
    return analysis;
  }
  
  private buildPrompt(files: FileChange[]): string {
    return `
Analyze these file changes and provide:
1. A one-sentence summary
2. Risk level (low/medium/high)
3. Any concerns
4. Suggestions

Files:
${files.map(f => `- ${f.path} (${f.status}, +${f.additions}/-${f.deletions})`).join('\n')}
`;
  }
}
```

**Local Model Provider** (for Tier 1):
```typescript
class LocalProvider implements LLMProvider {
  // Use Ollama or similar
  private ollama: OllamaClient;
  
  classifyFile(path: string): FileType {
    // Simple regex first (fast)
    if (path.includes('.test.') || path.includes('__tests__')) {
      return 'test';
    }
    if (path.includes('docs/') || path.endsWith('.md')) {
      return 'doc';
    }
    // Fallback to local model if needed
    return this.quickLocalInference(path);
  }
}
```

### 2.2 Prompt Engineering

#### Tier 1 System Prompt (File Classification)
```
You are a file classifier. Given a file path and optional content,
categorize it into: code, test, doc, config, or asset.

Rules:
- test: Contains .test., .spec., __tests__, /test/ in path
- doc: Ends in .md, .txt in docs/, README, CHANGELOG
- config: .json, .yaml, .toml, .config., Dockerfile
- asset: .png, .jpg, .svg, .woff, .mp3, .mp4
- code: Everything else

Return only the category name.
```

#### Tier 2 System Prompt (Change Analysis)
```
You are analyzing code changes to provide context to a developer.

Input: List of files changed with status and line counts.
Output: JSON with:
- summary: One sentence describing the work
- riskLevel: low/medium/high based on scope and impact
- concerns: Array of potential issues (max 3)
- suggestions: Array of improvements (max 3)
- affectedAreas: Array of subsystem names

Guidelines:
- Be concise, developer is in flow state
- Flag risky patterns (large deletions, config changes, widely imported files)
- Suggest specific actions, not general advice
```

#### Tier 3 System Prompt (Deep Analysis)
```
You are providing comprehensive code review context.

Input: Full git diff, commit history, PR description
Output: JSON with:
- architectureImpact: How this changes system design
- testingGaps: What's not tested
- reviewerSuggestions: Who should review based on expertise
- similarPRs: Historical PRs that might inform this one
- narrative: Story of this PR for description generation

Be thorough but structured.
```

### 2.3 Progressive Analysis UI

```typescript
// React state management
interface AnalysisState {
  tier: 1 | 2 | 3;
  status: 'idle' | 'loading' | 'complete' | 'error';
  data: {
    classification?: FileType[];
    changeAnalysis?: ChangeAnalysis;
    deepSummary?: RepoSummary;
  };
}

// Progressive disclosure component
const AnalysisPanel: React.FC = () => {
  const [state, setState] = useState<AnalysisState>({
    tier: 1,
    status: 'idle',
    data: {}
  });
  
  useEffect(() => {
    // Tier 1: Instant (regex/cache)
    const classifications = files.map(f => classifyFile(f.path));
    setState(s => ({ ...s, tier: 1, data: { ...s.data, classifications } }));
    
    // Tier 2: Async (2-3s)
    analyzeChanges(files).then(analysis => {
      setState(s => ({ ...s, tier: 2, data: { ...s.data, changeAnalysis: analysis } }));
    });
    
    // Tier 3: Background (10s+)
    generateDeepSummary(context).then(summary => {
      setState(s => ({ ...s, tier: 3, data: { ...s.data, deepSummary: summary } }));
    });
  }, [files]);
  
  return (
    <div className="analysis-panel">
      {/* Tier 1: Always visible */}
      <FileTrain files={files} types={state.data.classifications} />
      
      {/* Tier 2: Fade in when ready */}
      {state.tier >= 2 && (
        <InsightsBanner analysis={state.data.changeAnalysis} />
      )}
      
      {/* Tier 3: Expandable section */}
      {state.tier >= 3 && (
        <DeepDive summary={state.data.deepSummary} />
      )}
    </div>
  );
};
```

### 2.4 Insights UI Components

#### Risk Indicator
```
┌─────────────────────────────────┐
│ ⚠️  Medium Risk                 │
│ utils.ts imported by 12 files   │
│ [See dependents] [Add tests]    │
└─────────────────────────────────┘
```

#### Suggestion Chips
```
┌─────────────────────────────────┐
│ 💡 Suggestions                  │
│ ┌─────────────┐ ┌─────────────┐ │
│ │Add edge case│ │Update docs  │ │
│ │test         │ │             │ │
│ └─────────────┘ └─────────────┘ │
└─────────────────────────────────┘
```

#### Narrative Summary
```
┌─────────────────────────────────┐
│ 📝 This PR...                    │
│ Refactors auth to add OAuth.    │
│ Main changes in login.ts.       │
│ Tests added, docs pending.      │
│ [GENERATE DESC]                 │
└─────────────────────────────────┘
```

### 2.5 Caching Strategy

```typescript
class AnalysisCache {
  private cache: Map<string, CachedItem>;
  private readonly TTL = 5 * 60 * 1000; // 5 minutes
  
  get(key: string): any | null {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() - item.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  }
  
  set(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
  
  // Invalidate when files change
  invalidate(filePath: string): void {
    for (const [key, item] of this.cache) {
      if (key.includes(filePath)) {
        this.cache.delete(key);
      }
    }
  }
}
```

### 2.6 Privacy & Cost Controls

```typescript
interface LLMConfig {
  // Privacy levels
  privacyLevel: 'local-only' | 'cloud-sanitized' | 'cloud-full';
  
  // Sanitization for cloud
  sanitizeContent: (content: string) => string;
  
  // Cost controls
  maxTokensPerAnalysis: number;
  monthlyBudget: number;
  useLocalForTier1: boolean;
}

// Sanitize: remove comments, variable names, keep structure
function sanitizeForCloud(content: string): string {
  return content
    .replace(/\/\/.*$/gm, '') // Remove comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
    .replace(/\b\w+\b/g, (match) => {
      // Replace identifiers with generic names
      if (isLikelyIdentifier(match)) {
        return `IDENT_${hash(match).slice(0, 4)}`;
      }
      return match;
    });
}
```

---

## Phase 3: Enhanced Visualizations (Weeks 6-7)

### 3.1 Dependency Graph

**Data Structure**:
```typescript
interface DependencyGraph {
  nodes: {
    id: string;
    path: string;
    type: FileType;
    changeSize: number;
  }[];
  edges: {
    source: string;
    target: string;
    type: 'imports' | 'imported-by' | 'same-commit';
    strength: number; // 0-1
  }[];
}

// Build from file content analysis
async function buildDependencyGraph(files: FileChange[]): Promise<DependencyGraph> {
  const nodes = files.map(f => ({
    id: hash(f.path),
    path: f.path,
    type: classifyFile(f.path),
    changeSize: f.additions + f.deletions
  }));
  
  const edges: Edge[] = [];
  
  // Parse imports in each file
  for (const file of files) {
    const content = await readFile(file.path);
    const imports = parseImports(content);
    
    for (const imp of imports) {
      const targetFile = findFileByImport(imp, files);
      if (targetFile) {
        edges.push({
          source: hash(file.path),
          target: hash(targetFile.path),
          type: 'imports',
          strength: 1.0
        });
      }
    }
  }
  
  return { nodes, edges };
}
```

**D3.js Force-Directed Graph**:
```typescript
import * as d3 from 'd3';

const GraphVisualization: React.FC<{ graph: DependencyGraph }> = ({ graph }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    const width = svgRef.current!.clientWidth;
    const height = svgRef.current!.clientHeight;
    
    // Force simulation
    const simulation = d3.forceSimulation(graph.nodes)
      .force('link', d3.forceLink(graph.edges).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2));
    
    // Draw edges
    const link = svg.append('g')
      .selectAll('line')
      .data(graph.edges)
      .join('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', d => Math.sqrt(d.strength * 5));
    
    // Draw nodes
    const node = svg.append('g')
      .selectAll('circle')
      .data(graph.nodes)
      .join('circle')
      .attr('r', d => 5 + d.changeSize / 20)
      .attr('fill', d => FILE_TYPE_COLORS[d.type])
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));
    
    // Labels on hover
    node.append('title')
      .text(d => d.path);
    
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      
      node
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);
    });
  }, [graph]);
  
  return <svg ref={svgRef} className="dependency-graph" />;
};
```

### 3.2 Activity Timeline

**Micro Heatmap Component**:
```
┌─────────────────────────────────┐
│ ⏱️ Today (9am - 6pm)           │
│                                 │
│ 9   10  11  12   1   2   3   4 │
│ │    │   │   │    │   │   │   ││
│ ░░▓▓░░░░▓▓▓▓░░░░▓▓▓░░░▓░░░░▓▓ │
│     ↑       ↑         ↑        │
│   commit   commit   latest     │
│                                 │
│ Activity: ████░░░░░░ 35%       │
└─────────────────────────────────┘
```

```typescript
const ActivityTimeline: React.FC<{ commits: Commit[] }> = ({ commits }) => {
  const hours = Array.from({ length: 12 }, (_, i) => i + 9); // 9am-8pm
  const activityMap = buildActivityMap(commits);
  
  return (
    <div className="activity-timeline">
      {hours.map(hour => (
        <div 
          key={hour}
          className="hour-bar"
          style={{ 
            opacity: activityMap[hour] / maxActivity,
            backgroundColor: activityToColor(activityMap[hour])
          }}
        />
      ))}
    </div>
  );
};
```

### 3.3 Compact Mode (Status Bar)

```typescript
// Status bar item
const statusBarItem = vscode.window.createStatusBarItem(
  vscode.StatusBarAlignment.Left,
  100
);

statusBarItem.text = "$(git-branch) 7 $(file-code)";
statusBarItem.tooltip = "7 files changed in current work";
statusBarItem.command = 'repovis.togglePanel';
statusBarItem.show();

// Update on changes
GitProvider.onDidChange(() => {
  const changedCount = GitProvider.getChangedFiles().length;
  statusBarItem.text = `$(git-branch) ${changedCount} $(file-code)`;
  
  // Pulse animation if count increased
  if (changedCount > previousCount) {
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    setTimeout(() => {
      statusBarItem.backgroundColor = undefined;
    }, 1000);
  }
});
```

---

## Phase 4: The Cosmology (Weeks 8-10)

### 4.1 WebGL Architecture in VS Code

**Challenge**: VS Code webviews run in restricted Electron environment.

**Solution**: Use Three.js with careful optimization:

```typescript
// CosmologyView.tsx
import * as THREE from 'three';

const CosmologyVisualization: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  
  useEffect(() => {
    // Initialize Three.js scene
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ 
      canvas: canvasRef.current,
      alpha: true,
      antialias: false // Performance: disable AA
    });
    
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap pixel ratio
    renderer.setSize(width, height);
    
    // Create starfield (repos)
    const repos = getReposFromWorkspace();
    repos.forEach(repo => {
      const star = createStar(repo);
      scene.add(star);
    });
    
    // Animation loop with frame skipping when idle
    let frameCount = 0;
    const animate = () => {
      requestAnimationFrame(animate);
      
      // Skip every other frame when not interacting
      if (!isInteracting && frameCount++ % 2 !== 0) return;
      
      // Update star pulses based on commit activity
      updateStarPulses(scene, repos);
      
      renderer.render(scene, camera);
    };
    
    animate();
    
    // Cleanup on unmount
    return () => {
      renderer.dispose();
    };
  }, []);
  
  return <canvas ref={canvasRef} className="cosmology-canvas" />;
};

// Performance optimization: Instanced rendering for particles
function createStarfield(count: number): THREE.InstancedMesh {
  const geometry = new THREE.SphereGeometry(1, 8, 8); // Low poly
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    dummy.position.set(
      (Math.random() - 0.5) * 100,
      (Math.random() - 0.5) * 100,
      (Math.random() - 0.5) * 100
    );
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  
  return mesh;
}
```

### 4.2 Multi-Repo Universe

**Data Model**:
```typescript
interface RepoUniverse {
  repos: RepoStar[];
  constellations: ConstellationLine[];
  camera: CameraState;
}

interface RepoStar {
  id: string;
  name: string;
  position: Vector3;
  color: Color;
  size: number;
  pulseRate: number;
  coronaSpikes: number; // PR count
  rotationSpeed: number; // Commit velocity
  
  // Derived from git data
  lastCommit: Date;
  openPRs: number;
  health: 'healthy' | 'warning' | 'critical';
}

interface ConstellationLine {
  from: string; // repo id
  to: string;
  brightness: number; // shared commits
  pulsing: boolean; // active cross-repo work
}
```

**Star Rendering**:
```typescript
function createStar(repo: Repo): THREE.Group {
  const group = new THREE.Group();
  
  // Main star body
  const geometry = new THREE.SphereGeometry(repo.size, 16, 16);
  const material = new THREE.MeshBasicMaterial({ 
    color: repo.healthColor,
    transparent: true,
    opacity: 0.9
  });
  const star = new THREE.Mesh(geometry, material);
  group.add(star);
  
  // Corona (PR indicators)
  if (repo.openPRs > 0) {
    const coronaGeometry = new THREE.BufferGeometry();
    const coronaMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3
    });
    
    // Generate spikes based on PR count
    const spikes = generateCoronaSpikes(repo.openPRs);
    coronaGeometry.setFromPoints(spikes);
    
    const corona = new THREE.Line(coronaGeometry, coronaMaterial);
    group.add(corona);
  }
  
  // Glow effect (shader-based for performance)
  const glowGeometry = new THREE.SphereGeometry(repo.size * 1.5, 16, 16);
  const glowMaterial = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(repo.healthColor) },
      intensity: { value: 0.5 }
    },
    vertexShader: glowVertexShader,
    fragmentShader: glowFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  group.add(glow);
  
  return group;
}
```

### 4.3 Zoom Level Transitions

**Implementation Strategy**:
```typescript
enum ZoomLevel {
  GALAXY = 'galaxy',      // All repos as stars
  SOLAR_SYSTEM = 'solar', // One repo, branches as planets
  PLANETARY = 'planetary' // One branch, files as moons
}

const CameraController: React.FC = () => {
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(ZoomLevel.GALAXY);
  const [focusedRepo, setFocusedRepo] = useState<string | null>(null);
  const [focusedBranch, setFocusedBranch] = useState<string | null>(null);
  
  const handleZoomIn = () => {
    switch (zoomLevel) {
      case ZoomLevel.GALAXY:
        // Zoom to selected repo
        animateCameraToRepo(focusedRepo);
        setZoomLevel(ZoomLevel.SOLAR_SYSTEM);
        break;
      case ZoomLevel.SOLAR_SYSTEM:
        // Zoom to selected branch
        animateCameraToBranch(focusedBranch);
        setZoomLevel(ZoomLevel.PLANETARY);
        break;
    }
  };
  
  const animateCameraToRepo = (repoId: string) => {
    const repo = findRepo(repoId);
    const targetPosition = new THREE.Vector3(
      repo.position.x,
      repo.position.y,
      repo.position.z + 20 // Zoom in
    );
    
    // Smooth camera animation
    gsap.to(camera.position, {
      x: targetPosition.x,
      y: targetPosition.y,
      z: targetPosition.z,
      duration: 1.5,
      ease: 'power2.inOut',
      onUpdate: () => {
        camera.lookAt(repo.position);
      }
    });
  };
  
  return (
    <div className="camera-controls">
      <button onClick={handleZoomIn}>Zoom In</button>
      <button onClick={handleZoomOut}>Zoom Out</button>
    </div>
  );
};
```

### 4.4 Ambient Animation System

**The "Breathing" Effect**:
```typescript
function animateBreathing(scene: THREE.Scene, repos: RepoStar[]) {
  const time = Date.now() * 0.001;
  
  repos.forEach((repo, index) => {
    const star = scene.getObjectByName(repo.id);
    if (!star) return;
    
    // Base pulse on commit activity
    const activity = repo.commitVelocity;
    const basePulse = Math.sin(time * repo.pulseRate + index) * 0.1 + 1;
    const activityPulse = Math.sin(time * activity * 2) * 0.05 + 1;
    
    star.scale.setScalar(basePulse * activityPulse);
    
    // Color temperature based on health
    const material = star.children[0].material as THREE.MeshBasicMaterial;
    const targetColor = new THREE.Color(repo.healthColor);
    material.color.lerp(targetColor, 0.05);
  });
}
```

**Comet Trails for Recent Commits**:
```typescript
function spawnComet(repo: RepoStar, commit: Commit) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(100 * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  
  const material = new THREE.LineBasicMaterial({
    color: commitTypeColor(commit.type),
    transparent: true,
    opacity: 0.8
  });
  
  const comet = new THREE.Line(geometry, material);
  
  // Animate comet trail
  const animateComet = () => {
    // Update positions based on physics
    // Fade out over time
    // Remove when faded
  };
  
  scene.add(comet);
}
```

---

## Phase 5: Polish & Distribution (Weeks 11-12)

### 5.1 Configuration System

```typescript
// package.json contributes.configuration
{
  "contributes": {
    "configuration": {
      "title": "RepoVis",
      "properties": {
        "repovis.llm.provider": {
          "type": "string",
          "enum": ["openai", "anthropic", "local"],
          "default": "openai",
          "description": "LLM provider for analysis"
        },
        "repovis.llm.apiKey": {
          "type": "string",
          "default": "",
          "description": "API key for LLM service"
        },
        "repovis.visualization.mode": {
          "type": "string",
          "enum": ["train", "graph", "cosmology", "minimal"],
          "default": "train",
          "description": "Default visualization mode"
        },
        "repovis.privacy.level": {
          "type": "string",
          "enum": ["local-only", "sanitized", "full"],
          "default": "sanitized",
          "description": "Privacy level for LLM analysis"
        },
        "repovis.performance.targetFps": {
          "type": "number",
          "default": 30,
          "minimum": 15,
          "maximum": 60,
          "description": "Target FPS for animations"
        }
      }
    }
  }
}
```

### 5.2 Testing Strategy

**Unit Tests**:
```typescript
// GitProvider.test.ts
describe('GitProvider', () => {
  test('should detect changed files', async () => {
    const provider = new GitProvider('/test/repo');
    const files = await provider.getChangedFiles();
    
    expect(files).toHaveLength(3);
    expect(files[0].status).toBe('modified');
  });
});

// FileClassifier.test.ts
describe('FileClassifier', () => {
  test('should classify test files', () => {
    expect(classifyFile('auth.test.ts')).toBe('test');
    expect(classifyFile('README.md')).toBe('doc');
    expect(classifyFile('src/utils.ts')).toBe('code');
  });
});
```

**Integration Tests**:
- Open test workspace with known git state
- Verify FileTrain renders correctly
- Simulate file changes, verify updates
- Test LLM analysis flow with mock provider

**Performance Tests**:
- 1000 changed files: render time <100ms
- Memory usage <100MB after 1 hour
- CPU usage <1% when idle
- 60fps maintained during animations

### 5.3 Documentation

**User Documentation**:
- README.md: Installation, quick start
- USAGE.md: Detailed feature guide
- CONFIGURATION.md: All settings explained
- TROUBLESHOOTING.md: Common issues

**Developer Documentation**:
- ARCHITECTURE.md: System design
- CONTRIBUTING.md: How to contribute
- API.md: Extension API reference

### 5.4 Publishing

**VS Code Marketplace**:
```bash
# Package extension
vsce package

# Publish to marketplace
vsce publish

# Create GitHub release with vsix
gh release create v1.0.0 repovis-1.0.0.vsix
```

**Open Source Setup**:
- MIT License
- GitHub repository with issue templates
- CI/CD with GitHub Actions (test, build, publish)
- Code of Conduct
- Security policy

---

## Risk Assessment & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| VS Code API limitations | High | Medium | Research first, prototype early, have fallback designs |
| WebGL performance in Electron | Medium | Medium | Optimize aggressively, provide non-WebGL fallback |
| LLM API costs | Medium | High | Tiered approach, local model option, caching, budget controls |
| Privacy concerns | High | Medium | Sanitization, local-only mode, clear data policies |
| Complexity creep | High | High | Strict MVP scope, iterative delivery, cut features if needed |
| Git provider differences | Medium | Medium | Abstract git interface, test with multiple repo types |

---

## Success Metrics

**Technical**:
- Extension installs: 1000 in first month
- Daily active users: 300+
- Average session: >2 hours (ambient use)
- Crash rate: <0.1%

**User Experience**:
- Time to first visualization: <3 seconds
- Memory usage: <100MB
- CPU idle: <1%
- User satisfaction: 4.5+ stars

**Impact**:
- Users report better PR awareness
- Reduced time spent in git CLI for status checks
- Positive feedback on "ambient insight" concept

---

## Appendix A: File Structure

```
repovis/
├── .github/
│   ├── workflows/
│   │   ├── test.yml
│   │   └── publish.yml
│   └── ISSUE_TEMPLATE/
├── docs/
│   ├── ARCHITECTURE.md
│   ├── CONFIGURATION.md
│   ├── CONTRIBUTING.md
│   ├── TROUBLESHOOTING.md
│   └── USAGE.md
├── src/
│   ├── extension.ts
│   ├── core/
│   │   ├── GitProvider.ts
│   │   ├── FileTracker.ts
│   │   ├── StateManager.ts
│   │   └── LLMProvider.ts
│   ├── llm/
│   │   ├── OpenAIProvider.ts
│   │   ├── LocalProvider.ts
│   │   └── Prompts.ts
│   ├── webview/
│   │   ├── App.tsx
│   │   ├── index.tsx
│   │   ├── components/
│   │   │   ├── FileTrain.tsx
│   │   │   ├── DependencyGraph.tsx
│   │   │   ├── ActivityTimeline.tsx
│   │   │   ├── CosmologyView.tsx
│   │   │   └── AnalysisPanel.tsx
│   │   └── hooks/
│   │       ├── useGit.ts
│   │       ├── useLLM.ts
│   │       └── useAnimation.ts
│   └── types/
│       └── index.ts
├── media/
│   └── styles.css
├── test/
│   ├── unit/
│   └── integration/
├── package.json
├── tsconfig.json
├── webpack.config.js
└── README.md
```

---

## Appendix B: Dependencies

**Production**:
- `vscode` - Extension API
- `react`, `react-dom` - UI framework
- `d3` - Data visualization
- `three` - 3D graphics (cosmology)
- `axios` - HTTP client
- `date-fns` - Date utilities

**Development**:
- `typescript` - Language
- `jest` - Testing
- `eslint`, `prettier` - Code quality
- `webpack` - Bundling
- `vsce` - Extension packaging

---

*Implementation plan for RepoVis VS Code Extension.*
*Total estimated timeline: 12 weeks (MVP in 3 weeks)*
