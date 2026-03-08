# Self-Documentation Enforcement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add pre-commit and pre-push hooks with secret detection, file size enforcement, CLAUDE.md drift checking, and a portable scaffolding kit for reuse across projects.

**Architecture:** husky manages git hooks, lint-staged runs ESLint on staged files. Three custom scripts handle secret detection, file size limits, and doc drift. Everything is also packaged as a portable `docs/scaffolding/` kit with a bootstrap script.

**Tech Stack:** husky, lint-staged, Node.js scripts (no new runtime deps)

**Security Note:** Scripts use `execFileSync` (not `execSync`) to avoid shell injection. See `src/utils/execFileNoThrow.ts` for the project pattern.

---

### Task 1: Install husky + lint-staged

**Files:**
- Modify: `package.json`

**Step 1: Install dev dependencies**

Run:
```bash
cd /Users/john_renaldi/claude-code-projects/sidecar && npm install --save-dev husky lint-staged
```

**Step 2: Initialize husky**

Run:
```bash
cd /Users/john_renaldi/claude-code-projects/sidecar && npx husky init
```

This creates `.husky/` directory and adds `"prepare": "husky"` to package.json scripts.

**Step 3: Add lint-staged config to package.json**

Add to `package.json`:
```json
"lint-staged": {
  "src/**/*.js": [
    "eslint --fix"
  ]
}
```

**Step 4: Verify husky is wired**

Run:
```bash
ls -la /Users/john_renaldi/claude-code-projects/sidecar/.husky/
```
Expected: `.husky/` directory exists with a `pre-commit` file.

**Step 5: Commit**

```bash
git add package.json package-lock.json .husky/
git commit -m "chore: add husky and lint-staged for pre-commit hooks"
```

---

### Task 2: Write check-secrets.js (tests first)

**Files:**
- Create: `tests/scripts/check-secrets.test.js`
- Create: `scripts/check-secrets.js`

**Step 1: Write the failing test**

Create `tests/scripts/check-secrets.test.js`:

```js
import { describe, it, expect } from '@jest/globals';
import { scanForSecrets } from '../../scripts/check-secrets.js';

describe('check-secrets', () => {
  describe('scanForSecrets', () => {
    it('detects OpenRouter API keys', () => {
      const content = 'const key = "sk-or-v1-abc123def456";';
      const results = scanForSecrets(content, 'test.js');
      expect(results).toHaveLength(1);
      expect(results[0].pattern).toBe('sk-or-');
    });

    it('detects Anthropic API keys', () => {
      const content = 'ANTHROPIC_KEY=sk-ant-abc123';
      const results = scanForSecrets(content, '.env');
      expect(results).toHaveLength(1);
      expect(results[0].pattern).toBe('sk-ant-');
    });

    it('detects AWS access keys', () => {
      const content = 'aws_key = "AKIAIOSFODNN7EXAMPLE"';
      const results = scanForSecrets(content, 'config.js');
      expect(results).toHaveLength(1);
      expect(results[0].pattern).toBe('AKIA');
    });

    it('detects GitHub personal access tokens', () => {
      const content = 'token: "ghp_abc123def456ghi789"';
      const results = scanForSecrets(content, 'config.js');
      expect(results).toHaveLength(1);
      expect(results[0].pattern).toBe('ghp_');
    });

    it('detects private key blocks', () => {
      const content = '-----BEGIN RSA PRIVATE KEY-----\nMIIE...';
      const results = scanForSecrets(content, 'key.pem');
      expect(results).toHaveLength(1);
      expect(results[0].pattern).toMatch(/BEGIN.*KEY/);
    });

    it('returns empty array for clean content', () => {
      const content = 'const x = 42;\nfunction hello() { return "world"; }';
      const results = scanForSecrets(content, 'clean.js');
      expect(results).toHaveLength(0);
    });

    it('detects multiple secrets in one file', () => {
      const content = 'const a = "sk-or-v1-abc";\nconst b = "ghp_xyz123abcdef456ghi789jkl012mno345pqr678";';
      const results = scanForSecrets(content, 'bad.js');
      expect(results).toHaveLength(2);
    });

    it('skips allowlisted patterns in test files', () => {
      const content = 'const mockKey = "sk-or-v1-mock-test-key";';
      const results = scanForSecrets(content, 'tests/mock.test.js', {
        allowlistPaths: ['tests/**']
      });
      expect(results).toHaveLength(0);
    });

    it('detects .env file patterns', () => {
      const content = 'OPENROUTER_API_KEY=sk-or-v1-realkey123';
      const results = scanForSecrets(content, '.env');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/john_renaldi/claude-code-projects/sidecar && npm test tests/scripts/check-secrets.test.js
```
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

Create `scripts/check-secrets.js`:

```js
#!/usr/bin/env node

/**
 * Secret detection script for pre-commit hook.
 * Scans staged files for API keys, tokens, and private key material.
 *
 * Usage:
 *   node scripts/check-secrets.js          # Scans git staged files
 *   import { scanForSecrets } from './scripts/check-secrets.js'  # Library use
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONFIG = {
  patterns: [
    { regex: /sk-or-[\w-]{10,}/g, name: 'sk-or-', description: 'OpenRouter API key' },
    { regex: /sk-ant-[\w-]{10,}/g, name: 'sk-ant-', description: 'Anthropic API key' },
    { regex: /AKIA[0-9A-Z]{16}/g, name: 'AKIA', description: 'AWS access key' },
    { regex: /ghp_[A-Za-z0-9_]{36,}/g, name: 'ghp_', description: 'GitHub personal access token' },
    { regex: /-----BEGIN\s[\w\s]*?PRIVATE\sKEY-----/g, name: 'BEGIN.*KEY', description: 'Private key block' },
  ],
  allowlistPaths: [
    'tests/**',
    '**/*.test.js',
    '**/*.spec.js',
  ],
};

/**
 * Check if a file path matches any allowlist glob pattern.
 */
function matchesAllowlist(filePath, allowlistPaths) {
  for (const pattern of allowlistPaths) {
    const regexStr = pattern
      .replace(/\*\*/g, '<<GLOBSTAR>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<GLOBSTAR>>/g, '.*');
    if (new RegExp(`^${regexStr}$`).test(filePath)) {
      return true;
    }
  }
  return false;
}

/**
 * Scan content for secret patterns.
 * @param {string} content - File content to scan
 * @param {string} filePath - Path of the file (for allowlist matching)
 * @param {object} [options] - Override options
 * @param {string[]} [options.allowlistPaths] - Glob patterns to skip
 * @returns {Array<{pattern: string, description: string, line: number}>}
 */
export function scanForSecrets(content, filePath, options = {}) {
  const allowlist = options.allowlistPaths || CONFIG.allowlistPaths;

  if (matchesAllowlist(filePath, allowlist)) {
    return [];
  }

  const results = [];
  const lines = content.split('\n');

  for (const { regex, name, description } of CONFIG.patterns) {
    const re = new RegExp(regex.source, regex.flags);
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        results.push({ pattern: name, description, line: i + 1 });
      }
      re.lastIndex = 0;
    }
  }

  return results;
}

/**
 * Main: scan git staged files.
 * Exit 1 if secrets found (blocks commit).
 */
async function main() {
  let stagedFiles;
  try {
    const output = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM'], { encoding: 'utf-8' });
    stagedFiles = output.trim().split('\n').filter(Boolean);
  } catch {
    console.error('Failed to get staged files. Are you in a git repo?');
    process.exit(1);
  }

  if (stagedFiles.length === 0) {
    process.exit(0);
  }

  let foundSecrets = false;

  for (const file of stagedFiles) {
    try {
      const fullPath = resolve(file);
      const content = readFileSync(fullPath, 'utf-8');
      const secrets = scanForSecrets(content, file);

      if (secrets.length > 0) {
        foundSecrets = true;
        console.error(`\n  BLOCKED: Potential secret(s) in ${file}:`);
        for (const s of secrets) {
          console.error(`    Line ${s.line}: ${s.description} (matched: ${s.pattern})`);
        }
      }
    } catch {
      // File might be binary or unreadable, skip
    }
  }

  if (foundSecrets) {
    console.error('\n  Remove secrets before committing. Use .env for local secrets.\n');
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].includes('check-secrets')) {
  main();
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
cd /Users/john_renaldi/claude-code-projects/sidecar && npm test tests/scripts/check-secrets.test.js
```
Expected: PASS (9 tests)

**Step 5: Commit**

```bash
git add scripts/check-secrets.js tests/scripts/check-secrets.test.js
git commit -m "feat: add secret detection script with tests"
```

---

### Task 3: Write check-file-sizes.js (tests first)

**Files:**
- Create: `tests/scripts/check-file-sizes.test.js`
- Create: `scripts/check-file-sizes.js`

**Step 1: Write the failing test**

Create `tests/scripts/check-file-sizes.test.js`:

```js
import { describe, it, expect } from '@jest/globals';
import { checkFileSize, checkFiles } from '../../scripts/check-file-sizes.js';

describe('check-file-sizes', () => {
  describe('checkFileSize', () => {
    it('passes for files under the limit', () => {
      const content = 'line\n'.repeat(100);
      const result = checkFileSize(content, 'src/small.js', 300);
      expect(result).toBeNull();
    });

    it('fails for files over the limit', () => {
      const content = 'line\n'.repeat(350);
      const result = checkFileSize(content, 'src/big.js', 300);
      expect(result).not.toBeNull();
      expect(result.file).toBe('src/big.js');
      expect(result.lines).toBe(350);
      expect(result.limit).toBe(300);
    });

    it('passes for files exactly at the limit', () => {
      const content = 'line\n'.repeat(300);
      const result = checkFileSize(content, 'src/exact.js', 300);
      expect(result).toBeNull();
    });
  });

  describe('checkFiles', () => {
    it('returns empty array when all files pass', () => {
      const files = [
        { path: 'src/a.js', content: 'line\n'.repeat(50) },
        { path: 'src/b.js', content: 'line\n'.repeat(100) },
      ];
      const results = checkFiles(files, 300);
      expect(results).toHaveLength(0);
    });

    it('returns violations for files over limit', () => {
      const files = [
        { path: 'src/ok.js', content: 'line\n'.repeat(50) },
        { path: 'src/big.js', content: 'line\n'.repeat(400) },
      ];
      const results = checkFiles(files, 300);
      expect(results).toHaveLength(1);
      expect(results[0].file).toBe('src/big.js');
    });

    it('catches multiple violations', () => {
      const files = [
        { path: 'src/a.js', content: 'line\n'.repeat(301) },
        { path: 'src/b.js', content: 'line\n'.repeat(500) },
      ];
      const results = checkFiles(files, 300);
      expect(results).toHaveLength(2);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/john_renaldi/claude-code-projects/sidecar && npm test tests/scripts/check-file-sizes.test.js
```
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

Create `scripts/check-file-sizes.js`:

```js
#!/usr/bin/env node

/**
 * File size enforcement script for pre-commit hook.
 * Blocks commits containing .js files in src/ that exceed the line limit.
 *
 * Usage:
 *   node scripts/check-file-sizes.js          # Scans git staged files
 *   import { checkFileSize } from './scripts/check-file-sizes.js'  # Library use
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONFIG = {
  maxLines: 300,
  include: ['src/**/*.js'],
  exclude: [],
};

/**
 * Check if a single file exceeds the line limit.
 * @param {string} content - File content
 * @param {string} filePath - File path
 * @param {number} limit - Max lines allowed
 * @returns {null | {file: string, lines: number, limit: number}}
 */
export function checkFileSize(content, filePath, limit) {
  const lineCount = content.split('\n').length;
  const adjustedCount = content.endsWith('\n') ? lineCount - 1 : lineCount;

  if (adjustedCount > limit) {
    return { file: filePath, lines: adjustedCount, limit };
  }
  return null;
}

/**
 * Check multiple files against the line limit.
 * @param {Array<{path: string, content: string}>} files
 * @param {number} limit
 * @returns {Array<{file: string, lines: number, limit: number}>}
 */
export function checkFiles(files, limit) {
  const violations = [];
  for (const { path, content } of files) {
    const result = checkFileSize(content, path, limit);
    if (result) {
      violations.push(result);
    }
  }
  return violations;
}

/**
 * Simple glob match for include/exclude patterns.
 */
function matchesPattern(filePath, patterns) {
  for (const pattern of patterns) {
    const regexStr = pattern
      .replace(/\*\*/g, '<<GLOBSTAR>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<GLOBSTAR>>/g, '.*');
    if (new RegExp(`^${regexStr}$`).test(filePath)) {
      return true;
    }
  }
  return false;
}

/**
 * Main: scan git staged files.
 * Exit 1 if any file exceeds the limit.
 */
async function main() {
  let stagedFiles;
  try {
    const output = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM'], { encoding: 'utf-8' });
    stagedFiles = output.trim().split('\n').filter(Boolean);
  } catch {
    console.error('Failed to get staged files.');
    process.exit(1);
  }

  const targetFiles = stagedFiles.filter(f =>
    matchesPattern(f, CONFIG.include) && !matchesPattern(f, CONFIG.exclude)
  );

  if (targetFiles.length === 0) {
    process.exit(0);
  }

  const files = targetFiles.map(f => ({
    path: f,
    content: readFileSync(resolve(f), 'utf-8'),
  }));

  const violations = checkFiles(files, CONFIG.maxLines);

  if (violations.length > 0) {
    console.error('\n  BLOCKED: File size limit exceeded (max %d lines):', CONFIG.maxLines);
    for (const v of violations) {
      console.error(`    ${v.file}: ${v.lines} lines (limit: ${v.limit})`);
    }
    console.error('\n  Refactor large files before committing.\n');
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].includes('check-file-sizes')) {
  main();
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
cd /Users/john_renaldi/claude-code-projects/sidecar && npm test tests/scripts/check-file-sizes.test.js
```
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add scripts/check-file-sizes.js tests/scripts/check-file-sizes.test.js
git commit -m "feat: add file size enforcement script with tests"
```

---

### Task 4: Write validate-docs.js (tests first)

**Files:**
- Create: `tests/scripts/validate-docs.test.js`
- Create: `scripts/validate-docs.js`

**Step 1: Write the failing test**

Create `tests/scripts/validate-docs.test.js`:

```js
import { describe, it, expect } from '@jest/globals';
import {
  extractSection,
  findFilesInSection,
  checkDrift,
  checkStagedFilesDrift,
} from '../../scripts/validate-docs.js';

describe('validate-docs', () => {
  describe('extractSection', () => {
    it('extracts a section by heading', () => {
      const md = '# Top\n\n## Directory Structure\n\n```\nsrc/\n  foo.js\n```\n\n## Other\n\nstuff';
      const section = extractSection(md, 'Directory Structure');
      expect(section).toContain('foo.js');
      expect(section).not.toContain('stuff');
    });

    it('returns empty string for missing section', () => {
      const md = '# Top\n\n## Other\n\nstuff';
      const section = extractSection(md, 'Nonexistent');
      expect(section).toBe('');
    });
  });

  describe('findFilesInSection', () => {
    it('extracts .js filenames from a code block', () => {
      const section = '```\nsrc/\n├── cli.js\n├── context.js\n```';
      const files = findFilesInSection(section);
      expect(files).toContain('cli.js');
      expect(files).toContain('context.js');
    });

    it('extracts filenames from markdown table rows', () => {
      const section = '| `context.js` | Context filtering | `filterContext()` |';
      const files = findFilesInSection(section);
      expect(files).toContain('context.js');
    });

    it('returns empty array for no matches', () => {
      const section = 'No files mentioned here.';
      const files = findFilesInSection(section);
      expect(files).toHaveLength(0);
    });
  });

  describe('checkDrift', () => {
    it('reports files on disk missing from docs', () => {
      const docFiles = ['cli.js', 'context.js'];
      const diskFiles = ['cli.js', 'context.js', 'new-module.js'];
      const drift = checkDrift(docFiles, diskFiles);
      expect(drift.missingFromDocs).toContain('new-module.js');
    });

    it('reports files in docs missing from disk', () => {
      const docFiles = ['cli.js', 'removed.js'];
      const diskFiles = ['cli.js'];
      const drift = checkDrift(docFiles, diskFiles);
      expect(drift.missingFromDisk).toContain('removed.js');
    });

    it('reports no drift when synced', () => {
      const docFiles = ['cli.js', 'context.js'];
      const diskFiles = ['cli.js', 'context.js'];
      const drift = checkDrift(docFiles, diskFiles);
      expect(drift.missingFromDocs).toHaveLength(0);
      expect(drift.missingFromDisk).toHaveLength(0);
    });
  });

  describe('checkStagedFilesDrift', () => {
    it('warns when src/ files changed but CLAUDE.md not staged', () => {
      const stagedFiles = ['src/new-module.js'];
      const result = checkStagedFilesDrift(stagedFiles);
      expect(result.warn).toBe(true);
      expect(result.changedFiles).toContain('src/new-module.js');
    });

    it('does not warn when CLAUDE.md is also staged', () => {
      const stagedFiles = ['src/new-module.js', 'CLAUDE.md'];
      const result = checkStagedFilesDrift(stagedFiles);
      expect(result.warn).toBe(false);
    });

    it('does not warn for non-tracked directories', () => {
      const stagedFiles = ['tests/new-test.js', 'docs/readme.md'];
      const result = checkStagedFilesDrift(stagedFiles);
      expect(result.warn).toBe(false);
    });

    it('tracks bin/ and scripts/ changes', () => {
      const stagedFiles = ['bin/new-cli.js'];
      const result = checkStagedFilesDrift(stagedFiles);
      expect(result.warn).toBe(true);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/john_renaldi/claude-code-projects/sidecar && npm test tests/scripts/validate-docs.test.js
```
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

Create `scripts/validate-docs.js`:

```js
#!/usr/bin/env node

/**
 * CLAUDE.md drift detection script.
 *
 * Two modes:
 * 1. Pre-commit (default): Warn if src/bin/scripts files changed but CLAUDE.md didn't
 * 2. Standalone (--full): Deep comparison of CLAUDE.md against actual codebase
 *
 * Usage:
 *   node scripts/validate-docs.js          # Pre-commit mode (staged files)
 *   node scripts/validate-docs.js --full   # Full drift analysis
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const CONFIG = {
  docFile: 'CLAUDE.md',
  trackedDirs: ['src/', 'bin/', 'scripts/'],
  mappings: [
    { section: 'Directory Structure', dirs: ['src/', 'bin/', 'scripts/'] },
    { section: 'Key Modules', dir: 'src/', pattern: /\.js$/ },
  ],
};

/**
 * Extract a markdown section by its heading (## level).
 * @param {string} markdown - Full markdown content
 * @param {string} heading - Section heading text
 * @returns {string}
 */
export function extractSection(markdown, heading) {
  const lines = markdown.split('\n');
  let inSection = false;
  let sectionLevel = 0;
  const result = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      if (text === heading) {
        inSection = true;
        sectionLevel = level;
        continue;
      } else if (inSection && level <= sectionLevel) {
        break;
      }
    }
    if (inSection) {
      result.push(line);
    }
  }

  return result.join('\n').trim();
}

/**
 * Find .js filenames mentioned in a markdown section.
 * @param {string} section - Markdown section content
 * @returns {string[]}
 */
export function findFilesInSection(section) {
  const files = new Set();
  const regex = /[\w/.-]*?([\w.-]+\.js)\b/g;
  let match;
  while ((match = regex.exec(section)) !== null) {
    files.add(match[1]);
  }
  return [...files];
}

/**
 * Compare documented files against actual files on disk.
 * @param {string[]} docFiles - Filenames from docs
 * @param {string[]} diskFiles - Filenames from filesystem
 * @returns {{missingFromDocs: string[], missingFromDisk: string[]}}
 */
export function checkDrift(docFiles, diskFiles) {
  const docSet = new Set(docFiles);
  const diskSet = new Set(diskFiles);

  const missingFromDocs = diskFiles.filter(f => !docSet.has(f));
  const missingFromDisk = docFiles.filter(f => !diskSet.has(f));

  return { missingFromDocs, missingFromDisk };
}

/**
 * Check if staged files include tracked directories but not CLAUDE.md.
 * @param {string[]} stagedFiles - List of staged file paths
 * @returns {{warn: boolean, changedFiles: string[]}}
 */
export function checkStagedFilesDrift(stagedFiles) {
  const claudeMdStaged = stagedFiles.some(f => basename(f) === 'CLAUDE.md');
  const trackedChanges = stagedFiles.filter(f =>
    CONFIG.trackedDirs.some(dir => f.startsWith(dir))
  );

  if (trackedChanges.length > 0 && !claudeMdStaged) {
    return { warn: true, changedFiles: trackedChanges };
  }
  return { warn: false, changedFiles: [] };
}

/**
 * Full drift analysis: compare CLAUDE.md sections against actual filesystem.
 */
function runFullAnalysis() {
  const docPath = resolve(CONFIG.docFile);
  let markdown;
  try {
    markdown = readFileSync(docPath, 'utf-8');
  } catch {
    console.error(`Cannot read ${CONFIG.docFile}`);
    process.exit(1);
  }

  let hasIssues = false;

  for (const mapping of CONFIG.mappings) {
    const section = extractSection(markdown, mapping.section);
    if (!section) {
      console.warn(`  Warning: Section "${mapping.section}" not found in ${CONFIG.docFile}`);
      continue;
    }

    const docFiles = findFilesInSection(section);

    const dirs = mapping.dirs || [mapping.dir];
    const diskFiles = [];
    for (const dir of dirs) {
      try {
        const entries = readdirSync(resolve(dir), { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && (!mapping.pattern || mapping.pattern.test(entry.name))) {
            diskFiles.push(entry.name);
          }
        }
      } catch {
        // Directory might not exist
      }
    }

    const drift = checkDrift(docFiles, diskFiles);

    if (drift.missingFromDocs.length > 0) {
      hasIssues = true;
      console.warn(`\n  "${mapping.section}" is missing files that exist on disk:`);
      for (const f of drift.missingFromDocs) {
        console.warn(`    + ${f} (exists but not documented)`);
      }
    }

    if (drift.missingFromDisk.length > 0) {
      hasIssues = true;
      console.warn(`\n  "${mapping.section}" references files that don't exist:`);
      for (const f of drift.missingFromDisk) {
        console.warn(`    - ${f} (documented but missing)`);
      }
    }
  }

  if (hasIssues) {
    console.warn('\n  Update CLAUDE.md to fix drift, or run without --full for pre-commit mode.\n');
    process.exit(1);
  } else {
    console.log('  CLAUDE.md is in sync with the codebase.');
  }
}

/**
 * Pre-commit mode: check staged files for drift warning.
 */
function runPreCommitCheck() {
  let stagedFiles;
  try {
    const output = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { encoding: 'utf-8' });
    stagedFiles = output.trim().split('\n').filter(Boolean);
  } catch {
    process.exit(0);
  }

  if (stagedFiles.length === 0) {
    process.exit(0);
  }

  const result = checkStagedFilesDrift(stagedFiles);

  if (result.warn) {
    console.warn('\n  Warning: CLAUDE.md may need updating. Changed files in tracked dirs:');
    for (const f of result.changedFiles) {
      console.warn(`    ${f}`);
    }
    console.warn('  Run `node scripts/validate-docs.js --full` to check for drift.\n');
  }
}

/**
 * Main entry point.
 */
function main() {
  const fullMode = process.argv.includes('--full');
  if (fullMode) {
    runFullAnalysis();
  } else {
    runPreCommitCheck();
  }
}

if (process.argv[1] && process.argv[1].includes('validate-docs')) {
  main();
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
cd /Users/john_renaldi/claude-code-projects/sidecar && npm test tests/scripts/validate-docs.test.js
```
Expected: PASS (10 tests)

**Step 5: Commit**

```bash
git add scripts/validate-docs.js tests/scripts/validate-docs.test.js
git commit -m "feat: add CLAUDE.md drift detection script with tests"
```

---

### Task 5: Wire pre-commit hook

**Files:**
- Modify: `.husky/pre-commit`

**Step 1: Write the pre-commit hook**

Replace `.husky/pre-commit` contents with:

```bash
#!/usr/bin/env bash

# Pre-commit hook: fast checks (<2s)
# 1. lint-staged (ESLint on staged .js files)
# 2. Secret detection
# 3. File size enforcement
# 4. CLAUDE.md drift warning

npx lint-staged

node scripts/check-secrets.js
node scripts/check-file-sizes.js
node scripts/validate-docs.js
```

**Step 2: Verify hook is executable**

Run:
```bash
chmod +x /Users/john_renaldi/claude-code-projects/sidecar/.husky/pre-commit && ls -la /Users/john_renaldi/claude-code-projects/sidecar/.husky/pre-commit
```
Expected: `-rwxr-xr-x` permissions

**Step 3: Commit**

```bash
git add .husky/pre-commit
git commit -m "feat: wire pre-commit hook with lint, secrets, size, and drift checks"
```

---

### Task 6: Wire pre-push hook

**Files:**
- Create: `.husky/pre-push`

**Step 1: Write the pre-push hook**

Create `.husky/pre-push`:

```bash
#!/usr/bin/env bash

# Pre-push hook: thorough checks (~30s)
# 1. Full test suite (hard block)
# 2. npm audit (warn only)

echo "Running test suite before push..."
npm test

echo "Checking for dependency vulnerabilities..."
npm audit --audit-level=moderate || echo "  (npm audit warnings above - review when convenient)"
```

**Step 2: Make executable**

Run:
```bash
chmod +x /Users/john_renaldi/claude-code-projects/sidecar/.husky/pre-push
```

**Step 3: Commit**

```bash
git add .husky/pre-push
git commit -m "feat: add pre-push hook with test suite and npm audit"
```

---

### Task 7: Add validate-docs npm script

**Files:**
- Modify: `package.json`

**Step 1: Add the script**

Add to `package.json` scripts:
```json
"validate-docs": "node scripts/validate-docs.js --full"
```

**Step 2: Test it runs**

Run:
```bash
cd /Users/john_renaldi/claude-code-projects/sidecar && npm run validate-docs
```
Expected: Either "CLAUDE.md is in sync" or a list of drift items.

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add validate-docs npm script"
```

---

### Task 8: Update CLAUDE.md rules

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add Documentation Sync hard rule**

After the "File Size Limits" table in "Code Quality Rules", add:

```markdown
### Documentation Sync (HARD RULE)

Any commit that adds, removes, or renames a file in `src/`, `bin/`, or `scripts/` MUST include a CLAUDE.md update in the same commit. This is not optional. The pre-commit hook will warn if CLAUDE.md is not staged alongside tracked file changes.
```

**Step 2: Add Staleness Detection duty**

After item 5 ("Demand Elegance") in "Claude Code Operating Principles", add:

```markdown
### 6. Staleness Detection

- At the start of any work session, run `node scripts/validate-docs.js --full`
- Fix any inconsistencies before proceeding with the task
- If CLAUDE.md references files, functions, or counts that don't match reality, fix them immediately
- This is the agent's half of the two-way documentation maintenance loop
```

Renumber "Autonomous Bug Fixing" to 7.

**Step 3: Replace hardcoded test counts**

Change:
- `# Jest test suite (927 tests, 36 suites)` to `# Jest test suite (run npm test for current count)`
- `currently 927 tests, 36 suites` to `run npm test to verify`

**Step 4: Add doc update to TDD Finalization Phase**

In the global CLAUDE.md TDD Finalization Phase, add step 5:

```markdown
5. **Documentation Check**:
   - If `src/`, `bin/`, or `scripts/` files were added/removed/renamed, update CLAUDE.md
   - Run `node scripts/validate-docs.js --full` to verify no drift
```

**Step 5: Add Enforcement section to Essential Commands**

```markdown
### Enforcement
\`\`\`bash
node scripts/check-secrets.js        # Scan staged files for secrets
node scripts/check-file-sizes.js     # Check staged files against 300-line limit
node scripts/validate-docs.js        # Pre-commit: warn if CLAUDE.md may need update
node scripts/validate-docs.js --full # Full: compare CLAUDE.md against codebase
npm run validate-docs                # Alias for --full mode
\`\`\`
```

**Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add documentation sync rules and staleness detection duty"
```

---

### Task 9: Create scaffolding templates

**Files:**
- Create: `docs/scaffolding/README.md`
- Create: `docs/scaffolding/setup.sh`
- Create: `docs/scaffolding/scripts/check-secrets.js` (generic copy)
- Create: `docs/scaffolding/scripts/check-file-sizes.js` (generic copy)
- Create: `docs/scaffolding/scripts/validate-docs.js` (generic copy)
- Create: `docs/scaffolding/hooks/pre-commit`
- Create: `docs/scaffolding/hooks/pre-push`
- Create: `docs/scaffolding/configs/lint-staged.config.js`
- Create: `docs/scaffolding/configs/eslint-base.js`

**Step 1: Create directory structure**

Run:
```bash
mkdir -p /Users/john_renaldi/claude-code-projects/sidecar/docs/scaffolding/{scripts,hooks,configs}
```

**Step 2: Create README.md**

Create `docs/scaffolding/README.md` explaining:
- What this kit does
- How to run `setup.sh` to bootstrap a new project
- How to customize CONFIG objects
- What each hook checks and its enforcement level (block vs warn)

**Step 3: Create setup.sh**

Create `docs/scaffolding/setup.sh` that:
1. Copies scripts to `./scripts/` (prompts before overwriting)
2. Runs `npm install --save-dev husky lint-staged`
3. Runs `npx husky init`
4. Copies hook files to `.husky/`
5. Adds lint-staged config to package.json if not present
6. Prints summary of what was installed

Make executable: `chmod +x docs/scaffolding/setup.sh`

**Step 4: Copy template scripts**

Copy the three scripts from `scripts/` to `docs/scaffolding/scripts/`, replacing sidecar-specific CONFIG values with generic defaults:
- `check-secrets.js`: Same patterns (universal), generic allowlist
- `check-file-sizes.js`: `maxLines: 300`, `include: ['src/**/*.js']`
- `validate-docs.js`: Generic mappings pointing to `src/`

**Step 5: Copy hook templates**

Copy `.husky/pre-commit` and `.husky/pre-push` to `docs/scaffolding/hooks/`.

**Step 6: Create lint-staged config template**

Create `docs/scaffolding/configs/lint-staged.config.js`:
```js
export default {
  'src/**/*.js': ['eslint --fix'],
};
```

**Step 7: Create ESLint base config template**

Create `docs/scaffolding/configs/eslint-base.js`:
```js
module.exports = {
  env: { node: true, es2022: true },
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  extends: ['eslint:recommended'],
  rules: {
    'no-var': 'error',
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],
    'semi': ['error', 'always'],
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'prefer-const': 'error',
  },
};
```

**Step 8: Commit**

```bash
git add docs/scaffolding/
git commit -m "feat: add portable enforcement scaffolding kit"
```

---

### Task 10: Integration test - verify hooks work end-to-end

**Step 1: Test pre-commit with a clean file change**

Run:
```bash
cd /Users/john_renaldi/claude-code-projects/sidecar
echo "// integration test comment" >> src/index.js
git add src/index.js
git commit -m "test: verify pre-commit hook" --dry-run
```
Expected: lint-staged runs, checks pass, drift warning appears (src/ changed, CLAUDE.md not staged).

**Step 2: Test secret detection blocks a commit**

Run:
```bash
echo 'const key = "sk-or-v1-test-secret-key-12345";' > /tmp/secret-test.js
cp /tmp/secret-test.js src/secret-test.js
git add src/secret-test.js
git commit -m "test: should be blocked"
```
Expected: BLOCKED by check-secrets.js.

**Step 3: Clean up**

Run:
```bash
git reset HEAD src/index.js src/secret-test.js 2>/dev/null; git checkout -- src/index.js 2>/dev/null; rm -f src/secret-test.js
```

**Step 4: Run full test suite**

Run:
```bash
cd /Users/john_renaldi/claude-code-projects/sidecar && npm test
```
Expected: All tests pass (existing + new script tests).

**Step 5: Run full doc validation**

Run:
```bash
cd /Users/john_renaldi/claude-code-projects/sidecar && npm run validate-docs
```
Expected: Reports drift or confirms sync. Fix any drift found.

---

### Task 11: Final CLAUDE.md sync

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update Directory Structure**

Add `.husky/` and new scripts to the directory tree. Add `docs/scaffolding/` subtree.

**Step 2: Update Dependencies table**

Add:
```markdown
| `husky` | ^9.0.0 | Git hook management |
| `lint-staged` | ^15.0.0 | Run linters on staged files |
```

**Step 3: Update test file table**

Add entries for:
- `tests/scripts/check-secrets.test.js`
- `tests/scripts/check-file-sizes.test.js`
- `tests/scripts/validate-docs.test.js`

**Step 4: Run validate-docs to confirm sync**

Run:
```bash
cd /Users/john_renaldi/claude-code-projects/sidecar && npm run validate-docs
```
Expected: "CLAUDE.md is in sync with the codebase."

**Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: final CLAUDE.md sync with enforcement system"
```
