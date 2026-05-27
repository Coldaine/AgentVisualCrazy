# Shadow Agent

`shadow-agent` is a passive observer for agent sessions.

This README is for the app inside the larger workspace. For workspace layout, shared tooling,
and the role of `third_party/`, see the repo-root [README.md](../README.md).

It combines:
- Sidecar-style separation between the observed agent and a secondary shadow runtime
- Agent Flow-style event ingestion, replay, and visualization

The current slice is intentionally small:
- loads a built-in replay fixture on startup
- opens replay JSONL or Claude transcript JSONL from disk
- normalizes events into a canonical schema
- derives a lightweight session state with risks, next moves, and file attention
- renders a platform-agnostic web dashboard with graph, timeline, transcript, and insight panels
- exports canonical replay JSONL back to disk

Electron is now just one optional host shell. The shared renderer mounts through a host contract,
ships a standalone library build, and can also be registered as a custom element for web embeds.

## Privacy Defaults

Shadow-agent runs in local-only mode by default.

- Transcript-like content is sanitized before it is rendered, exported, persisted, or prepared for prompt delivery.
- Off-host inference stays disabled until the user explicitly opts in.
- Raw transcript storage/export requires its own explicit opt-in.

The Electron app exposes these consent gates in its Privacy panel and persists them locally in
`~/.shadow-agent/privacy.json`. Environment variables still work and override the saved file:

```bash
SHADOW_ALLOW_OFF_HOST_INFERENCE=true
SHADOW_ALLOW_RAW_TRANSCRIPT_STORAGE=true
```

## Commands

```bash
npm install
npm test
npm run build:web
npm run build
```

`npm install` at the repo root installs the shared `.githooks/` (via the
root `prepare` script). The `npm install` inside `shadow-agent/` no longer
runs that hook installer — run it once at the repo root.

`npm run build:web` emits the reusable renderer bundle in `dist-web/`.

## Renderer Library Contract

The reusable renderer is the default product surface. It accepts a plain browser host contract and
does not read Electron preload globals:

```ts
import {
  renderShadowAgent,
  registerShadowAgentElement,
  type ShadowAgentHost
} from './dist-web/shadow-agent-renderer.js';

const host: ShadowAgentHost = {
  loadInitialSnapshot: async () => snapshot,
  loadLiveSnapshot: async () => liveSnapshotOrNull,
  subscribeLiveEvents: (callback) => {
    const unsubscribe = eventBus.subscribe(callback);
    return unsubscribe;
  }
};

renderShadowAgent(document.querySelector('#root')!, host);
registerShadowAgentElement();
```

Electron lives in `src/electron/` as an optional host shell. Its renderer entry creates an
Electron-backed `ShadowAgentHost` from the preload bridge, while web embeds can provide their own
host object or assign one to the custom element's `host` property.

After `npm run build`, launch the Electron shell with:

```bash
npx electron dist-electron/main.cjs
```

## Credentials

Inference credentials prefer secure sources:

- `process.env`
- `~/.shadow-agent/credentials.enc.json` (encrypted local store)
- legacy plaintext fallbacks only when `SHADOW_ALLOW_FILE_CREDENTIAL_FALLBACK=1`

See [`docs/domain-inference.md`](../docs/domain-inference.md) for the consent workflow
and secure permission guidance.

## Scope

This is a read-only prototype. It does not edit files, intervene in the main agent session, or spawn helper agents.

