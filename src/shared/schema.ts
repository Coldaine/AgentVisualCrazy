/**
 * Known event sources used by the current set of capture drivers.
 *
 * `EventSource` is intentionally open (`string`) rather than a closed union so
 * new harness drivers (Cursor hook receiver, Codex JSONL tail, Gemini OTLP,
 * etc.) can register their own source strings without modifying this file.
 * `KnownEventSource` preserves autocomplete for the values shipped in-tree.
 *
 * Spill-to-disk persistence in event-buffer.ts does not validate this type,
 * so widening is safe at the persistence layer. See
 * docs/plans/plan-multi-harness-mvp.md for the broader refactor context.
 */
export const KnownEventSources = {
  claudeHook: 'claude-hook',
  claudeTranscript: 'claude-transcript',
  codexRollout: 'codex-rollout',
  replay: 'replay',
  shadowRuntime: 'shadow-runtime',
} as const;

export type KnownEventSource = (typeof KnownEventSources)[keyof typeof KnownEventSources];

// The `(string & {})` intersection keeps the KnownEventSource literals visible
// in IDE autocomplete while still accepting any string at the type level.
// See https://github.com/microsoft/TypeScript/issues/29729 for the pattern.
export type EventSource = KnownEventSource | (string & {});

export type EventKind =
  | 'session_started'
  | 'session_ended'
  | 'agent_spawned'
  | 'agent_completed'
  | 'agent_idle'
  | 'message'
  | 'tool_started'
  | 'tool_completed'
  | 'tool_failed'
  | 'subagent_dispatched'
  | 'subagent_returned'
  | 'permission_requested'
  | 'context_snapshot'
  | 'shadow_insight';

export type InsightKind =
  | 'objective'
  | 'phase'
  | 'risk'
  | 'next_move'
  | 'attention'
  | 'summary';

export interface CanonicalEvent<TPayload = Record<string, unknown>> {
  id: string;
  sessionId: string;
  source: EventSource;
  timestamp: string;
  actor: string;
  kind: EventKind;
  payload: TPayload;
  /**
   * Identifies the harness driver that produced this event (e.g.
   * 'claude-code', 'cursor', 'codex'). Optional during the multi-harness
   * migration; the driver registry assigns 'claude-code' as the default
   * when an event with `source: 'claude-transcript'` or `'claude-hook'`
   * arrives without an explicit `harnessId`.
   */
  harnessId?: string;
  /** SemVer of the driver bundle that produced this event. Optional. */
  driverVersion?: string;
  /**
   * Free-form key used to group concurrently-observed harness sessions
   * that share a logical context (e.g. the same workspace cwd). Optional;
   * each harness session still has its own distinct `sessionId`.
   */
  correlationId?: string;
}

export interface ShadowInsight {
  kind: InsightKind;
  /**
   * Provenance of this insight. `'model'` = produced by the shadow inference
   * model (see inference/response-parser.ts); `'heuristic'` = rule-based
   * fallback (see shared/derive.ts buildInsights). The renderer quarantines
   * the two: model insights are rendered when present, heuristic insights only
   * as an explicitly-labeled fallback — they are never interleaved by kind.
   */
  source: 'model' | 'heuristic';
  confidence: number;
  scope: 'session' | 'agent' | 'file';
  summary: string;
  evidenceEventIds: string[];
  structuredPayload?: Record<string, unknown>;
}

export interface SessionRecord {
  sessionId: string;
  title: string;
  startedAt: string;
  updatedAt: string;
  source: EventSource;
  eventCount: number;
}

export type EventQueueBackpressureLevel = 'normal' | 'high' | 'critical';

export interface EventQueueBackpressureState {
  level: EventQueueBackpressureLevel;
  shouldThrottle: boolean;
  totalRatio: number;
  pendingWrites: number;
}

export interface EventQueueCheckpoint {
  consumerId: string;
  lastOffset: number;
  lastEventId?: string;
  updatedAt: string;
}

export interface EventQueueConsumerLag extends EventQueueCheckpoint {
  lag: number;
}

export interface EventQueueMetrics {
  memoryDepth: number;
  spilledDepth: number;
  totalDepth: number;
  memoryCapacity: number;
  totalCapacity: number;
  pendingWrites: number;
  subscriberCount: number;
  oldestOffset: number | null;
  newestOffset: number | null;
  consumers: EventQueueConsumerLag[];
  backpressure: EventQueueBackpressureState;
}

export interface TranscriptPrivacySettings {
  allowRawTranscriptStorage: boolean;
  allowOffHostInference: boolean;
}

export interface PrivacyPolicy extends TranscriptPrivacySettings {
  processingMode: 'local-only' | 'off-host-opted-in';
  transcriptHandling: 'sanitized-by-default';
}

export interface LoadedSource {
  kind: 'fixture' | 'replay' | 'transcript';
  label: string;
  path?: string;
}

export interface RendererInput {
  source: LoadedSource;
  record: SessionRecord;
  state: DerivedState;
  events: CanonicalEvent[];
  privacy: PrivacyPolicy;
}

export interface SnapshotPayload extends RendererInput {
  captureQueue?: EventQueueMetrics;
  /**
   * The current exhibit-floor gallery for live/replay snapshots, produced by
   * the shadow curator (see src/inference/gallery-store.ts). Undefined for the
   * boot/fixture snapshot — the renderer's ExhibitStage falls back to its
   * hand-authored fixture gallery in that case. Type-only import: erased at
   * runtime, so the shared layer carries no dependency on the renderer.
   */
  gallery?: import('../renderer/exhibits/types').ExhibitArtifact[];
}

export interface ExportResult {
  canceled: boolean;
  filePath?: string;
  error?: string;
}

export interface ShadowAgentBridge {
  bootstrap: () => Promise<SnapshotPayload>;
  onLiveEvents: (callback: (events: CanonicalEvent[]) => void) => () => void;
  getLiveSnapshot: () => Promise<SnapshotPayload | null>;
  openReplayFile: () => Promise<SnapshotPayload | null>;
  getPrivacyPolicy: () => Promise<PrivacyPolicy>;
  updatePrivacySettings: (updates: Partial<TranscriptPrivacySettings>) => Promise<PrivacyPolicy>;
  exportReplayJsonl: (
    events: CanonicalEvent[],
    suggestedFileName?: string,
    options?: { storeRawTranscript?: boolean }
  ) => Promise<ExportResult>;
}

export interface AgentNode {
  id: string;
  label: string;
  parentId?: string;
  /**
   * Identifies the harness driver associated with this agent node so the
   * renderer can apply a per-harness palette accent without forking layout.
   * Optional during the multi-harness migration.
   */
  harnessId?: string;
  state: 'active' | 'idle' | 'completed';
  toolCount: number;
}

export interface TimelineItem {
  id: string;
  timestamp: string;
  label: string;
  kind: EventKind;
}

export interface DerivedState {
  sessionId: string;
  title: string;
  currentObjective: string;
  activePhase: string;
  agentNodes: AgentNode[];
  timeline: TimelineItem[];
  transcript: Array<{ id: string; actor: string; text: string; timestamp: string; redacted: boolean }>;
  fileAttention: Array<{ filePath: string; touches: number }>;
  riskSignals: string[];
  nextMoves: string[];
  shadowInsights: ShadowInsight[];
}
