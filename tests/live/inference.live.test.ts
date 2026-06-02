/**
 * LIVE TEST — REAL model inference over a REAL ~/.claude session.
 *
 * This is the piece the heuristic-only read test could not cover: it exercises
 * the INTERPRET pillar against a live model. With `doppler run` (DEEPSEEK_API_KEY
 * present), setup-inference-env.ts points the OpenAI-compatible client at
 * DeepSeek v4 Flash and this asserts the model actually produced insights.
 *
 * It SKIPS loudly — never fails — when no endpoint is configured (plain CI, or a
 * checkout run without `doppler run`) or no real session exists. A skip means
 * "couldn't run here", never a silent pass.
 */
import { describe, it, beforeAll, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { discoverActiveSession } from '../../src/capture/session-discovery';
import { createIncrementalParser } from '../../src/capture/incremental-parser';
import { normalizeEntry } from '../../src/capture/drivers/claude-code/normalizer';
import { deriveState } from '../../src/shared/derive';
import { buildContextPacket } from '../../src/inference/context-packager';
import { buildInferenceRequest } from '../../src/inference/prompt-builder';
import { parseModelResponse } from '../../src/inference/response-parser';
import { createOpenAiCompatibleClient } from '../../src/inference/openai-compatible-client';
import type { CanonicalEvent, ShadowInsight } from '../../src/shared/schema';

let insights: ShadowInsight[] | null = null;
let skipReason = '';
let model = '';

beforeAll(async () => {
  const client = createOpenAiCompatibleClient();
  if (!client) {
    skipReason = 'no OPENAI_BASE_URL — run under `doppler run` to enable DeepSeek';
    return;
  }
  const session = await discoverActiveSession();
  if (!session) {
    skipReason = 'discoverActiveSession() found no real session';
    return;
  }

  const raw = readFileSync(session.filePath, 'utf8');
  const entries: Record<string, unknown>[] = [];
  const parser = createIncrementalParser((e) => entries.push(e));
  parser.push(raw.endsWith('\n') ? raw : raw + '\n');

  const events: CanonicalEvent[] = [];
  for (const entry of entries) {
    const sid = typeof entry.sessionId === 'string' ? entry.sessionId : session.sessionId;
    events.push(...normalizeEntry(entry, sid));
  }

  const state = deriveState(events, 'live');
  const packet = buildContextPacket(state, events);
  const request = buildInferenceRequest(packet, {
    delivery: 'off-host',
    privacy: { allowRawTranscriptStorage: false, allowOffHostInference: true },
  });

  const res = await client.infer(request);
  model = res.model;
  insights = parseModelResponse(res.text);
}, 90_000);

describe('LIVE: real model inference over a real session', () => {
  it('produces model-sourced insights', (ctx) => {
    if (!insights) {
      console.log(`[live-infer] SKIP — ${skipReason}`);
      return ctx.skip();
    }
    console.log(`[live-infer] ${model} returned ${insights.length} insights`);
    expect(insights.length).toBeGreaterThan(0);
    expect(insights.some((i) => i.source === 'model')).toBe(true);
  });
});
