import { describe, expect, it } from 'vitest';

import {
  buildFullPrompt,
  checkPromptArtifacts,
  loadPromptDefinitions,
  renderPromptDocs,
  renderRuntimePrompt,
} from '../scripts/prompt-generation.mjs';

describe('prompt generation', () => {
  it('keeps generated prompt artifacts in sync with the source manifest', async () => {
    await expect(checkPromptArtifacts()).resolves.toEqual([]);
  });

  it('assembles the runtime prompt from ordered prompt sections', async () => {
    const [definition] = await loadPromptDefinitions();
    const prompt = buildFullPrompt(definition);

    expect(prompt).toContain('You are Shadow, a passive observer and analyst');
    expect(prompt).toContain('"riskLevel": "low" | "medium" | "high" | "critical"');
    expect(prompt).toContain('"intent": "what the agent seems to be trying to accomplish right now"');
  });

  it('renders both docs and runtime outputs from the same prompt body', async () => {
    const [definition] = await loadPromptDefinitions();
    const prompt = buildFullPrompt(definition);

    expect(renderPromptDocs(definition)).toContain(prompt);
    expect(renderRuntimePrompt(definition)).toContain(prompt);
  });
});
