/**
 * Exhibit vocabulary — the typed artifact contracts the shadow curator fills.
 *
 * This is the v1 vocabulary from `docs/plans/plan-exhibit-floor.md`: seven
 * authored exhibit types plus `live_graph`, which wraps the existing Canvas2D
 * force graph so it can ride in the same rotation. Every exhibit the model
 * authors is wrapped in the {@link ExhibitArtifact} envelope (id, narrative,
 * relevance, decay, status) and carries a payload typed per `exhibitType` as a
 * discriminated union.
 */

/** Entity kinds used by nodes across DAG / walkthrough exhibits. */
export type NodeKind = 'goal' | 'turn' | 'tool' | 'file' | 'incident' | 'artifact';

/** Heat buckets shared by concern snapshots (and node urgency shading). */
export type HeatLevel = 'low' | 'medium' | 'high' | 'very-high';

// --- Payload contracts (one per exhibit type) ---------------------------------

export interface DagNode {
  id: string;
  title: string;
  subtitle: string;
  kind: NodeKind;
  /** Percentage coords within the frame (0..100). */
  x: number;
  y: number;
  /** Curator note surfaced in the commentary panel when this node is focused. */
  note: string;
  urgent?: boolean;
}

export interface DagEdge {
  from: string;
  to: string;
  label: string;
  strong?: boolean;
}

export interface RelationshipDagPayload {
  nodes: DagNode[];
  edges: DagEdge[];
  focusNodeId: string;
}

export interface NarrativeBeat {
  at: string;
  title: string;
  body: string;
  side: 'top' | 'bottom';
  thread: string;
}

export interface NarrativeThread {
  id: string;
  label: string;
  color?: string;
}

export interface ActivityNarrativePayload {
  beats: NarrativeBeat[];
  threads: NarrativeThread[];
}

export interface WalkthroughTag {
  label: string;
  kind: 'match' | 'addition' | 'risk';
}

export interface WalkthroughSatellite {
  id: string;
  label: string;
  note: string;
  x: number;
  y: number;
}

export interface WalkthroughFile {
  label: string;
  x: number;
  y: number;
}

export interface WalkthroughPayload {
  headline: string;
  body: string;
  tags: WalkthroughTag[];
  satellites: WalkthroughSatellite[];
  files: WalkthroughFile[];
}

export interface Concern {
  id: string;
  title: string;
  role: string;
  x: number;
  y: number;
  w: number;
  h: number;
  heat: HeatLevel;
}

export interface ConcernSnapshotPayload {
  concerns: Concern[];
  /** Directed flows between concern ids: [fromId, toId]. */
  flows: Array<[string, string]>;
}

export interface MomentumStat {
  label: string;
  value: string;
  tone: 'positive' | 'neutral' | 'caution' | 'negative';
}

export interface MomentumNextItem {
  title: string;
  evidence: string;
  /** 0..100 confidence. */
  confidence: number;
}

export interface CurationRecommendation {
  artifactId: string;
  action: 'refresh' | 'retire';
  reason: string;
}

export interface MomentumPayload {
  /** 0..100 gauge value. */
  value: number;
  label: string;
  stats: MomentumStat[];
  next: MomentumNextItem[];
  curation: CurationRecommendation[];
}

export interface SeismographTremor {
  at: string;
  /** -1..1 signed deflection magnitude. */
  magnitude: number;
  kind: NodeKind | 'merge' | 'abort' | 'failure' | 'quiet';
  label?: string;
}

export interface SeismographAnnotation {
  at: string;
  text: string;
}

export interface SeismographPayload {
  trace: SeismographTremor[];
  annotations: SeismographAnnotation[];
  windowMinutes: number;
}

export interface ThermalCell {
  path: string;
  /** Relative area weight for the treemap-ish layout. */
  weight: number;
  /** 0..1 heat, cool blue -> hot red. */
  heat: number;
  label?: string;
}

export interface ThermalMapPayload {
  cells: ThermalCell[];
  hottest: { path: string; why: string };
}

/** `live_graph` wraps the existing canvas; it carries no authored payload. */
export type LiveGraphPayload = Record<string, never>;

// --- Envelope + discriminated union ------------------------------------------

/** Maps every exhibit type to its payload contract. */
export interface ExhibitPayloadMap {
  relationship_dag: RelationshipDagPayload;
  activity_narrative: ActivityNarrativePayload;
  walkthrough: WalkthroughPayload;
  concern_snapshot: ConcernSnapshotPayload;
  momentum: MomentumPayload;
  seismograph: SeismographPayload;
  thermal_map: ThermalMapPayload;
  live_graph: LiveGraphPayload;
}

export type ExhibitType = keyof ExhibitPayloadMap;

export type DecayClass = 'fast' | 'medium' | 'slow';
export type ExhibitStatus = 'fresh' | 'active' | 'stale' | 'retired';

/** Fields every exhibit envelope shares, independent of payload. */
export interface ExhibitArtifactBase {
  /** Model-assigned, stable across refreshes. */
  id: string;
  title: string;
  /**
   * MANDATORY. What it means and why it's on the floor — not what happened.
   * Raw data is noise; the narrative is the exhibit's reason to exist.
   */
  narrative: string;
  /** 0..1, drives rotation order. */
  relevance: number;
  decayClass: DecayClass;
  /** Event index when authored. */
  createdAtEvent: number;
  refreshedAtEvent?: number;
  status: ExhibitStatus;
  /** Why an artifact was retired — rendered on the archive shelf. */
  retirementReason?: string;
}

/** The discriminated union: envelope + payload keyed by `exhibitType`. */
export type ExhibitArtifact = {
  [K in ExhibitType]: ExhibitArtifactBase & {
    exhibitType: K;
    payload: ExhibitPayloadMap[K];
  };
}[ExhibitType];

/** Narrow an artifact to a specific exhibit type. */
export type ExhibitArtifactOf<K extends ExhibitType> = Extract<ExhibitArtifact, { exhibitType: K }>;

// --- Type guards --------------------------------------------------------------

export function isExhibitOfType<K extends ExhibitType>(
  artifact: ExhibitArtifact,
  type: K
): artifact is ExhibitArtifactOf<K> {
  return artifact.exhibitType === type;
}

export const isRelationshipDag = (a: ExhibitArtifact): a is ExhibitArtifactOf<'relationship_dag'> =>
  a.exhibitType === 'relationship_dag';
export const isActivityNarrative = (a: ExhibitArtifact): a is ExhibitArtifactOf<'activity_narrative'> =>
  a.exhibitType === 'activity_narrative';
export const isWalkthrough = (a: ExhibitArtifact): a is ExhibitArtifactOf<'walkthrough'> =>
  a.exhibitType === 'walkthrough';
export const isConcernSnapshot = (a: ExhibitArtifact): a is ExhibitArtifactOf<'concern_snapshot'> =>
  a.exhibitType === 'concern_snapshot';
export const isMomentum = (a: ExhibitArtifact): a is ExhibitArtifactOf<'momentum'> =>
  a.exhibitType === 'momentum';
export const isSeismograph = (a: ExhibitArtifact): a is ExhibitArtifactOf<'seismograph'> =>
  a.exhibitType === 'seismograph';
export const isThermalMap = (a: ExhibitArtifact): a is ExhibitArtifactOf<'thermal_map'> =>
  a.exhibitType === 'thermal_map';
export const isLiveGraph = (a: ExhibitArtifact): a is ExhibitArtifactOf<'live_graph'> =>
  a.exhibitType === 'live_graph';

/** True when the artifact has been retired to the archive shelf. */
export const isRetired = (a: ExhibitArtifact): boolean => a.status === 'retired';

/** The set of all authored (non-live) exhibit types, in vocabulary order. */
export const AUTHORED_EXHIBIT_TYPES: ExhibitType[] = [
  'relationship_dag',
  'activity_narrative',
  'walkthrough',
  'concern_snapshot',
  'momentum',
  'seismograph',
  'thermal_map',
];
