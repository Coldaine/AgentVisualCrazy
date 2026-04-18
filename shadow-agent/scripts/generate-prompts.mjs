import { generatePromptArtifacts } from './prompt-generation.mjs';

const results = await generatePromptArtifacts();

for (const result of results) {
  const status = [
    result.docsChanged ? 'docs updated' : 'docs unchanged',
    result.runtimeChanged ? 'runtime updated' : 'runtime unchanged',
  ].join(', ');

  console.log(`${result.id}: ${status}`);
}
