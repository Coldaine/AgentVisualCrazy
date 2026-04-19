/**
 * Response parser: converts the model's raw JSON response text into ShadowInsight[].
 *
 * Handles: markdown-fenced JSON, missing fields, malformed output.
 * Per the plan:
 *   phase → {kind: 'phase', confidence: phaseConfidence}
 *   riskSignals[i] → {kind: 'risk'}
 *   predictedNextAction → {kind: 'next_move'}
 *   attention.intent → {kind: 'objective'}
 *   observations[i] → {kind: 'summary'}
 */
import type { ShadowInsight, InsightKind } from '../shared/schema';
import { createLogger } from '../shared/logger';

const logger = createLogger({ minLevel: 'info' });

interface ModelResponse {
  phase?: string;
  phaseConfidence?: number;
  phaseReason?: string;
  riskLevel?: string;
  riskSignals?: Array<{ signal?: string; severity?: string; confidence?: number }>;
  predictedNextAction?: string;
  predictedNextConfidence?: number;
  observations?: string[];
  attention?: { primaryFile?: string | null; intent?: string };
}

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function makeInsight(
  kind: InsightKind,
  summary: string,
  confidence: number,
  structuredPayload?: Record<string, unknown>
): ShadowInsight {
  return {
    kind,
    confidence: clamp(confidence),
    scope: 'session',
    summary,
    evidenceEventIds: [],
    structuredPayload,
  };
}

export function parseModelResponse(text: string): ShadowInsight[] {
  const cleaned = stripMarkdownFences(text);
  let parsed: ModelResponse;

  try {
    parsed = JSON.parse(cleaned) as ModelResponse;
  } catch {
    logger.warn('inference', 'response_parser.json_parse_failed', {
      preview: cleaned.slice(0, 200),
    });
    return [];
  }

  const insights: ShadowInsight[] = [];

  // Phase
  if (parsed.phase) {
    insights.push(
      makeInsight(
        'phase',
        parsed.phaseReason ?? `Phase: ${parsed.phase}`,
        parsed.phaseConfidence ?? 0.5,
        { phase: parsed.phase }
      )
    );
  }

  // Risk signals
  for (const rs of parsed.riskSignals ?? []) {
    if (!rs.signal) continue;
    insights.push(
      makeInsight(
        'risk',
        rs.signal,
        rs.confidence ?? 0.5,
        { severity: rs.severity ?? 'medium', riskLevel: parsed.riskLevel ?? 'low' }
      )
    );
  }

  // Predicted next action
  if (parsed.predictedNextAction) {
    insights.push(
      makeInsight(
        'next_move',
        parsed.predictedNextAction,
        parsed.predictedNextConfidence ?? 0.5
      )
    );
  }

  // Attention intent → objective
  if (parsed.attention?.intent) {
    insights.push(
      makeInsight(
        'objective',
        parsed.attention.intent,
        0.7,
        { primaryFile: parsed.attention.primaryFile ?? null }
      )
    );
  }

  // Observations
  for (const obs of parsed.observations ?? []) {
    if (!obs) continue;
    insights.push(makeInsight('summary', obs, 0.6));
  }

  logger.debug('inference', 'response_parser.parsed', { insightCount: insights.length });
  return insights;
}
