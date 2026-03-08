# Self-Documentation Enforcement System

**Date**: 2026-03-08
**Status**: Approved
**Motivation**: [Augment Code article on spec-driven development](https://x.com/augmentcode/status/2025993446633492725) -- documentation goes stale because humans won't maintain it. If agents can write code, they can update the plan. The enforcement system makes both sides (human + agent) maintain CLAUDE.md.

## Problem

CLAUDE.md has extensive "Maintaining This Documentation" guidelines, but:
- No automated enforcement (all manual checklists)
- No pre-commit hooks (husky not installed)
- No CI pipeline for PRs (only a publish workflow)
- No secret detection, file size enforcement, or doc drift checks
- Hardcoded counts (test count, suite count) go stale immediately

AI guidance quality depends on CLAUDE.md accuracy. Outdated docs cause agents to suggest non-existent functions, miss new features, and create redundant code.

## Design

### Audience

Solo developer wanting light guardrails. Not full CI/CD ceremony.

### Architecture

```
Pre-commit (<2s)              Pre-push (~30s)           Agent Instructions
---------------------         ------------------        ------------------
lint-staged (ESLint)          Full test suite (block)   Staleness detection duty
Secret detection (block)      npm audit (warn)          Hard rule: update docs
File size check (block)                                 Remove hardcoded counts
CLAUDE.md drift (warn)                                  Doc update in TDD phase
```

### Pre-commit Hook (fast, <2s)

Four checks run on every commit via husky + lint-staged:

#### 1. ESLint on staged files (lint-staged)
- Only lints files actually changed, not the whole repo
- Uses existing `.eslintrc.js` config
- Auto-fixes what it can (`--fix`), fails on errors

#### 2. Secret detection (`scripts/check-secrets.js`)
- Scans staged file contents for patterns:
  - `sk-or-`, `sk-ant-`, `AKIA`, `ghp_`
  - `-----BEGIN.*KEY-----`
  - High-entropy strings in `.env`-like assignments
- Allowlist for test fixtures and mock data
- **Hard block** (not a warning). Secrets are irreversible.

#### 3. File size check (`scripts/check-file-sizes.js`)
- Any staged `.js` file in `src/` over 300 lines: hard block
- Shows line count and filename
- Enforces the documented hard limit

#### 4. CLAUDE.md drift detection (`scripts/validate-docs.js`)
- If any file in `src/`, `bin/`, or `scripts/` was added/removed/renamed AND `CLAUDE.md` was not modified in the same commit: **warn** (not block)
- Prints: "CLAUDE.md may need updating. Files changed: [list]"
- Standalone mode does deeper checks:
  - Compares `src/*.js` files against "Directory Structure" section
  - Compares module names against "Key Modules" table
  - Flags files present in codebase but missing from docs (and vice versa)

### Pre-push Hook (thorough, ~30s)

#### 1. Full test suite
- Runs `npm test`
- **Hard block** on failure

#### 2. npm audit
- Runs `npm audit --audit-level=moderate`
- **Warn only** (not block). Transitive dep vulnerabilities shouldn't stop pushing a fix.

### CLAUDE.md Rule Changes

#### New hard rule
> Any commit that adds, removes, or renames a file in `src/`, `bin/`, or `scripts/` MUST include a CLAUDE.md update in the same commit. This is not optional.

#### New agent duty (in "Claude Code Operating Principles")
> **Staleness Detection**: At the start of any work session, run `node scripts/validate-docs.js` and fix any inconsistencies before proceeding. If CLAUDE.md references files, functions, or counts that don't match reality, fix them immediately.

#### Remove hardcoded counts
> Replace "927 tests, 36 suites" with a note to run `npm test` for current counts.

#### Add doc update to TDD Finalization Phase
> After tests pass, check if the change requires a CLAUDE.md update. If `src/` files were added/removed/renamed, update CLAUDE.md before committing.

### Portable Scaffolding (`docs/scaffolding/`)

A self-contained directory that can be copied into any future project and bootstrapped with one command.

```
docs/scaffolding/
├── README.md                    # How to use this kit
├── setup.sh                     # One-command bootstrap script
├── scripts/
│   ├── check-secrets.js         # Secret detection (configurable patterns)
│   ├── check-file-sizes.js      # File size enforcement (configurable limit)
│   └── validate-docs.js         # CLAUDE.md drift detection (configurable sections)
├── hooks/
│   ├── pre-commit               # Husky pre-commit hook template
│   └── pre-push                 # Husky pre-push hook template
└── configs/
    ├── lint-staged.config.js    # lint-staged template config
    └── eslint-base.js           # Minimal ESLint base rules
```

#### setup.sh behavior
1. Copies scripts to `./scripts/` (skips existing, asks to overwrite)
2. Installs husky + lint-staged as dev dependencies
3. Initializes husky, wires hooks
4. Adds lint-staged config to package.json (or standalone file)
5. Prints what it did

#### Script configurability
Each script has a top-level config object:

```js
// check-file-sizes.js
const CONFIG = {
  maxLines: 300,
  include: ['src/**/*.js'],
  exclude: ['src/vendor/**'],
};
```

```js
// validate-docs.js
const CONFIG = {
  docFile: 'CLAUDE.md',
  mappings: [
    { section: 'Directory Structure', dirs: ['src/', 'bin/', 'scripts/'] },
    { section: 'Key Modules', dir: 'src/', pattern: '*.js' },
  ],
};
```

### What Lives Where

| Artifact | In `sidecar/` (active) | In `docs/scaffolding/` (template) |
|----------|----------------------|----------------------------------|
| `scripts/check-secrets.js` | Yes, project-configured | Yes, generic template |
| `scripts/check-file-sizes.js` | Yes, project-configured | Yes, generic template |
| `scripts/validate-docs.js` | Yes, project-configured | Yes, generic template |
| `.husky/pre-commit` | Yes | Template in `hooks/` |
| `.husky/pre-push` | Yes | Template in `hooks/` |
| lint-staged config | Yes, in package.json | Template standalone file |
| CLAUDE.md rule changes | Yes | N/A (project-specific) |
| `setup.sh` | Not needed (already set up) | Yes, the bootstrap script |

## New Dependencies

- `husky` (dev) -- git hook management
- `lint-staged` (dev) -- run linters on staged files only

## Files Created/Modified

### New files
- `scripts/check-secrets.js`
- `scripts/check-file-sizes.js`
- `scripts/validate-docs.js`
- `.husky/pre-commit`
- `.husky/pre-push`
- `docs/scaffolding/` (entire directory)

### Modified files
- `package.json` (lint-staged config, husky prepare script, new dev deps)
- `CLAUDE.md` (4 rule additions/modifications)

## Rejected Alternatives

### Approach B: CLAUDE.md rules only (no tooling)
Zero new dependencies but relies entirely on discipline. The Augment Code article's whole point is that this fails.

### Approach C: Full CI pipeline + hooks
GitHub Actions workflow gating PRs on lint/test/doc validation. Overkill for solo developer. CI minutes cost, pipeline maintenance overhead.

### Other checks considered but skipped
- **SAST (CodeQL, Semgrep)**: Overkill without a team. ESLint covers most JS issues.
- **Commit message linting**: Ceremony for one person.
- **License compliance**: Solo developer controls deps.
- **Branch protection**: Only one committer.
