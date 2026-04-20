import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const expectedHooksPath = '.githooks';
const hooksDir = path.join(repoRoot, expectedHooksPath);

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    return { ok: false, message: result.error.message };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      message: result.stderr.trim() || result.stdout.trim() || `git ${args.join(' ')} failed`,
    };
  }

  return { ok: true, output: result.stdout.trim() };
}

if (!existsSync(hooksDir)) {
  console.warn(`Skipping git hook install because ${expectedHooksPath}/ does not exist.`);
  process.exit(0);
}

const repoCheck = runGit(['rev-parse', '--show-toplevel']);
if (!repoCheck.ok) {
  console.warn(`Skipping git hook install: ${repoCheck.message}`);
  process.exit(0);
}

const repoTopLevel = path.resolve(repoCheck.output);
if (repoTopLevel !== repoRoot) {
  console.warn(`Skipping git hook install because ${repoRoot} is not the repo root (${repoTopLevel}).`);
  process.exit(0);
}

const currentHooksPath = runGit(['config', '--local', '--get', 'core.hooksPath']);
if (currentHooksPath.ok && currentHooksPath.output === expectedHooksPath) {
  console.log(`Git hooks already point at ${expectedHooksPath}.`);
  process.exit(0);
}

const configResult = runGit(['config', '--local', 'core.hooksPath', expectedHooksPath]);
if (!configResult.ok) {
  console.error(`Failed to configure git hooks: ${configResult.message}`);
  process.exit(1);
}

console.log(`Configured git hooks to use ${expectedHooksPath}.`);
