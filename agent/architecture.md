# Architecture

## Processes
- One Node process runs the server: `node dist/backend/http/server.js`. It serves the JSON API, the tool endpoint `/mcp`, and the built dashboard from `dist/frontend`.
- Listens on `127.0.0.1` only. `src/backend/app/config.ts:2-3`: `HOST`, `PORT` (env `MIP_PORT`, default 3000).
- Dev: `npm run dev:frontend` runs Vite on :5173 and proxies `/api` to :3000 (`src/frontend/vite.config.ts`).
- Child processes spawned on demand: `claude` CLI (runs, model list, sign-in, auth status), `git` (clone, pull, rev-parse), `bash -c` (the bash tool), Pi's SDK runs in-process.

## Layers
Dependency direction is one way: `http → app → adapters | storage`, and `storage → db.ts → paths.ts`.

| layer | path | role | imports allowed |
| --- | --- | --- | --- |
| http | `src/backend/http` | routing, JSON in/out, static files, MCP endpoint | `app`, its own files |
| app | `src/backend/app` | use cases, validation, orchestration, tools | `storage`, `adapters` (types and the provider registry only) |
| adapters | `src/backend/adapters` | one file per provider, plus `contract.ts` | Node, provider SDKs |
| storage | `src/backend/storage` | SQLite repositories, one file per domain | `db.ts`, `paths.ts` |
| frontend | `src/frontend` | dashboard | `/api/*` over HTTP only |

The imports graph is in `imports.md`. Nothing in `app` imports `http`. `app/providers.ts` is the only module that constructs providers.

## Where data lives
`MIP_HOME` (env, default `~/.mip`), set in `src/backend/storage/paths.ts:6`.

| path | contents | written by |
| --- | --- | --- |
| `data/mip.db` | all app data (SQLite, `node:sqlite`) | `storage/*` |
| `sessions/claude/` | Claude CLI config dir (`CLAUDE_CONFIG_DIR`): login, CLI transcripts | `adapters/claude-cli.ts` |
| `sessions/pi/` | Pi session files | `adapters/pi.ts` |
| `repos/<name>/` | master clones of repositories | `app/repos.ts` |
| `workspaces/<sessionId>/` | a chat's files, plus its repository copies in `<name>/` | tools, `app/repos.ts` |

Deleting a chat removes `workspaces/<id>` (`app/tools/workspace.ts:18`). Provider files are left alone.

## State held in memory (lost on restart)
| state | where | notes |
| --- | --- | --- |
| MCP run tokens → workspace | `app/tools/index.ts:29` (`runWorkspaces`) | one token per run, released when the run ends |
| Room `busy`, `speaking` | `app/room.ts:14-15` | one room conversation at a time |
| Claude auth status (5 s) and model catalog (10 min) | `adapters/claude-cli.ts` | caches |
| Sign-in attempts | adapters (`signInState` / `signIns`) | progress lines and pending prompt |
| Client polling state | `features/*` hooks | cleared on page reload |

On startup, `storage/db.ts:114-115` marks runs left `running` as `error`, and repo clones left `cloning` as `error`.

## Providers
- Contract: `adapters/contract.ts`. `AgentProvider` has `id`, `name`, `capabilities`, `models()`, `targets()`, optional `startSignIn`, `signInProgress`, `answerSignIn`, `signOut`, and `run(options): AsyncIterable<AgentEvent>`.
- `AgentEvent` (`contract.ts:4`): `text`, `tool_call`, `tool_result`, `error`, `done` (with the provider's session id).
- Registry: `app/providers.ts:9-12`. Two providers:
  - `claude-cli` → `ClaudeCliProvider` (`adapters/claude-cli.ts:130`). Spawns `claude -p --output-format stream-json`.
  - `pi` → `PiProvider` (`adapters/pi.ts:113`). In-process SDK. Provider `anthropic` is hidden (`pi.ts:27`).
- `capabilities` is informational. Pi reports `tools: false, mcp: false` but still receives the app tools (see Gotchas in `conventions.md`).

## Tools
- `ToolSpec` (`contract.ts:24`): `name`, `description`, `inputSchema`, `run(input, {workspace, signal})`.
- Seven tools, defined in `app/tools/*.ts`, wrapped by `guarded` (exceptions become error results), exported as `TOOLS` (`app/tools/index.ts:21`).
- Claude gets them through `/mcp` (JSON-RPC over HTTP, `http/mcp.ts:7`), with `--strict-mcp-config`, built-in tools off (`--tools ""`), and `--allowedTools mcp__mip__<name>`.
- Pi gets them as custom tools (`adapters/pi.ts` `toPiTool`), with its built-in tools off (`noTools: "builtin"`).
- Paths are confined to the workspace by `inWorkspace` (`app/tools/workspace.ts:23`). `bash` is not sandboxed.

## Frontend
- Preact 11, daisyUI 5, Tailwind 4, Vite 8. Dark Nord theme in `styles.css`.
- No global store. State lives in feature hooks and components. Cards tell each other about changes with window events (`api/events.ts`).
- Every HTTP call goes through `api/client.ts`. Every dashboard card is a `Card` in `ui/Card.tsx`, with one glow color.
- Page layout is `App.tsx`, one scrolling `main` grid. Each card's entrance timing is random per page load, set by `ui/Card.tsx`.
