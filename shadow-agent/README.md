# Shadow Agent

`shadow-agent` is a passive observer for agent sessions.

It combines:
- Sidecar-style separation between the observed agent and a secondary shadow runtime
- Agent Flow-style event ingestion, replay, and visualization

The current slice is intentionally small:
- loads a built-in replay fixture on startup
- opens replay JSONL or Claude transcript JSONL from disk
- normalizes events into a canonical schema
- derives a lightweight session state with risks, next moves, and file attention
- renders an Electron dashboard with graph, timeline, transcript, and insight panels
- exports canonical replay JSONL back to disk

## Commands

```bash
npm install
npm test
npm run build
```

After building, launch the desktop shell with:

```bash
npx electron dist-electron/main.cjs
```

## Scope

This is a read-only prototype. It does not edit files, intervene in the main agent session, or spawn helper agents.

