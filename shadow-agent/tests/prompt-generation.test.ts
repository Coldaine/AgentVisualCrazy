import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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

  it('loads YAML prompt manifests as source-of-truth definitions', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'shadow-prompt-yaml-'));

    try {
      const yamlPath = path.join(tempDir, 'yaml-prompt.yaml');
      await writeFile(
        yamlPath,
        [
          'id: yaml-prompt',
          'title: YAML Prompt',
          'docsPath: docs/prompts/yaml-prompt.md',
          'runtimePath: shadow-agent/src/inference/yaml-prompt.ts',
          'runtimeExportName: YAML_PROMPT',
          'purpose:',
          '  - Verify YAML prompt manifests load through the same pipeline.',
          'designPrinciples:',
          '  - title: Keep it small.',
          '    body: One YAML manifest should behave like JSON.',
          'promptSections:',
          '  - heading: Opening',
          '    language: text',
          '    content: Hello from YAML.',
          '    commentaryTitle: Why this exists',
          '    commentary: Exercise the YAML loader path.',
          'contextPacket:',
          '  description: YAML context packet.',
          "  template: 'Session: {sessionId}'",
          '  commentaryTitle: Why plain text',
          '  commentary: The YAML fixture only needs enough shape to render.',
          'iterationLog:',
          '  - date: 2026-04-20',
          '    change: Added YAML loader coverage',
          '    reason: Keep JSON and YAML manifests on the same code path.',
          '',
        ].join('\n'),
        'utf8'
      );

      const [definition] = await loadPromptDefinitions(tempDir);

      expect(definition.id).toBe('yaml-prompt');
      expect(definition.sourcePath).toMatch(/yaml-prompt\.yaml$/);
      expect(buildFullPrompt(definition)).toBe('Hello from YAML.');
      expect(renderPromptDocs(definition)).toContain('generated from');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
