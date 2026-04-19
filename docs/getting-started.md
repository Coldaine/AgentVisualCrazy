# Getting Started

Welcome to **shadow-agent**. This guide will help you get the project running locally for development and testing.

## Setup

The main project lives in the `shadow-agent` directory.

```bash
cd shadow-agent
npm install
```

## Test

We use [Vitest](https://vitest.dev/) for unit and integration testing.

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npx vitest tests/derive.test.ts
```

## Run

To start the Electron application in development mode with HMR (Hot Module Replacement):

```bash
npm start
```

## Project Structure

- `shadow-agent/src/electron/`: Main process code, including IPC handling, session management, and filesystem watching.
- `shadow-agent/src/renderer/`: React-based UI code, including the Canvas2D visualization engine and D3-Force layout.
- `shadow-agent/src/shared/`: Code shared between the main and renderer processes (types, utilities, logging).
- `docs/`: Technical documentation, architecture decisions, and project plans.

## Prompt Workflow

We maintain a strict synchronization workflow for AI prompts. Before modifying any prompts, please read the **Prompt Change Workflow** in [AGENTS.md](../AGENTS.md).

Run these commands when updating the system prompt:
```bash
npm run prompts:generate
npm run prompts:check
```

## Documentation

- [North Star](north-star.md): Project vision and goals.
- [Architecture](architecture.md): Technical decisions and stack overview.
- [Todo](todo.md): Current task list and roadmap.
