# agent/: orientation for AI agents working on mip

Facts only, for fast and accurate work. Hand-written files name files and functions, not line numbers. Line numbers change, so they live only in `symbols.md`, which is generated.

## Read order
1. `architecture.md`: processes, layers, folder rules, where data lives, what is in memory, and the tools.
2. `flows.md`: what happens step by step: runs, chat follow, room turns, memory, repos, sign-in, tools, GitHub sync, skills, tool calls, tool search.
3. `backend.md`: each backend module, grouped by folder, with its job and main exports.
4. `frontend.md`: each frontend module, grouped by feature, with its job, its state owner, and the polling.
5. `api.md`: every HTTP route, with its status codes, body, and errors.
6. `data-model.md`: SQLite tables, their columns, and the module that owns each one.
7. `conventions.md`: where new code goes, how to add a route, tool, provider, card, or dialog, how to verify, git rules, and gotchas.
8. `symbols.md` and `imports.md`: generated. The line of every export, and which module imports which.

## Regenerate the generated files
    node agent/gen-index.mjs

Run it after changing anything under `src/`.

## Two runtimes
- Server: `src/backend`, compiled to `dist/backend` by `tsc`. Entry: `src/backend/http/server.ts`.
- Dashboard: `src/frontend`, built to `dist/frontend` by Vite. Entry: `src/frontend/main.tsx`, which renders `App.tsx`.
- The server serves `dist/frontend` and the API from one port, `127.0.0.1:3000`.

## Commands
    npm run typecheck          # backend and frontend, no emit
    npm run build              # backend and frontend
    npm run build:backend      # backend only
    npm run build:frontend     # frontend only; the server serves new files without a restart
    npm run serve              # node dist/backend/http/server.js

The backend tests run after `npm run build:backend`. The full list is in `conventions.md`.
