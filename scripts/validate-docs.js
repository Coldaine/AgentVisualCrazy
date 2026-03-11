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

const { execFileSync } = require('node:child_process');
const { resolve, basename } = require('node:path');

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
 * Returns all content between the matched heading and the next heading
 * at the same or higher level.
 * @param {string} markdown - Full markdown content
 * @param {string} heading - Section heading text
 * @returns {string} Section content (empty string if not found)
 */
function extractSection(markdown, heading) {
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
 * Searches code blocks and markdown table rows for file references.
 * @param {string} section - Markdown section content
 * @returns {string[]} Array of unique .js filenames
 */
function findFilesInSection(section) {
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
function checkDrift(docFiles, diskFiles) {
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
function checkStagedFilesDrift(stagedFiles) {
  const claudeMdStaged = stagedFiles.some(
    f => basename(f) === 'CLAUDE.md'
  );
  const trackedChanges = stagedFiles.filter(f =>
    CONFIG.trackedDirs.some(dir => f.startsWith(dir))
  );

  if (trackedChanges.length > 0 && !claudeMdStaged) {
    return { warn: true, changedFiles: trackedChanges };
  }
  return { warn: false, changedFiles: [] };
}

/**
 * Full drift analysis: delegates to generate-docs.js --check.
 * That script handles marker freshness, cross-link validation,
 * and plans index checks.
 */
function runFullAnalysis() {
  try {
    execFileSync(
      process.execPath,
      [resolve(__dirname, 'generate-docs.js'), '--check'],
      { stdio: 'inherit', cwd: resolve(__dirname, '..') }
    );
  } catch {
    process.exit(1);
  }
}

/**
 * Pre-commit mode: check staged files for drift warning.
 * Uses execFileSync (not execSync) to avoid shell injection.
 */
function runPreCommitCheck() {
  let stagedFiles;
  try {
    const output = execFileSync(
      'git',
      ['diff', '--cached', '--name-only', '--diff-filter=ACMR'],
      { encoding: 'utf-8' }
    );
    stagedFiles = output.trim().split('\n').filter(Boolean);
  } catch {
    process.exit(0);
  }

  if (stagedFiles.length === 0) {
    process.exit(0);
  }

  const result = checkStagedFilesDrift(stagedFiles);

  if (result.warn) {
    console.warn(
      '\n  Warning: CLAUDE.md may need updating. Changed files in tracked dirs:'
    );
    for (const f of result.changedFiles) {
      console.warn(`    ${f}`);
    }
    console.warn(
      '  Run `node scripts/validate-docs.js --full` to check for drift.\n'
    );
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

// Run when executed directly
if (require.main === module) {
  main();
}

module.exports = {
  extractSection,
  findFilesInSection,
  checkDrift,
  checkStagedFilesDrift,
};
