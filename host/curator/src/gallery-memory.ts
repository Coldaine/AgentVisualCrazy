import type { ExhibitArtifact, ExhibitStatus } from './types.ts'

/**
 * In-memory session gallery (M5). Refresh / retire / list prior artifacts
 * across curator triggers within one Electron process lifetime.
 */
export class GalleryMemory {
  private readonly byId = new Map<string, ExhibitArtifact>()

  list(options?: { includeRetired?: boolean }): ExhibitArtifact[] {
    const includeRetired = options?.includeRetired ?? false
    const all = [...this.byId.values()]
    return includeRetired ? all : all.filter((a) => a.status !== 'retired')
  }

  get(id: string): ExhibitArtifact | undefined {
    return this.byId.get(id)
  }

  /** Upsert artifacts; preserves createdAtEvent when refreshing an existing id. */
  upsertMany(artifacts: ExhibitArtifact[], eventCursor: number): ExhibitArtifact[] {
    const out: ExhibitArtifact[] = []
    for (const next of artifacts) {
      const prev = this.byId.get(next.id)
      const merged: ExhibitArtifact = prev
        ? ({
            ...next,
            createdAtEvent: prev.createdAtEvent,
            refreshedAtEvent: eventCursor,
            status: next.status === 'retired' ? 'retired' : ('active' as ExhibitStatus),
          } as ExhibitArtifact)
        : ({
            ...next,
            createdAtEvent: next.createdAtEvent ?? eventCursor,
            status: next.status ?? 'fresh',
          } as ExhibitArtifact)
      this.byId.set(merged.id, merged)
      out.push(merged)
    }
    return out
  }

  retire(id: string, reason: string): ExhibitArtifact | undefined {
    const prev = this.byId.get(id)
    if (!prev) return undefined
    const retired = {
      ...prev,
      status: 'retired' as const,
      retirementReason: reason,
    } as ExhibitArtifact
    this.byId.set(id, retired)
    return retired
  }

  markStale(ids: string[]): void {
    for (const id of ids) {
      const prev = this.byId.get(id)
      if (!prev || prev.status === 'retired') continue
      this.byId.set(id, { ...prev, status: 'stale' } as ExhibitArtifact)
    }
  }

  clear(): void {
    this.byId.clear()
  }

  get size(): number {
    return this.byId.size
  }
}
