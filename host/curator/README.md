# `@agentvisualcrazy/curator`

Mastra curator agent + ChatGPT Pro Codex OAuth for AgentVisualCrazy v1
(MUST **M3–M7**, **M10–M13**).

## Layout

| Path | Role |
|------|------|
| `src/agent.ts` | Mastra `Agent` with read-only lookback tools |
| `src/tools.ts` | ObservationStore query tools + prior artifacts |
| `src/gallery-memory.ts` | In-memory session gallery (refresh/retire) |
| `src/runner.ts` | Single-flight investigation trigger |
| `src/auth/codex-provider.ts` | Codex OAuth `wrapLanguageModel` only (no Platform API key) |
| `src/auth/codex-oauth.ts` | Device-code + browser callback scaffolding |
| `src/auth/token-store.ts` | `~/.agentvisualcrazy/` + Electron `safeStorage` |

## Auth modes

| Mode | How to enable |
|------|----------------|
| **Codex OAuth** (only live path) | Complete device-code or browser login; tokens in `~/.agentvisualcrazy/`. |
| **Mock** (offline/dev only) | `AVC_CURATOR_MODE=mock` or no OAuth tokens — deterministic offline gallery. **Not** an `OPENAI_API_KEY` substitute. |

**Forbidden:** `OPENAI_API_KEY` / Platform API billing as a product auth path.

Device-code (headless):

```ts
import { TokenStore, loginWithDeviceCode } from '@agentvisualcrazy/curator'

const store = new TokenStore()
await loginWithDeviceCode(store, {
  onStart: (s) => console.log(s.instructions),
})
```

Browser scaffolding returns an authorize URL + local callback waiter
(`startBrowserLogin`). Wire `shell.openExternal` from Electron (TODO in host).

## Electron

`electron/curator-host.ts` starts a timer / event-count trigger and publishes
`{ type: 'exhibit-artifacts', artifacts }` over `avc:host-message`.

## Tests

```bash
cd host/curator
npm install
npm test
```

From repo root: `npm run test:curator`.
