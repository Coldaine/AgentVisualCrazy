export type EventSource = 'claude-hook' | 'claude-transcript' | 'replay' | 'shadow-runtime';

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
}

export interface ShadowInsight {
  kind: InsightKind;
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
