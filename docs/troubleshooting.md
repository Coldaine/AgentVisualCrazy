# Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| `command not found: opencode` | OpenCode binary not found | Reinstall: `npm install -g claude-sidecar` (opencode-ai is bundled) |
| `spawn opencode ENOENT` | CLI not in PATH | Verify `path-setup.js` runs before server start; check `node_modules/.bin/opencode` exists |
| API 400 Bad Request | Model format wrong | Use `{providerID, modelID}` object, not string. See `formatModelForAPI()` |
| Jest ESM mock fails | Dynamic import | Skip test with `it.skip()` or use `--experimental-vm-modules` |
| Session resolution fails | No recent session | Pass explicit `--session` flag |
| Electron window blank | Assets not built | Run from project root |
| Headless stalls silently | `chat` agent in `--no-ui` mode | Use `--agent build` or remove `--no-ui` |
| Headless timeout | Task too complex | Increase `SIDECAR_TIMEOUT` |
| Context too large | Too many turns | Use `--turns` or `--tokens` filter |
| API key errors | Missing env var | Set `OPENROUTER_API_KEY` in .env |
| Summary not captured | Fold not clicked | Click FOLD button or wait for [SIDECAR_FOLD] |
| Question tool fails after answer | Using sync API | Ensure `sendToAPIStreaming()` is used, not `sendToAPI()` |
