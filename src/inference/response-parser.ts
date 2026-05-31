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

function tryParseJson(candidate: string): ModelResponse | null {
  try {
    return JSON.parse(candidate) as ModelResponse;
  } catch {
    return null;
  }
}

/**
 * Extracts the first balanced top-level `{...}` object from arbitrary text,
 * skipping braces inside strings. Lets us recover the JSON object from
 * prose-wrapped or extra-fenced output that local OpenAI-compatible endpoints
 * (llama.cpp, vLLM, Ollama, LM Studio) commonly emit.
 */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) {
    return null;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

/**
 * Tolerant model-object parse. STRICT SUPERSET of the previous behavior: a
 * clean (optionally single-fenced) JSON response parses byte-identically via
 * step 1; only when that fails do we fall back to extracting a balanced object
 * from prose/multi-fence wrappers.
 */
function parseModelObject(text: string): ModelResponse | null {
  const direct = tryParseJson(stripMarkdownFences(text));
  if (direct) {
    return direct;
  }
  const extracted = extractFirstJsonObject(text);
  if (extracted) {
    return tryParseJson(extracted);
  }
  return null;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Provider confidence is untrusted JSON: a wrong-typed value (e.g. "high" or
 * null) would coerce to NaN through clamp() and propagate into the insight.
 * Accept only finite numbers; everything else falls back to the neutral 0.5.
 */
function asConfidence(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? clamp(n) : 0.5;
}

function makeInsight(
  kind: InsightKind,
  summary: string,
  confidence: number,
  structuredPayload?: Record<string, unknown>
): ShadowInsight {
  return {
    kind,
    source: 'model',
    confidence: clamp(confidence),
    scope: 'session',
    summary,
    evidenceEventIds: [],
    structuredPayload,
  };
}

export function parseModelResponse(text: string): ShadowInsight[] {
  const parsed = parseModelObject(text);

  if (!parsed) {
    logger.warn('inference', 'response_parser.json_parse_failed', {
      preview: text.slice(0, 200),
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
        asConfidence(parsed.phaseConfidence),
        { phase: parsed.phase }
      )
    );
  }

  // Risk signals. `parsed` is untrusted provider JSON, so the field may not be
  // an array (e.g. `{"riskSignals": 42}`) and elements may not be objects —
  // guard both so malformed output is ignored rather than throwing.
  const riskSignals: unknown[] = Array.isArray(parsed.riskSignals) ? parsed.riskSignals : [];
  for (const raw of riskSignals) {
    if (!raw || typeof raw !== 'object') continue;
    const rs = raw as { signal?: string; severity?: string; confidence?: number };
    if (!rs.signal) continue;
    insights.push(
      makeInsight(
        'risk',
        rs.signal,
        asConfidence(rs.confidence),
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
        asConfidence(parsed.predictedNextConfidence)
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

  // Observations. Same untrusted-JSON guard: ignore a non-array `observations`
  // (e.g. `{"observations": 42}`) and skip non-string / empty entries.
  const observations: unknown[] = Array.isArray(parsed.observations) ? parsed.observations : [];
  for (const obs of observations) {
    if (typeof obs !== 'string' || !obs) continue;
    insights.push(makeInsight('summary', obs, 0.6));
  }

  logger.debug('inference', 'response_parser.parsed', { insightCount: insights.length });
  return insights;
}
