# Copilot Instructions — shadow-agent

Shadow-agent is a **passive, read-only visual observer** for AI coding agents. It never writes
files or issues actions on behalf of the observed agent (hard constraint for v1).

---

## Critical Rules (read first)

1. **Visual quality over speed.** When choosing between a faster hack and a high-fidelity
   implementation, choose fidelity. Canvas2D + D3-Force is the rendering stack — do not
   introduce React Flow or SVG paths for core graph nodes.

2. **No runtime imports from `third_party/`.** Those directories are reference/research material.
   Port patterns; do not import from them.

3. **Privacy defaults are deny-by-default.** Never disable or weaken `sanitizeTranscriptText`,
   `assertOffHostInferenceAllowed`, or `prepareEventsForStorage`. Off-host inference and raw
   transcript storage both require explicit user opt-in.

4. **Prompt source of truth is `prompts/shadow-system-prompt.json`.** Never edit the generated
   files (`docs/prompts/shadow-system-prompt.md`, `shadow-agent/src/inference/prompts.ts`) by
   hand. Always run `npm run prompts:generate` then `npm run prompts:check` after prompt edits.

5. **Docs and AGENTS.md drift is a regression.** If you change a command, env var, or convention,
   update AGENTS.md and the relevant doc in the same PR.

---

## Commit Messages

Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `prompt:`, `chore:`.
Always include:
```
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

---

## Key Commands (shadow-agent/)

```bash
npm install           # install + auto-configure pre-commit hooks
npm test              # vitest run (unit + integration)
npm run test:coverage # vitest run --coverage
npm run build         # build:web + build:renderer + build:electron
npm run prompts:generate
npm run prompts:check
```

After `npm run build`:
```bash
npx electron dist-electron/main.cjs
```

---

## Architecture Constraints

| Layer         | Tech                              | Notes |
|---------------|-----------------------------------|-------|
| Renderer      | Canvas2D + D3-Force + React 19    | No React Flow; no SVG for nodes |
| Inference     | `@anthropic-ai/sdk` (Anthropic direct) | OpenCode client is deferred |
| Event capture | `fs.watch` JSONL tailing           | Transport-agnostic queue |
| Shell         | Electron 39                        | Renderer is host-agnostic |

- Strict TypeScript (`strict: true`). Run `tsc --noEmit` before opening a PR.
- ESM-only (`"type": "module"`).
- Tests live in `shadow-agent/tests/` and use Vitest. All tests must pass before merging.

---

## Privacy & Security

- `TranscriptPrivacySettings` defaults to `allowRawTranscriptStorage: false` and
  `allowOffHostInference: false`. Do not change these defaults.
- Credentials are loaded from env → `~/.shadow-agent/credentials.enc.json` (safeStorage) →
  legacy files only when `SHADOW_ALLOW_FILE_CREDENTIAL_FALLBACK=1`.
- POSIX credential store: dir `0700`, file `0600`.

---

## Where to Find Things

| Topic | File |
|-------|------|
| Full agent rules | `AGENTS.md` |
| Architecture decisions | `docs/architecture.md` |
| Rendering domain | `docs/domain-gui.md` |
| Inference domain | `docs/domain-inference.md` |
| Event capture domain | `docs/domain-events.md` |
| Testing plan | `docs/plans/plan-testing-observability.md` |
| Prompt source | `prompts/shadow-system-prompt.json` |
