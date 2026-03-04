# JSDoc + TypeScript Declarations

This project uses **JSDoc comments** to provide TypeScript type information without converting to TypeScript. This gives npm consumers autocomplete and type checking.

## JSDoc Pattern for Public APIs

```javascript
/**
 * Start a new sidecar session
 * @param {Object} options - Sidecar configuration
 * @param {string} options.model - LLM model identifier (e.g., 'google/gemini-2.5-flash')
 * @param {string} options.briefing - Task description for the sidecar
 * @param {string} [options.sessionId] - Optional Claude Code session ID
 * @param {boolean} [options.headless=false] - Run without GUI
 * @param {number} [options.timeout=15] - Headless timeout in minutes
 * @returns {Promise<SidecarResult>} Session result with summary
 */
async function startSidecar(options) {
  // ...
}

/**
 * @typedef {Object} SidecarResult
 * @property {string} taskId - Unique session identifier
 * @property {string} summary - Fold summary from sidecar
 * @property {string} status - Session status (completed|timeout|error)
 * @property {string[]} [conflicts] - Files with potential conflicts
 */
```

## Generating .d.ts Files

Add to `package.json`:

```json
{
  "scripts": {
    "build:types": "tsc --declaration --emitDeclarationOnly --allowJs --outDir types"
  },
  "types": "types/index.d.ts",
  "files": ["bin/", "src/", "electron/", "types/"]
}
```

Create `jsconfig.json`:

```json
{
  "compilerOptions": {
    "checkJs": true,
    "declaration": true,
    "emitDeclarationOnly": true,
    "allowJs": true,
    "outDir": "types",
    "lib": ["ES2022"],
    "module": "CommonJS",
    "target": "ES2022"
  },
  "include": ["src/**/*.js", "bin/**/*.js"],
  "exclude": ["node_modules", "tests"]
}
```

## Pre-publish Workflow

```bash
# Generate types before publishing
npm run build:types

# Verify types are generated
ls types/

# Publish with types
npm publish
```
