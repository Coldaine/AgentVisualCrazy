import { checkPromptArtifacts } from './prompt-generation.mjs';

const mismatches = await checkPromptArtifacts();

if (mismatches.length > 0) {
  for (const mismatch of mismatches) {
    console.error(mismatch);
  }
  console.error('Run `npm run prompts:generate` to refresh generated prompt artifacts.');
  process.exit(1);
}

console.log('Prompt artifacts are in sync.');
