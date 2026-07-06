import type { ShadowDatabase } from '../db/database';

export interface PatternTrigger {
  eventCountMin?: number;
  eventCountMax?: number;
  kinds?: string[];
  toolBurstThreshold?: number;
  riskSignalCount?: number;
  phase?: string;
}

export interface PatternVisual {
  viewName?: string;
  emphasis?: string;
  collapseThreshold?: number;
  annotationTemplate?: string;
}

export interface PatternRecord {
  id: string;
  name: string;
  origin: 'crafted' | 'harvested';
  status: 'draft' | 'review' | 'active' | 'archived';
  trigger: PatternTrigger;
  visual: PatternVisual;
  description: string;
}

export function getActivePatterns(db: ShadowDatabase): PatternRecord[] {
  const rows = db.getActivePatterns();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    origin: r.origin as PatternRecord['origin'],
    status: 'active' as const,
    trigger: (r.triggerJson ?? {}) as PatternTrigger,
    visual: (r.visualJson ?? {}) as PatternVisual,
    description: '',
  }));
}

export function getPatternById(db: ShadowDatabase, patternId: string): PatternRecord | null {
  const row = db.getPatternById(patternId);
  if (!row) return null;
  return {
    id: String(row.id),
    name: String(row.name),
    origin: String(row.origin) as PatternRecord['origin'],
    status: String(row.status) as PatternRecord['status'],
    trigger: (row as Record<string, unknown>).triggerJson as PatternTrigger,
    visual: (row as Record<string, unknown>).visualJson as PatternVisual,
    description: String(row.description),
  };
}

export function createPattern(
  db: ShadowDatabase,
  pattern: Omit<PatternRecord, 'id'>,
): string {
  return db.insertPattern({
    name: pattern.name,
    origin: pattern.origin,
    status: pattern.status ?? 'draft',
    triggerJson: pattern.trigger as unknown as Record<string, unknown>,
    visualJson: pattern.visual as unknown as Record<string, unknown>,
    description: pattern.description,
  });
}

export function promotePattern(db: ShadowDatabase, patternId: string): void {
  db.updatePatternStatus(patternId, 'active');
}

export function demotePattern(db: ShadowDatabase, patternId: string): void {
  db.updatePatternStatus(patternId, 'archived');
}

export function proposeHarvestedPattern(
  db: ShadowDatabase,
  name: string,
  trigger: PatternTrigger,
  visual: PatternVisual,
  description: string,
): string {
  return db.insertPattern({
    name,
    origin: 'harvested',
    status: 'review',
    triggerJson: trigger as unknown as Record<string, unknown>,
    visualJson: visual as unknown as Record<string, unknown>,
    description,
  });
}
