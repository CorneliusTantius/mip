# agent/ — orientation for AI agents working on mip

Facts only, for fast and accurate work. Source is referenced as `path:line` (line numbers are as of commit 5128d37; `symbols.md` has every exported symbol's current line).

## Read order
1. `architecture.md` — processes, layers, where data lives, what is in memory.
2. `flows.md` — what happens step by step: runs, chat follow, room turns, memory, repos, sign-in, tools.
3. `backend.md` — each backend module: purpose, key functions, touchpoints.
4. `frontend.md` — each frontend module: purpose, state owner, API calls, events, layout.
5. `api.md` — every HTTP route: handler, status codes, body, errors.
6. `data-model.md` — SQLite tables, columns, and the module that owns each one.
7. `conventions.md` — how to add a route, tool, provider, card, or dialog; how to verify; git rules; gotchas.
8. `symbols.md`, `imports.md` — generated. Exact line of every export; which module imports which.

## Regenerate the generated files
    node agent/gen-index.mjs

Run it after changing anything under `src/`. The hand-written files cite functions by name, so grep the name if a line number moved.

## Two runtimes
- Server: `src/backend` → `dist/backend` (`tsc`). Entry: `src/backend/http/server.ts`.
- Dashboard: `src/frontend` → `dist/frontend` (Vite). Entry: `src/frontend/main.tsx` → `App.tsx`.
- The server serves `dist/frontend` and the API from one port (127.0.0.1:3000).

## Commands
    npm run typecheck          # backend + frontend, no emit
    npm run build              # backend + frontend
    npm run build:backend      # backend only
    npm run build:frontend     # frontend only (server serves new files without restart)
    npm run serve              # node dist/backend/http/server.js
    node src/backend/app/room-engine.test.mjs   # needs build:backend first
