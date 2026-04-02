# Shadow Interpretation Engine: Architecture Spec

> How shadow-agent's own AI model is served, called, and integrated.
> Written after deep-dive into sidecar's vendored implementation.

---

## The Core Question

Shadow-agent watches a coding agent's transcript and needs its own AI to interpret it:
- What phase is the observed agent in?
- What are the risk signals?
- What will it do next?
- What does it actually understand about the codebase?

**This requires calling a real AI model on a real event stream — not hardcoded heuristics.**

---

## Chosen Architecture: OpenCode Harness (Primary) + Direct API (Fallback)

### Why OpenCode

Sidecar (vendored in `third_party/sidecar/`) already solved this exact problem. Its `opencode-client.js` shows the complete pattern for:
- Starting an OpenCode server programmatically
- Creating sessions via `@opencode-ai/sdk`
- Sending structured prompts with context
- Handling auth across multiple providers (Anthropic, OpenAI, OpenRouter, Google)

We copy this pattern almost verbatim. Shadow-agent gets **provider abstraction for free** — the user can use Claude, GPT-4, Gemini, or any OpenRouter model as the interpretation engine without shadow-agent caring.

### Why Not Codex MCP Server

`codex mcp-server` is compelling but:
- Locks us to OpenAI only
- Requires Codex CLI installed separately
- We'd have to write an MCP client connection ourselves

The OpenCode harness gives us all models, not just OpenAI.

### Why Not Direct API Only

Direct Anthropic/OpenAI SDK would work but forces the user to manage API keys and pick a model. OpenCode already handles the entire auth + provider + model selection flow.

---

## Architecture Diagram

```
                         ┌──────────────────────────┐
Observed Agent           │   shadow-agent (Electron)  │
(Claude Code / Codex)    │                            │
       │                 │  Main Process (Node.js)    │
       │ JSONL           │  ┌────────────────────┐   │
       └──────────────── │→ │ Event Capture       │   │
                         │  │ (transcript watcher)│   │
                         │  └─────────┬──────────┘   │
                         │            │ canonical     │
                         │            ↓ events        │
                         │  ┌────────────────────┐   │
                         │  │ Derive Layer        │   │
                         │  │ (heuristic phase/   │   │
                         │  │  risk/attention)    │   │
                         │  └─────────┬──────────┘   │
                         │            │ DerivedState  │
                         │            ↓               │
                         │  ┌────────────────────┐   │
                         │  │ Shadow Inference    │◄──┼── inference trigger
                         │  │ Engine              │   │   (N events, timer,
                         │  └─────────┬──────────┘   │    risk threshold)
                         │            │               │
                         └────────────┼───────────────┘
                                      │ context packet (JSON)
                                      ↓
                         ┌────────────────────────┐
                         │  OpenCode Server        │
                         │  (opencode serve,       │
                         │   port 4096)            │
                         │                         │
                         │  Provider: Claude /     │
                         │  GPT-4 / Gemini /       │
                         │  OpenRouter             │
                         └────────────┬────────────┘
                                      │ structured JSON response
                                      ↓
                         ┌────────────────────────┐
                         │  ShadowInsight events  │
                         │  → Canvas renderer     │
                         │  → Interpretation panel│
                         └────────────────────────┘
```

---

## OpenCode Integration (copied from sidecar)

### Dependencies to Add

```json
{
  "dependencies": {
    "@opencode-ai/sdk": "^1.1.36",
    "@modelcontextprotocol/sdk": "^1.27.0"
  }
}
```

### Start the OpenCode Server (from sidecar/src/opencode-client.js)

```typescript
// shadow-agent/src/inference/opencode-client.ts

let _sdk: any = null;
async function getSDK() {
  if (!_sdk) _sdk = await import('@opencode-ai/sdk');
  return _sdk;
}

export async function startInferenceServer(options: { port?: number } = {}) {
  const { createOpencodeServer, createOpencodeClient } = await getSDK();
  
  const server = await createOpencodeServer({
    port: options.port ?? 4097,   // 4097 to avoid conflict with sidecar's 4096
    cwd: process.cwd(),
  });
  
  const client = createOpencodeClient({ baseUrl: server.url });
  
  return { client, server, url: server.url };
}
```

### Create Session + Send Prompt

```typescript
// shadow-agent/src/inference/shadow-inference-engine.ts

export async function runShadowInference(
  client: any,
  sessionId: string,
  contextPacket: ShadowContextPacket
): Promise<ShadowInsight[]> {
  
  const { system, userMessage } = buildShadowPrompt(contextPacket);
  
  await client.session.promptAsync({
    path: { id: sessionId },
    body: {
      model: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
      parts: [{ type: 'text', text: userMessage }],
      system,
      // Read-only agent: no file write tools
      tools: ['read_file', 'glob', 'grep'],
    }
  });
  
  // Poll for completion (see sidecar's headless polling pattern)
  const result = await pollForCompletion(client, sessionId);
  
  // Parse structured JSON from model output
  return parseInsightResponse(result);
}
```

---

## Context Packet Format

What shadow-agent sends to the model:

```typescript
interface ShadowContextPacket {
  // Observed session metadata
  sessionId: string;
  observedAgent: 'claude-code' | 'codex' | 'opencode' | 'unknown';
  sessionDuration: number;  // seconds
  
  // Current derived state (from derive.ts)
  currentPhase: AgentPhase;
  riskSignals: RiskSignal[];
  fileAttention: FileAttentionEntry[];
  nextMoves: string[];
  
  // Recent event window (last N events, not entire transcript)
  recentEvents: CanonicalEvent[];   // last 20-50 events
  
  // Accumulated context
  toolCallHistory: {
    tool: string;
    args: string;      // human-readable summary
    result: 'success' | 'error';
    timestamp: string;
  }[];
  
  // Files the agent has touched
  touchedFiles: string[];
  
  // Raw last N transcript turns (for model to read directly)
  recentTranscript: {
    actor: string;
    text: string;
    timestamp: string;
  }[];
}
```

### Context Budget

Sidecar uses ~80,000 tokens max (4 chars/token). Shadow-agent is more aggressive:

| Context Component | Max Tokens | Priority |
|---|---|---|
| System prompt | 500 | Always |
| Session metadata | 200 | Always |
| Recent events (last 20) | 2,000 | Always |
| Tool call history | 3,000 | High |
| Recent transcript (last 10 turns) | 4,000 | High |
| File attention list | 500 | Medium |
| Risk signals | 300 | Medium |
| **Total** | **~10,500** | |

Keep it tight — shadow-agent calls this frequently. Don't bloat the context.

---

## System Prompt Template

```typescript
const SHADOW_SYSTEM_PROMPT = `You are Shadow, a passive observer and analyst watching a coding agent work.

Your job: read the agent's recent activity and produce a structured interpretation.

CONSTRAINTS:
- You are READ-ONLY. You cannot affect the observed agent.
- Be terse. The user sees your output in a live visualization.
- Be specific. Vague observations are useless.
- Confidence scores must be honest — not every situation warrants 0.9+.

OUTPUT FORMAT: You must respond with valid JSON only. No prose. No markdown. Pure JSON.

{
  "phase": "exploration" | "implementation" | "testing" | "debugging" | "refactoring" | "idle",
  "phaseConfidence": 0.0-1.0,
  "phaseReason": "one sentence",
  
  "riskLevel": "low" | "medium" | "high" | "critical",
  "riskSignals": [
    { "signal": "description", "severity": "low|medium|high", "confidence": 0.0-1.0 }
  ],
  
  "predictedNextAction": "description of what agent will do next",
  "predictedNextConfidence": 0.0-1.0,
  
  "observations": [
    "specific factual observation about what the agent is doing"
  ],
  
  "attention": {
    "primaryFile": "path/to/file or null",
    "intent": "what the agent seems to be trying to accomplish"
  }
}`;
```

---

## Inference Trigger Strategy

Don't call the model on every event — too expensive and noisy.

```typescript
// shadow-agent/src/inference/trigger.ts

interface TriggerConfig {
  minEventsBetween: number;    // default: 10
  maxEventsBetween: number;    // default: 50
  riskEscalationThreshold: 'medium';  // always trigger if risk rises
  timeBetweenMs: number;       // default: 30_000 (30s)
  triggerOnEventKinds: EventKind[];   // always trigger on these
}

const DEFAULT_TRIGGERS: TriggerConfig = {
  minEventsBetween: 10,
  maxEventsBetween: 50,
  riskEscalationThreshold: 'medium',
  timeBetweenMs: 30_000,
  triggerOnEventKinds: [
    'tool_failed',
    'phase_changed',   // future: derived event
    'agent_complete',
  ],
};
```

---

## Shadow-Agent's Own MCP Server

Shadow-agent should expose itself as an MCP server — so other agents (Claude Code, Codex, the user's own scripts) can query the shadow's interpretation.

Pattern lifted directly from `sidecar/src/mcp-server.js`:

```typescript
// shadow-agent/src/mcp/shadow-mcp-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export async function startShadowMcpServer() {
  const server = new McpServer({ name: 'shadow-agent', version: '0.1.0' });

  server.registerTool('shadow_status', {
    description: 'Get the shadow agent\'s current interpretation of the observed session',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true }
  }, async () => {
    const state = getShadowState();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          phase: state.currentPhase,
          riskLevel: state.riskLevel,
          latestInsight: state.latestInsight,
          fileAttention: state.fileAttention.slice(0, 5),
          predictedNextAction: state.predictedNextAction,
        }, null, 2)
      }]
    };
  });

  server.registerTool('shadow_events', {
    description: 'Get the last N canonical events from the observed session',
    inputSchema: {
      type: 'object',
      properties: { n: { type: 'number', default: 20 } }
    },
    annotations: { readOnlyHint: true }
  }, async ({ n = 20 }) => {
    const events = getRecentEvents(n);
    return { content: [{ type: 'text', text: JSON.stringify(events, null, 2) }] };
  });

  server.registerTool('shadow_ask', {
    description: 'Ask shadow-agent a specific question about the observed session',
    inputSchema: {
      type: 'object',
      properties: { question: { type: 'string' } },
      required: ['question']
    },
    annotations: { readOnlyHint: true }
  }, async ({ question }) => {
    // Trigger a fresh inference with the question as additional context
    const insight = await runFocusedInference(question);
    return { content: [{ type: 'text', text: insight }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

---

## Auth Flow

Lifted from `sidecar/src/utils/auth-json.js`:

```typescript
// Priority chain (highest wins):
// 1. ANTHROPIC_API_KEY / OPENAI_API_KEY in process.env
// 2. ~/.shadow-agent/.env
// 3. ~/.local/share/opencode/auth.json (share with OpenCode)

function loadCredentials() {
  // Step 1: already in env
  if (process.env.ANTHROPIC_API_KEY) return;
  
  // Step 2: shadow-agent .env
  const envFile = path.join(os.homedir(), '.shadow-agent', '.env');
  if (fs.existsSync(envFile)) loadDotenv(envFile);
  
  // Step 3: inherit from OpenCode's auth
  const authJson = path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json');
  if (fs.existsSync(authJson)) {
    const auth = JSON.parse(fs.readFileSync(authJson, 'utf8'));
    for (const [provider, key] of Object.entries(auth)) {
      const envVar = PROVIDER_ENV_MAP[provider];
      if (!process.env[envVar]) process.env[envVar] = key as string;
    }
  }
}
```

This means: **if the user already has OpenCode configured, shadow-agent just works with no additional auth setup.**

---

## Fallback: Direct API

When OpenCode is not installed, fall back to direct Anthropic SDK:

```typescript
import Anthropic from '@anthropic-ai/sdk';

async function runDirectInference(contextPacket: ShadowContextPacket): Promise<ShadowInsight[]> {
  const client = new Anthropic();  // uses ANTHROPIC_API_KEY from env
  
  const { system, userMessage } = buildShadowPrompt(contextPacket);
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: userMessage }],
  });
  
  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  return parseInsightResponse(text);
}
```

---

## Implementation Plan (Inference Engine Only)

Order of work — these are Phase 4 items, but scaffolding goes in now:

1. **Auth loader** (`src/inference/auth.ts`) — copy from sidecar, adapt paths
2. **OpenCode client** (`src/inference/opencode-client.ts`) — copy from sidecar
3. **Context packager** (`src/inference/context-packager.ts`) — build `ShadowContextPacket` from `DerivedState`
4. **Prompt builder** (`src/inference/prompt-builder.ts`) — system prompt + user message
5. **Response parser** (`src/inference/response-parser.ts`) — JSON → `ShadowInsight[]`
6. **Trigger engine** (`src/inference/trigger.ts`) — when to invoke inference
7. **Shadow MCP server** (`src/mcp/shadow-mcp-server.ts`) — expose shadow to other agents
8. **Direct API fallback** (`src/inference/direct-api.ts`) — Anthropic SDK fallback
9. **Wire to Electron main** — start inference server on app ready, connect to renderer

---

## What We Do NOT Do

- ❌ We do not give the shadow model write access to any files
- ❌ We do not route shadow's interpretations back into the observed agent's context
- ❌ We do not use the shadow model to generate code or make decisions
- ❌ We do not rate-limit-bust by batching inference too aggressively
- ❌ We do not store raw conversation content outside the session directory

The shadow **watches and interprets only**. Read-only is a hard constraint.
