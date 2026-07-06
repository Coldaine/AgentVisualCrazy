import type { PatternRecord, PatternTrigger } from './pattern-library';

export interface MatchResult {
  pattern: PatternRecord;
  score: number;
  reason: string;
}

export function matchPatterns(
  patterns: PatternRecord[],
  context: {
    eventCount: number;
    kinds: string[];
    toolBurstCount: number;
    riskSignalCount: number;
    phase: string;
  },
): MatchResult[] {
  const results: MatchResult[] = [];

  for (const pattern of patterns) {
    const score = scoreTrigger(pattern.trigger, context);
    if (score > 0) {
      results.push({
        pattern,
        score,
        reason: buildReason(pattern, context),
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

function scoreTrigger(trigger: PatternTrigger, context: {
  eventCount: number;
  kinds: string[];
  toolBurstCount: number;
  riskSignalCount: number;
  phase: string;
}): number {
  let score = 0;
  let checks = 0;

  if (trigger.eventCountMin !== undefined) {
    checks++;
    if (context.eventCount >= trigger.eventCountMin) score++;
  }
  if (trigger.eventCountMax !== undefined) {
    checks++;
    if (context.eventCount <= trigger.eventCountMax) score++;
  }
  if (trigger.kinds && trigger.kinds.length > 0) {
    checks++;
    const matchCount = trigger.kinds.filter((k) => context.kinds.includes(k)).length;
    if (matchCount >= Math.ceil(trigger.kinds.length / 2)) score++;
  }
  if (trigger.toolBurstThreshold !== undefined) {
    checks++;
    if (context.toolBurstCount >= trigger.toolBurstThreshold) score++;
  }
  if (trigger.riskSignalCount !== undefined) {
    checks++;
    if (context.riskSignalCount >= trigger.riskSignalCount) score++;
  }
  if (trigger.phase) {
    checks++;
    if (context.phase === trigger.phase) score++;
  }

  if (checks === 0) return 0;
  return score / checks;
}

function buildReason(pattern: PatternRecord, context: {
  eventCount: number;
  kinds: string[];
  toolBurstCount: number;
  riskSignalCount: number;
  phase: string;
}): string {
  const parts: string[] = [];
  const t = pattern.trigger;
  if (t.phase && context.phase === t.phase) parts.push(`phase=${context.phase}`);
  if (t.eventCountMin !== undefined && context.eventCount >= t.eventCountMin) parts.push(`events>=${t.eventCountMin}`);
  if (t.toolBurstThreshold !== undefined && context.toolBurstCount >= t.toolBurstThreshold) parts.push(`toolBurst>=${t.toolBurstThreshold}`);
  if (t.riskSignalCount !== undefined && context.riskSignalCount >= t.riskSignalCount) parts.push(`risks>=${t.riskSignalCount}`);
  return parts.length > 0 ? parts.join(', ') : 'matched';
}
