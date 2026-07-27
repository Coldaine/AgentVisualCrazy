/**
 * Exhibit artifact contracts — aligned with `web/components/exhibits/types.ts`.
 * Host-side copy so Electron/main can author artifacts without importing React web.
 * Keep in sync when the web vocabulary changes.
 */

export type NodeKind = 'goal' | 'turn' | 'tool' | 'file' | 'incident' | 'artifact'
export type HeatLevel = 'low' | 'medium' | 'high' | 'very-high'

export interface DagNode {
  id: string
  title: string
  subtitle: string
  kind: NodeKind
  x: number
  y: number
  note: string
  urgent?: boolean
}

export interface DagEdge {
  from: string
  to: string
  label: string
  strong?: boolean
}

export interface RelationshipDagPayload {
  nodes: DagNode[]
  edges: DagEdge[]
  focusNodeId: string
}

export interface NarrativeBeat {
  at: string
  title: string
  body: string
  side: 'top' | 'bottom'
  thread: string
}

export interface NarrativeThread {
  id: string
  label: string
  color?: string
}

export interface ActivityNarrativePayload {
  beats: NarrativeBeat[]
  threads: NarrativeThread[]
}

export interface WalkthroughTag {
  label: string
  kind: 'match' | 'addition' | 'risk'
}

export interface WalkthroughSatellite {
  id: string
  label: string
  note: string
  x: number
  y: number
}

export interface WalkthroughFile {
  label: string
  x: number
  y: number
}

export interface WalkthroughPayload {
  headline: string
  body: string
  tags: WalkthroughTag[]
  satellites: WalkthroughSatellite[]
  files: WalkthroughFile[]
}

export interface Concern {
  id: string
  title: string
  role: string
  x: number
  y: number
  w: number
  h: number
  heat: HeatLevel
}

export interface ConcernSnapshotPayload {
  concerns: Concern[]
  flows: Array<[string, string]>
}

export interface MomentumStat {
  label: string
  value: string
  tone: 'positive' | 'neutral' | 'caution' | 'negative'
}

export interface MomentumNextItem {
  title: string
  evidence: string
  confidence: number
}

export interface CurationRecommendation {
  artifactId: string
  action: 'refresh' | 'retire'
  reason: string
}

export interface MomentumPayload {
  value: number
  label: string
  stats: MomentumStat[]
  next: MomentumNextItem[]
  curation: CurationRecommendation[]
}

export interface SeismographTremor {
  at: string
  magnitude: number
  kind: NodeKind | 'merge' | 'abort' | 'failure' | 'quiet'
  label?: string
}

export interface SeismographAnnotation {
  at: string
  text: string
}

export interface SeismographPayload {
  trace: SeismographTremor[]
  annotations: SeismographAnnotation[]
  windowMinutes: number
}

export interface ThermalCell {
  path: string
  weight: number
  heat: number
  label?: string
}

export interface ThermalMapPayload {
  cells: ThermalCell[]
  hottest: { path: string; why: string }
}

export type LiveGraphPayload = Record<string, never>

export interface ExhibitPayloadMap {
  relationship_dag: RelationshipDagPayload
  activity_narrative: ActivityNarrativePayload
  walkthrough: WalkthroughPayload
  concern_snapshot: ConcernSnapshotPayload
  momentum: MomentumPayload
  seismograph: SeismographPayload
  thermal_map: ThermalMapPayload
  live_graph: LiveGraphPayload
}

export type ExhibitType = keyof ExhibitPayloadMap
export type DecayClass = 'fast' | 'medium' | 'slow'
export type ExhibitStatus = 'fresh' | 'active' | 'stale' | 'retired'

export interface ExhibitArtifactBase {
  id: string
  title: string
  narrative: string
  relevance: number
  decayClass: DecayClass
  createdAtEvent: number
  refreshedAtEvent?: number
  status: ExhibitStatus
  retirementReason?: string
}

export type ExhibitArtifact = {
  [K in ExhibitType]: ExhibitArtifactBase & {
    exhibitType: K
    payload: ExhibitPayloadMap[K]
  }
}[ExhibitType]

export const AUTHORED_EXHIBIT_TYPES: ExhibitType[] = [
  'relationship_dag',
  'activity_narrative',
  'walkthrough',
  'concern_snapshot',
  'momentum',
  'seismograph',
  'thermal_map',
]

export const EXHIBIT_TYPES: ExhibitType[] = [...AUTHORED_EXHIBIT_TYPES, 'live_graph']
