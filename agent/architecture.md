# Architecture

## Processes
- One Node process runs the server: `node dist/backend/http/server.js`. It serves the JSON API, the tool endpoint `/mcp` (used by the Claude CLI), and the built dashboard from `dist/frontend`.
- It listens on `127.0.0.1` only. Port: `MIP_PORT`, default 3000 (`app/config.ts`).
- Dev: `npm run dev:frontend` runs Vite on port 5173 and proxies `/api` to 3000.
- Restart (Settings → Update): `app/system.ts` starts a detached shell. The shell waits for this process to exit, runs `npm install` and `npm run build`, then starts the server.
- Child processes, on demand:
  - `claude`: runs, the model list, sign-in, and auth status.
  - `git`: repo clones and pulls, and the GitHub sync (fetch and push of the `dotmip` repo).
  - `gh`: the GitHub sync reads the accounts (`gh auth status`) and each account's token (`gh auth token`).
  - `bash -c`: the bash tool.
  - Pi's SDK runs in-process.

## Layers
Dependency direction is one way: `http → app → adapters | storage`, and `storage → db.ts → paths.ts`.

| layer | path | role | may import |
| --- | --- | --- | --- |
| http | `src/backend/http` | routing, JSON in and out, static files, the `/mcp` endpoint | `app`, its own files |
| app | `src/backend/app` | use cases, validation, orchestration, tools, skills, sync | `storage`, `adapters` (types and the provider registry only) |
| adapters | `src/backend/adapters` | one file per provider, plus `contract.ts` | Node, provider SDKs |
| storage | `src/backend/storage` | SQLite repositories, one file per domain | `db.ts`, `paths.ts` |
| frontend | `src/frontend` | the dashboard | `/api/*` over HTTP only |

`app/providers.ts` is the only module that constructs providers. Nothing in `app` imports `http`.

## Folder rules
- One file per domain at the top of its folder. A domain with more than one file gets its own folder: `app/room/`, `app/tools/`, `app/skills/`, `app/sync/`.
- Tests sit next to the module they test. Each one is listed in `conventions.md` under "Verify before committing".
- Frontend: one folder per card or dialog family under `features/`. Code used by more than one feature goes to `ui/` or `api/`.
- Generated files (`symbols.md`, `imports.md`) are rebuilt by `node agent/gen-index.mjs`. Line numbers live only there.

## Where data lives
`MIP_HOME` (env, default `~/.mip`), set in `storage/paths.ts`.

| path | contents | written by |
| --- | --- | --- |
| `data/mip.db` | all app data (SQLite, `node:sqlite`) | `storage/*` |
| `sessions/claude/` | Claude CLI config (`CLAUDE_CONFIG_DIR`): login, CLI transcripts | `adapters/claude-cli.ts` |
| `sessions/pi/` | Pi session files | `adapters/pi.ts` |
| `repos/<name>/` | master clones of repositories | `app/repos.ts` |
| `workspaces/<agentId>/` | an agent's files, plus its repository copies | tools, `app/repos.ts` |
| `skills/<name>/` | installed skills: `SKILL.md`, text files, `.mip-source.json`. `skills/.staging/` holds imports not yet confirmed | `app/skills/imports.ts`, `app/skills/create.ts` |
| `sync/` | GitHub sync: `base.json` (merge base), `state.json` (chosen account, last run), `dotmip/` (local clone). No token is stored | `app/sync/*` |
| `restart.log` | output of the last restart | `app/system.ts` |

Deleting an agent removes `workspaces/<agentId>` (`app/tools/workspace.ts`). Provider files are left alone.

## State held in memory (lost on restart)
| state | where | notes |
| --- | --- | --- |
| run tokens and their contexts | `app/tools/index.ts` | one token per run, released when the run ends |
| room `busy` and `speaking` | `app/room/room.ts` | one room conversation at a time |
| Claude auth status (5 s) and model catalog (10 min) | `adapters/claude-cli.ts` | caches |
| sign-in attempts | adapters (`sign-in-agent.ts`) | progress lines and the pending prompt |
| GitHub sync running flag | `app/sync/engine.ts` | the last run is kept in `sync/state.json` |
| client polling state | `features/*` hooks | cleared on page reload |

## Startup
- `storage/db.ts`: creates the schema, runs the additive migrations, and marks runs left `running` as `error` and clones left `cloning` as `error`.
- `app/personas.ts`: seeds the built-in persona, and updates an unedited copy of its older text.

## Providers
- Contract: `adapters/contract.ts`. `AgentProvider` has `id`, `name`, `capabilities`, `models()`, `targets()`, optional sign-in methods, and `run(options)`, which yields `AgentEvent`s and always ends with `done` or `error`.
- Registry: `app/providers.ts`. Two providers:
  - `claude-cli` → `ClaudeCliProvider` (`adapters/claude-cli.ts`). Spawns `claude -p --output-format stream-json`.
  - `pi` → `PiProvider` (`adapters/pi.ts`). In-process SDK. The `anthropic` provider is hidden.
- `capabilities` is informational. Pi reports `tools: false` but receives the app's tools.

## Tools
- `ToolSpec` (`adapters/contract.ts`): `name`, `description`, `guide`, `inputSchema`, and `run(input, context)`. The context holds the workspace, the agent id, the offered and deferred lists, and the abort signal.
- Registry: `app/tools/index.ts`. Three groups:
  - `BASIC_TOOLS` are always offered: `bash`, `read`, `edit`, `write`, `skill_read`.
  - `DEFERRED_TOOLS` are not offered. The model finds one with `tool_search` and runs it with `tool_call`: `memory_search`, `memory_read`, `memory_edit`, `skill_file`.
  - The search tools, `tool_search` and `tool_call`, live in `app/tools/search.ts`.
- Kinds of run take their lists from the registry: agents get `AGENT_TOOLS` and `AGENT_DEFERRED`. Bots get `BOT_TOOLS`, which holds the memory reads and `room_search`, and `BOT_DEFERRED`, which is empty.
- Guides: each tool has a `guide`. The guides of the offered tools go into the system prompt (`toolGuidesPrompt`). A deferred tool's guide comes back with its `tool_search` result.
- Claude reaches the tools through `/mcp`, with `--strict-mcp-config`, built-in tools off (`--tools ""`), `--allowedTools mcp__mip__<name>`, and `--disable-slash-commands`.
- Pi gets the tools as custom tools. Its built-in tools are off, and its own skill folders are off (`noSkills`).
- Paths are confined to the workspace by `inWorkspace` (`app/tools/workspace.ts`). `bash` is not sandboxed.
- Planned, not built:
  - Code mode, where the model writes a short program against the tool API. It needs a real sandbox first.
  - External MCP servers. mip is an MCP server for the Claude CLI, and it does not connect to other servers yet.

## Frontend
- Preact 11, daisyUI 5, Tailwind 4, Vite 8. Dark Nord theme in `styles.css`.
- No global store. State lives in feature hooks and components. Cards tell each other about changes with window events (`api/events.ts`).
- Every HTTP call goes through `api/client.ts`. Every dashboard card is a `Card` (`ui/Card.tsx`).
- `App.tsx` is one scrolling grid. The agent and bots sit side by side on desktops. The bottom row holds the Tasks, Activity, Tools, Skills, and MCP cards.
