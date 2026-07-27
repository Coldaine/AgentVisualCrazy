/**
 * Listen for curator exhibit-artifacts from Electron preload
 * (`window.agentVisual.onExhibits` / `onMessage`) or window message bridge.
 */
import { useEffect, useState } from 'react'
import type { DecayClass, ExhibitArtifact, ExhibitStatus, ExhibitType } from '@/components/exhibits/types'
import { AUTHORED_EXHIBIT_TYPES } from '@/components/exhibits/types'

const EXHIBIT_TYPE_SET = new Set<string>([...AUTHORED_EXHIBIT_TYPES, 'live_graph'])

export interface ExhibitArtifactsMessage {
  type: 'exhibit-artifacts'
  artifacts: ExhibitArtifact[]
  mode?: string
  reason?: string
  at?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function coerceArtifact(raw: unknown): ExhibitArtifact | null {
  if (!isRecord(raw)) return null
  const exhibitType = raw.exhibitType
  if (typeof exhibitType !== 'string' || !EXHIBIT_TYPE_SET.has(exhibitType)) return null
  if (typeof raw.id !== 'string' || !raw.id) return null
  if (typeof raw.title !== 'string' || !raw.title) return null
  if (typeof raw.narrative !== 'string') return null
  if (typeof raw.relevance !== 'number' || !Number.isFinite(raw.relevance)) return null

  const decayClass = (typeof raw.decayClass === 'string' ? raw.decayClass : 'medium') as DecayClass
  const status = (typeof raw.status === 'string' ? raw.status : 'fresh') as ExhibitStatus
  const createdAtEvent =
    typeof raw.createdAtEvent === 'number' && Number.isFinite(raw.createdAtEvent)
      ? raw.createdAtEvent
      : 0

  return {
    id: raw.id,
    exhibitType: exhibitType as ExhibitType,
    title: raw.title,
    narrative: raw.narrative,
    relevance: Math.min(1, Math.max(0, raw.relevance)),
    decayClass:
      decayClass === 'fast' || decayClass === 'medium' || decayClass === 'slow'
        ? decayClass
        : 'medium',
    createdAtEvent,
    refreshedAtEvent:
      typeof raw.refreshedAtEvent === 'number' ? raw.refreshedAtEvent : undefined,
    status:
      status === 'fresh' || status === 'active' || status === 'stale' || status === 'retired'
        ? status
        : 'fresh',
    retirementReason:
      typeof raw.retirementReason === 'string' ? raw.retirementReason : undefined,
    payload: (isRecord(raw.payload) ? raw.payload : {}) as ExhibitArtifact['payload'],
  } as ExhibitArtifact
}

/** Extract typed artifacts from an IPC / host message payload. */
export function extractExhibitArtifacts(message: unknown): ExhibitArtifact[] | null {
  if (!isRecord(message)) return null
  if (message.type !== 'exhibit-artifacts') return null
  if (!Array.isArray(message.artifacts)) return null
  const out = message.artifacts
    .map(coerceArtifact)
    .filter((a): a is ExhibitArtifact => a != null)
  return out.length > 0 ? out : null
}

/**
 * Subscribe to live exhibit updates. Returns null until the first valid
 * `exhibit-artifacts` message arrives.
 */
export function useLiveExhibitArtifacts(): ExhibitArtifact[] | null {
  const [artifacts, setArtifacts] = useState<ExhibitArtifact[] | null>(null)

  useEffect(() => {
    const apply = (message: unknown) => {
      const next = extractExhibitArtifacts(message)
      if (next) setArtifacts(next)
    }

    const unsubs: Array<() => void> = []
    const api = window.agentVisual

    if (api?.onExhibits) {
      unsubs.push(api.onExhibits(apply))
    }
    if (api?.onMessage) {
      unsubs.push(api.onMessage(apply))
    }

    const onWindowMessage = (event: MessageEvent) => {
      apply(event.data)
    }
    window.addEventListener('message', onWindowMessage)

    return () => {
      for (const unsub of unsubs) unsub()
      window.removeEventListener('message', onWindowMessage)
    }
  }, [])

  return artifacts
}
