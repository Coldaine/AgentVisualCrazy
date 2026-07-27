# AgentVisualCrazy

Passive visual observer for AI coding agents. Electron hosts a copied
[agent-flow](https://github.com/patoles/agent-flow) renderer substrate; a Mastra
curator layer sits in the main process (planned).

## Run

```bash
npm install
npm run dev          # Vite renderer + Electron (localhost:5173)
```

Production-style:

```bash
npm run build        # dist-web + dist-electron
npm start            # load file:// from dist-web
```

See [`docs/plans/copy-verify.md`](docs/plans/copy-verify.md) for entrypoint and
bridge notes, and [`docs/architecture.md`](docs/architecture.md) for the system map.
