/**
 * Response parser: converts the model's raw JSON response text into the
 * pieces the pipeline needs — legacy `ShadowInsight[]` for the existing
 * renderer paths, plus the curator's `pulse` and `galleryOps` for the exhibit
 * floor.
 *
 * Three shapes are tolerated so provider/prompt mismatches degrade gracefully:
 *
 * 1. **Curator shape (v2)** — `{ pulse: {...}, galleryOps: [...] }`. Each
 *    op's artifact is validated against the discriminated union in
 *    `src/renderer/exhibits/types.ts`; invalid artifacts are dropped with a
 *    logged reason, never rendered half-formed. The legacy insight kinds are
 *    DERIVED from this shape (see {@link deriveCuratorInsights}):
 *      pulse.phase       → {kind: 'phase'}
 *      pulse.riskLevel   → {kind: 'risk', severity from riskLevel}
 *      pulse.headline    → {kind: 'objective'}
 *      each created artifact.title+narrative → {kind: 'summary'}
 *      momentum artifact next[0]             → {kind: 'next_move'}
 * 2. **Legacy flat shape (v1)** — `{ phase, riskSignals, predictedNextAction,
 *    observations, attention }`. Parsed the old way when a response carries no
 *    `pulse`/`galleryOps`. This keeps a v1-prompted provider working.
 * 3. **Unparseable** — returns empty results with a logged warning.
 *
 * Backward compatibility contract: existing renderer paths (status strip,
 * vignette, ghost trail, ShadowPanel) consume only `ShadowInsight[]`, which
 * both live shapes produce.
 */
import type { ShadowInsight, InsightKind } from '../shared/schema';
import { createLogger, type Logger } from '../shared/logger';
import {
  AUTHORED_EXHIBIT_TYPES,
  type DecayClass,
  type ExhibitArtifact,
  type ExhibitStatus,
  type ExhibitType,
} from '../renderer/exhibits/types';
import type { GalleryOp } from './gallery-store';

const logger = createLogger({ minLevel: 'info' });

/** The small always-present object that keeps the legacy renderer paths alive. */
export interface CuratorPulse {
  phase?: string;
  phaseConfidence?: number;
  riskLevel?: string;
  headline?: string;
}

/** Everything a single curator response yields. */
export interface CuratorParseResult {
  /** Legacy insights derived from pulse + created/refreshed artifacts. */
  insights: ShadowInsight[];
  /** The pulse object, or null for the legacy flat shape. */
  pulse: CuratorPulse | null;
  /** Validated gallery ops (invalid artifacts already dropped). */
  galleryOps: GalleryOp[];
}

interface ModelResponse {
  // Curator (v2)
  pulse?: unknown;
  galleryOps?: unknown;
  // Legacy flat (v1)
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

const VALID_EXHIBIT_TYPES = new Set<string>([...AUTHORED_EXHIBIT_TYPES, 'live_graph']);
const VALID_DECAY_CLASSES = new Set<string>(['fast', 'medium', 'slow']);
const AUTHORABLE_STATUSES = new Set<string>(['fresh', 'active', 'stale']);

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

/** Confidence values arrive on either a 0..1 or a 0..100 scale; normalize. */
function normalizeConfidence(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0.5;
  return clamp(n > 1 ? n / 100 : n);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Structural (not exhaustive) validation of one exhibit type's payload. Checks
 * that the collections and scalars an exhibit component reads are present and
 * of the right shape, so nothing renders half-formed. Returns true when the
 * payload is renderable.
 */
function payloadIsValid(type: ExhibitType, payload: Record<string, unknown>): boolean {
  switch (type) {
    case 'relationship_dag':
      return Array.isArray(payload.nodes) && Array.isArray(payload.edges);
    case 'activity_narrative':
      return Array.isArray(payload.beats) && Array.isArray(payload.threads);
    case 'walkthrough':
      return (
        typeof payload.headline === 'string' &&
        typeof payload.body === 'string' &&
        Array.isArray(payload.tags) &&
        Array.isArray(payload.satellites) &&
        Array.isArray(payload.files)
      );
    case 'concern_snapshot':
      return Array.isArray(payload.concerns) && Array.isArray(payload.flows);
    case 'momentum':
      return (
        typeof payload.value === 'number' &&
        Array.isArray(payload.stats) &&
        Array.isArray(payload.next) &&
        Array.isArray(payload.curation)
      );
    case 'seismograph':
      return (
        Array.isArray(payload.trace) &&
        Array.isArray(payload.annotations) &&
        typeof payload.windowMinutes === 'number'
      );
    case 'thermal_map':
      return Array.isArray(payload.cells) && isRecord(payload.hottest) && typeof payload.hottest.path === 'string';
    case 'live_graph':
      return true;
    default:
      return false;
  }
}

/**
 * Validate + normalize a raw artifact against the discriminated union in
 * `src/renderer/exhibits/types.ts`. Envelope fields (id, exhibitType, title,
 * narrative, payload) and per-type payload required fields are checked
 * structurally; envelope scalars (relevance, decayClass, status, event stamps)
 * are coerced to sane defaults rather than causing a drop, since the gallery
 * store re-stamps status/events on apply anyway. Returns null (and logs) when
 * the artifact could not be made renderable.
 */
export function validateExhibitArtifact(raw: unknown, log: Logger = logger): ExhibitArtifact | null {
  if (!isRecord(raw)) {
    log.warn('inference', 'response_parser.artifact_invalid', { reason: 'not_an_object' });
    return null;
  }
  const { id, exhibitType, title, narrative, payload } = raw;
  if (!nonEmptyString(id)) {
    log.warn('inference', 'response_parser.artifact_invalid', { reason: 'missing_id' });
    return null;
  }
  if (typeof exhibitType !== 'string' || !VALID_EXHIBIT_TYPES.has(exhibitType)) {
    log.warn('inference', 'response_parser.artifact_invalid', { reason: 'bad_exhibit_type', id, exhibitType });
    return null;
  }
  if (!nonEmptyString(title)) {
    log.warn('inference', 'response_parser.artifact_invalid', { reason: 'missing_title', id });
    return null;
  }
  if (!nonEmptyString(narrative)) {
    log.warn('inference', 'response_parser.artifact_invalid', { reason: 'missing_narrative', id });
    return null;
  }
  if (!isRecord(payload)) {
    log.warn('inference', 'response_parser.artifact_invalid', { reason: 'missing_payload', id });
    return null;
  }
  const type = exhibitType as ExhibitType;
  if (!payloadIsValid(type, payload)) {
    log.warn('inference', 'response_parser.artifact_invalid', { reason: 'bad_payload', id, exhibitType });
    return null;
  }

  const relevance = typeof raw.relevance === 'number' && Number.isFinite(raw.relevance) ? clamp(raw.relevance) : 0.5;
  const decayClass: DecayClass = VALID_DECAY_CLASSES.has(raw.decayClass as string)
    ? (raw.decayClass as DecayClass)
    : 'medium';
  const status: ExhibitStatus = AUTHORABLE_STATUSES.has(raw.status as string)
    ? (raw.status as ExhibitStatus)
    : 'fresh';
  const createdAtEvent =
    typeof raw.createdAtEvent === 'number' && Number.isFinite(raw.createdAtEvent) ? raw.createdAtEvent : 0;
  const refreshedAtEvent =
    typeof raw.refreshedAtEvent === 'number' && Number.isFinite(raw.refreshedAtEvent)
      ? raw.refreshedAtEvent
      : undefined;

  // The discriminated union is keyed by exhibitType; the structural checks
  // above guarantee the payload matches. Assemble a normalized envelope.
  return {
    id,
    exhibitType: type,
    title,
    narrative,
    relevance,
    decayClass,
    status,
    createdAtEvent,
    ...(refreshedAtEvent !== undefined ? { refreshedAtEvent } : {}),
    payload,
  } as ExhibitArtifact;
}

function parsePulse(raw: unknown): CuratorPulse | null {
  if (!isRecord(raw)) return null;
  const pulse: CuratorPulse = {};
  if (typeof raw.phase === 'string') pulse.phase = raw.phase;
  if (typeof raw.phaseConfidence === 'number') pulse.phaseConfidence = raw.phaseConfidence;
  if (typeof raw.riskLevel === 'string') pulse.riskLevel = raw.riskLevel;
  if (typeof raw.headline === 'string') pulse.headline = raw.headline;
  return pulse;
}

function parseGalleryOps(raw: unknown, log: Logger): GalleryOp[] {
  if (!Array.isArray(raw)) return [];
  const ops: GalleryOp[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) {
      log.warn('inference', 'response_parser.op_invalid', { reason: 'not_an_object' });
      continue;
    }
    const op = entry.op;
    if (op === 'create' || op === 'refresh') {
      const artifact = validateExhibitArtifact(entry.artifact, log);
      if (artifact) {
        ops.push({ op, artifact });
      }
      // validateExhibitArtifact already logged the drop reason.
    } else if (op === 'retire') {
      if (nonEmptyString(entry.artifactId)) {
        ops.push({
          op: 'retire',
          artifactId: entry.artifactId,
          reason: typeof entry.reason === 'string' ? entry.reason : 'Retired by the curator.',
        });
      } else {
        log.warn('inference', 'response_parser.op_invalid', { reason: 'retire_missing_id' });
      }
    } else {
      log.warn('inference', 'response_parser.op_invalid', { reason: 'unknown_op', op });
    }
  }
  return ops;
}

const RISK_SEVERITY: Record<string, string> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  critical: 'high',
};
const RISK_CONFIDENCE: Record<string, number> = {
  low: 0.5,
  medium: 0.6,
  high: 0.8,
  critical: 0.9,
};

/**
 * Derive the legacy `ShadowInsight[]` from the curator's pulse + ops so the
 * existing renderer paths (status strip, vignette, ghost trail, ShadowPanel)
 * keep working unchanged during the transition to the exhibit floor.
 */
export function deriveCuratorInsights(pulse: CuratorPulse | null, ops: GalleryOp[]): ShadowInsight[] {
  const insights: ShadowInsight[] = [];

  if (pulse?.phase) {
    insights.push(
      makeInsight('phase', `Phase: ${pulse.phase}`, asConfidence(pulse.phaseConfidence), { phase: pulse.phase })
    );
  }
  if (pulse?.riskLevel) {
    const level = pulse.riskLevel.toLowerCase();
    insights.push(
      makeInsight('risk', `Risk level: ${pulse.riskLevel}`, RISK_CONFIDENCE[level] ?? 0.6, {
        riskLevel: pulse.riskLevel,
        severity: RISK_SEVERITY[level] ?? 'medium',
      })
    );
  }
  if (pulse?.headline) {
    insights.push(makeInsight('objective', pulse.headline, asConfidence(pulse.phaseConfidence)));
  }

  for (const op of ops) {
    if (op.op === 'create') {
      const { title, narrative, relevance } = op.artifact;
      insights.push(makeInsight('summary', `${title} — ${narrative}`, relevance));
    }
    // next_move comes from momentum artifacts (created or refreshed).
    if ((op.op === 'create' || op.op === 'refresh') && op.artifact.exhibitType === 'momentum') {
      const next = (op.artifact.payload as { next?: Array<{ title?: string; confidence?: number }> }).next;
      const first = Array.isArray(next) ? next[0] : undefined;
      if (first && nonEmptyString(first.title)) {
        insights.push(makeInsight('next_move', first.title, normalizeConfidence(first.confidence)));
      }
    }
  }

  return insights;
}

/** Parse the legacy flat (v1) response shape into insights. */
function parseLegacyFlat(parsed: ModelResponse): ShadowInsight[] {
  const insights: ShadowInsight[] = [];

  // Phase
  if (parsed.phase) {
    insights.push(
      makeInsight('phase', parsed.phaseReason ?? `Phase: ${parsed.phase}`, asConfidence(parsed.phaseConfidence), {
        phase: parsed.phase,
      })
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
      makeInsight('risk', rs.signal, asConfidence(rs.confidence), {
        severity: rs.severity ?? 'medium',
        riskLevel: parsed.riskLevel ?? 'low',
      })
    );
  }

  // Predicted next action
  if (parsed.predictedNextAction) {
    insights.push(makeInsight('next_move', parsed.predictedNextAction, asConfidence(parsed.predictedNextConfidence)));
  }

  // Attention intent → objective
  if (parsed.attention?.intent) {
    insights.push(
      makeInsight('objective', parsed.attention.intent, 0.7, { primaryFile: parsed.attention.primaryFile ?? null })
    );
  }

  // Observations. Same untrusted-JSON guard: ignore a non-array `observations`
  // (e.g. `{"observations": 42}`) and skip non-string / empty entries.
  const observations: unknown[] = Array.isArray(parsed.observations) ? parsed.observations : [];
  for (const obs of observations) {
    if (typeof obs !== 'string' || !obs) continue;
    insights.push(makeInsight('summary', obs, 0.6));
  }

  return insights;
}

/**
 * Full curator parse: returns insights + pulse + validated gallery ops. Detects
 * the curator (v2) shape by the presence of `pulse` or `galleryOps`; otherwise
 * falls back to the legacy flat (v1) parse so a v1-prompted provider degrades
 * gracefully.
 */
export function parseCuratorResponse(text: string, log: Logger = logger): CuratorParseResult {
  const parsed = parseModelObject(text);
  if (!parsed) {
    log.warn('inference', 'response_parser.json_parse_failed', { preview: text.slice(0, 200) });
    return { insights: [], pulse: null, galleryOps: [] };
  }

  const isCurator = isRecord(parsed.pulse) || Array.isArray(parsed.galleryOps);
  if (!isCurator) {
    const insights = parseLegacyFlat(parsed);
    log.debug('inference', 'response_parser.parsed', { shape: 'legacy', insightCount: insights.length });
    return { insights, pulse: null, galleryOps: [] };
  }

  const pulse = parsePulse(parsed.pulse);
  const galleryOps = parseGalleryOps(parsed.galleryOps, log);
  const insights = deriveCuratorInsights(pulse, galleryOps);
  log.debug('inference', 'response_parser.parsed', {
    shape: 'curator',
    insightCount: insights.length,
    opCount: galleryOps.length,
  });
  return { insights, pulse, galleryOps };
}

/**
 * Legacy entry point: returns only the derived `ShadowInsight[]`. Retained so
 * existing callers (replay checkpoint scoring, tests) keep their signature.
 * Handles all three shapes via {@link parseCuratorResponse}.
 */
export function parseModelResponse(text: string): ShadowInsight[] {
  return parseCuratorResponse(text).insights;
}
