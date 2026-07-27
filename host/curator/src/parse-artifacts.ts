import { z } from 'zod'
import type { ExhibitArtifact, ExhibitType } from './types.ts'
import { EXHIBIT_TYPES } from './types.ts'

const exhibitTypeSchema = z.enum(EXHIBIT_TYPES as [ExhibitType, ...ExhibitType[]])

const artifactSchema = z
  .object({
    id: z.string().min(1),
    exhibitType: exhibitTypeSchema,
    title: z.string().min(1),
    narrative: z.string().min(1),
    relevance: z.number().min(0).max(1),
    decayClass: z.enum(['fast', 'medium', 'slow']),
    createdAtEvent: z.number().optional(),
    refreshedAtEvent: z.number().optional(),
    status: z.enum(['fresh', 'active', 'stale', 'retired']).optional(),
    retirementReason: z.string().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()

/**
 * Parse model text into ExhibitArtifact[]. Tolerates markdown fences.
 */
export function parseExhibitArtifacts(text: string, eventCursor: number): ExhibitArtifact[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  let jsonText = trimmed
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) jsonText = fence[1].trim()

  // Prefer array; also accept { artifacts: [...] }
  let raw: unknown
  try {
    raw = JSON.parse(jsonText)
  } catch {
    const start = jsonText.indexOf('[')
    const end = jsonText.lastIndexOf(']')
    if (start >= 0 && end > start) {
      raw = JSON.parse(jsonText.slice(start, end + 1))
    } else {
      throw new Error('Curator output is not valid JSON artifacts array')
    }
  }

  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { artifacts?: unknown }).artifacts)
      ? (raw as { artifacts: unknown[] }).artifacts
      : null

  if (!list) throw new Error('Curator output must be an ExhibitArtifact array')

  const out: ExhibitArtifact[] = []
  for (const item of list) {
    const parsed = artifactSchema.safeParse(item)
    if (!parsed.success) continue
    const a = parsed.data
    out.push({
      id: a.id,
      exhibitType: a.exhibitType,
      title: a.title,
      narrative: a.narrative,
      relevance: a.relevance,
      decayClass: a.decayClass,
      createdAtEvent: a.createdAtEvent ?? eventCursor,
      refreshedAtEvent: a.refreshedAtEvent,
      status: a.status ?? 'fresh',
      retirementReason: a.retirementReason,
      payload: (a.payload ?? {}) as ExhibitArtifact['payload'],
    } as ExhibitArtifact)
  }
  return out
}
