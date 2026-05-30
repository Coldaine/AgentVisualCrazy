import { describe, expect, it } from 'vitest';
import { parseModelResponse } from '../../src/inference/response-parser';

const CLEAN = JSON.stringify({ phase: 'implementation', phaseConfidence: 0.8, observations: ['obs one'] });

describe('parseModelResponse hardening (strict superset)', () => {
  it('parses a clean JSON response and tags insights as model-sourced', () => {
    const insights = parseModelResponse(CLEAN);
    expect(insights.length).toBeGreaterThan(0);
    expect(insights.every((insight) => insight.source === 'model')).toBe(true);
    expect(insights.some((insight) => insight.kind === 'phase')).toBe(true);
  });

  it('produces identical insights for clean vs single-fenced JSON (no regression)', () => {
    const fenced = '```json\n' + CLEAN + '\n```';
    expect(parseModelResponse(fenced)).toEqual(parseModelResponse(CLEAN));
  });

  it('recovers JSON wrapped in prose', () => {
    const wrapped = `Sure! Here is the analysis:\n${CLEAN}\nHope that helps.`;
    expect(parseModelResponse(wrapped).some((insight) => insight.kind === 'phase')).toBe(true);
  });

  it('recovers JSON from doubled / extra markdown fences', () => {
    const doubled = '```\n```json\n' + CLEAN + '\n```\n```';
    expect(parseModelResponse(doubled).some((insight) => insight.kind === 'phase')).toBe(true);
  });

  it('extracts the balanced object even with trailing prose after the JSON', () => {
    const trailing = `${CLEAN}\n\nLet me know if you need anything else.`;
    expect(parseModelResponse(trailing).some((insight) => insight.kind === 'phase')).toBe(true);
  });

  it('returns [] for genuinely malformed output', () => {
    expect(parseModelResponse('not json at all')).toEqual([]);
    expect(parseModelResponse('{ broken')).toEqual([]);
    expect(parseModelResponse('')).toEqual([]);
  });
});
