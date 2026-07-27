/**
 * Minimal fake LanguageModel for tests / offline curator path.
 * Returns a fixed ExhibitArtifact[] JSON string without calling the network.
 */

import type { ExhibitArtifact } from './types.ts'

export interface MockInvestigateResult {
  text: string
  toolCalls: Array<{ toolName: string; args: Record<string, unknown> }>
}

/**
 * Deterministic gallery used when AVC_CURATOR_MODE=mock or no credentials.
 * Not a full AI SDK LanguageModel — the runner short-circuits when mode=mock.
 */
export function buildMockArtifacts(eventCursor: number): ExhibitArtifact[] {
  return [
    {
      id: 'live-graph',
      exhibitType: 'live_graph',
      title: 'Living session graph',
      narrative:
        'The agent-flow canvas remains the primary live surface while the curator samples the session.',
      relevance: 0.9,
      decayClass: 'slow',
      createdAtEvent: eventCursor,
      status: 'active',
      payload: {},
    },
    {
      id: 'mock-momentum',
      exhibitType: 'momentum',
      title: 'Session momentum (mock)',
      narrative: `Offline mock gallery at event cursor ${eventCursor}. Enable OPENAI_API_KEY or Codex OAuth for live curation.`,
      relevance: 0.55,
      decayClass: 'fast',
      createdAtEvent: eventCursor,
      status: 'fresh',
      payload: {
        value: 42,
        label: 'mock',
        stats: [{ label: 'mode', value: 'mock', tone: 'neutral' }],
        next: [
          {
            title: 'Connect a model',
            evidence: 'no credentials',
            confidence: 80,
          },
        ],
        curation: [],
      },
    },
  ]
}

export function mockInvestigateText(eventCursor: number): string {
  return JSON.stringify(buildMockArtifacts(eventCursor))
}
