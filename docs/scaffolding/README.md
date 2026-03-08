# Scaffolding Kit: Pre-commit & Pre-push Enforcement

A portable enforcement toolkit that adds automated checks for documentation drift,
secret leaks, and file size limits to any Node.js project.

## What This Kit Does

- **Pre-commit hook**: Runs lint-staged, scans for leaked secrets, enforces file size
  limits, and warns when documentation may be out of date.
- **Pre-push hook**: Runs the full test suite and checks for dependency vulnerabilities
  before code reaches the remote.

## Prerequisites

- Node.js >= 18
- npm
- git

## Quick Start

From your project root:

```bash
bash docs/scaffolding/setup.sh
```

This will:

1. Copy `check-secrets.js`, `check-file-sizes.js`, and `validate-docs.js` into `scripts/`.
2. Install `husky` and `lint-staged` as dev dependencies.
3. Initialize husky and install the pre-commit and pre-push hooks.
4. Add a default `lint-staged` config to `package.json` (if not already present).

## Customization

Each script has a `CONFIG` object at the top of the file that you can edit:

### check-secrets.js

- `CONFIG.patterns` - Add or remove secret patterns (regex + description).
- `CONFIG.allowlistPaths` - Glob patterns for files that should be skipped (e.g., test files).

### check-file-sizes.js

- `CONFIG.maxLines` - Maximum lines per file (default: 300).
- `CONFIG.include` - Glob patterns for files to check (default: `src/**/*.js`).
- `CONFIG.exclude` - Glob patterns for files to skip.

### validate-docs.js

- `CONFIG.docFile` - The documentation file to validate (default: `CLAUDE.md`).
- `CONFIG.trackedDirs` - Directories that trigger a docs-drift warning when modified.
- `CONFIG.mappings` - Section-to-directory mappings for full drift analysis.

## Hook Details

### Pre-commit (blocks commit on failure)

| Check | Enforcement | Script |
|-------|-------------|--------|
| Lint staged files | **Block** | `npx lint-staged` |
| Secret detection | **Block** (exit 1) | `scripts/check-secrets.js` |
| File size limit | **Block** (exit 1) | `scripts/check-file-sizes.js` |
| Documentation drift | **Warn** (exit 0) | `scripts/validate-docs.js` |

### Pre-push (blocks push on failure)

| Check | Enforcement | Script |
|-------|-------------|--------|
| Test suite | **Block** (exit 1) | `npm test` |
| Dependency audit | **Warn** (exit 0) | `npm audit` |

## Bypassing Hooks

When you need to skip hooks (emergency hotfix, WIP commit, etc.):

```bash
git commit --no-verify -m "hotfix: ..."
git push --no-verify
```

Use sparingly. Add tests immediately after any emergency bypass.

## Config Templates

The `configs/` directory contains starter configurations:

- `configs/lint-staged.config.js` - Default lint-staged config (ESLint auto-fix).
- `configs/eslint-base.js` - Baseline ESLint rules (ES2022, strict mode).

Copy these into your project root and adjust as needed.

## Standalone Usage

The scripts can also be run directly or imported as modules:

```bash
# Run secret scan on staged files
node scripts/check-secrets.js

# Run file size check on staged files
node scripts/check-file-sizes.js

# Run docs drift check (pre-commit mode)
node scripts/validate-docs.js

# Run full docs drift analysis
node scripts/validate-docs.js --full
```

```js
// Library usage
const { scanForSecrets } = require('./scripts/check-secrets');
const { checkFileSize } = require('./scripts/check-file-sizes');
const { checkDrift } = require('./scripts/validate-docs');
```
