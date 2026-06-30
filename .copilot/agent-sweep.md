Branch: `copilot/autonomous-repository-improvement-sweep`

Baseline checks:
- `npm test` initially failed before dependency install, then hit TS5101 (`baseUrl` deprecation)
- `npm run build` initially failed before local dependencies were installed

Completed tasks:
- Sanitized MCP event export and enforced privacy opt-in for MCP inference questions
- Redacted OpenAI-compatible error previews and logged insecure legacy credential fallback usage
- Fixed transcript timestamp overflow, hardened RGBA parsing, and corrected repo-root setup docs

Blocked tasks:
- `engine-tools-report_progress` push failed in this environment
- Full Vitest suite still depends on a working Electron binary in the sandbox

Assumptions:
- MCP clients must obey the same off-host privacy gate as the main inference flow
- MCP event inspection should always return sanitized payloads

Remaining useful work:
- Add direct MCP server contract tests once optional SDK wiring is testable in the sandbox
- Investigate boundary validation hardening in event-buffer and replay parsing
- Re-run full validation after the Electron binary issue is cleared
