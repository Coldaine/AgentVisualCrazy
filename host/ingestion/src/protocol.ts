/**
 * Re-export agent-flow protocol types used by the ObservationStore.
 * Source of truth remains extension/src/protocol.ts — we adapt, not rewrite.
 */
export type {
  AgentEvent,
  AgentEventType,
  SessionInfo,
  TranscriptEntry,
} from '../../../extension/src/protocol.ts'

export { emitSubagentSpawn } from '../../../extension/src/protocol.ts'
