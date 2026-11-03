# Architecture

## Processes
- One Node process serves everything: `node dist/backend/http/server.js`. Entry `src/backend/http/server.ts`. Built by `tsc -p src/backend/tsconfig.json` into `dist/backend`.
- Requests, in the order `http/server.ts` checks them. First, the Host check: a `Host` header that does not name `localhost`, `127.0.0.1`, or `[::1]` (with or without a port) gets 403 `{"error":"this server answers only on this machine"}`.
  1. `GET` for any path not starting with `/api/`: a file from `dist/frontend` (`http/static.ts`). `/` serves `index.html`.
  2. `POST /mcp`: the tool endpoint for the Claude CLI (`http/mcp.ts`). The bearer token is the run token.
  3. `GET /api/mcp/oauth/callback` (`OAUTH_CALLBACK_PATH`): an MCP server's sign-in returns here (`http/mcp-oauth.ts`).
  4. `GET /api/slack/oauth/callback` (`SLACK_CALLBACK_PATH`): Slack's sign-in returns here (`http/slack-oauth.ts`).
  5. JSON check: a `POST`, `PUT`, or `PATCH` to the API without `Content-Type: application/json` gets 415.
  6. The JSON API: routes from `http/routes/index.ts`. No match: 404 `{"error":"not found"}`.
- A thrown `AppError` answers with its status. Any other error answers 500. Both bodies are `{"error": message}`.
- Restart (`POST /api/system/restart`, 202): `restartMip()` in `app/system.ts` replies, then the process exits after 300 ms. A detached `sh -c` script waits for that PID, runs `npm install && npm run build` in the checkout, appends the output to `MIP_HOME/restart.log`, then `exec node dist/backend/http/server.js`. The server starts even when install or build fails.
- Update (`POST /api/system/update`, 200): `pullLatest()` in `app/system.ts` runs `git -C <checkout> pull --ff-only`. The new code runs after a restart.
- Dev: `npm run dev:frontend` runs Vite on port 5173 (`src/frontend/vite.config.ts`). It proxies `/api` to `127.0.0.1:3000`, so the server must run separately.

## Child processes
Pi runs in-process (`@earendil-works/pi-coding-agent`), so it starts no child process.

| binary | started by | what for |
| --- | --- | --- |
| `claude` (`CLAUDE_BIN`, default `claude` on PATH) | `adapters/claude-cli.ts` | `-p --output-format stream-json ...`: one per agent run or bot turn. Killed with SIGTERM after `defaultTimeoutMs` (300000 ms). `-p --input-format stream-json` control channel: model list (`list_models`, 20 s timeout). `auth login --claudeai`, `auth logout`, `auth status --json` |
| `bash -c <command>` | `app/tools/bash.ts` | the `bash` tool. Working folder: the agent's workspace. Not sandboxed |
| `git` | `app/git.ts` (`runGit`) | repo clones and pulls (`app/repos.ts`), and the GitHub sync (`app/sync/repo.ts`). Always `GIT_TERMINAL_PROMPT=0` |
| `gh` | `app/sync/github.ts` (`execFile`) | `gh auth status --hostname github.com` (accounts), `gh auth token --hostname github.com --user <login>` (token) |
| `sh -c` | `app/system.ts` | the detached restart script |

- `cliEnv` (`adapters/claude-cli.ts`) copies the environment, deletes `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` so the CLI uses the subscription login, and sets `CLAUDE_CONFIG_DIR` to `MIP_HOME/sessions/claude`.
- The GitHub REST API (`https://api.github.com`) is called with `fetch` from `app/sync/github.ts`, not through a child process.

## Configuration
| variable | read in | default | effect |
| --- | --- | --- | --- |
| `MIP_PORT` | `app/config.ts` | `3000` | port of the server and dashboard |
| `MIP_HOME` | `storage/paths.ts` | `~/.mip` | root of all data (see "Where data lives") |
| `MIP_SLACK_REDIRECT_URI` | `app/slack/connect.ts` | `http://127.0.0.1:<MIP_PORT>/api/slack/oauth/callback` | redirect address sent to Slack |
| `CLAUDE_BIN` | `adapters/claude-cli.ts` | `claude` | path or name of the Claude CLI binary |

- `HOST` is the constant `"127.0.0.1"` in `app/config.ts`. It is not configurable.
- Set by the app, not read from the environment: `PI_CODING_AGENT_DIR` (set to `MIP_HOME/data/pi` when `PiProvider` is built, `app/providers.ts`), `CLAUDE_CONFIG_DIR` (passed to the CLI), `GIT_TERMINAL_PROMPT=0` (passed to git).

## Layers
Import direction: `http → app → adapters | storage`, and `storage/*` → `storage/db.ts` → `storage/paths.ts`. Checked against the real imports.

| layer | path | role | may import |
| --- | --- | --- | --- |
| http | `src/backend/http` | routing, JSON in and out, static files, `/mcp`, the OAuth and Slack callbacks | `app/*`. One type import from `adapters/contract.ts` (in `http/routes/providers.ts`) |
| app | `src/backend/app` | use cases, validation, orchestration, tools, skills, sync | `storage/*`. `adapters/contract.ts` (types). The provider classes in `app/providers.ts` only. npm packages `imapflow`, `mailparser` (mail), `@earendil-works/pi-mcp` (MCP) |
| adapters | `src/backend/adapters` | one file per provider, plus `contract.ts`, `async-queue.ts`, `sign-in-session.ts` | Node built-ins, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent` |
| storage | `src/backend/storage` | SQLite repositories, one file per domain | `db.ts`, `paths.ts`, other `storage/*` modules, `@earendil-works/pi-ai` types |
| frontend | `src/frontend` | the dashboard | `preact` and its own files. Reaches the server only over `/api/*` |

- `app/providers.ts` is the only module that constructs providers.
- Nothing in `app` imports `http`.
- Only `http/routes/providers.ts` reads `adapters` from `http`, and only a type.

## Folder rules
- `storage/`: one file per domain. `db.ts` holds the one connection and the schema.
- `app/`: one file per domain at the top. A domain with more than one file gets a folder: `app/mail/`, `app/mcp/`, `app/pi/`, `app/room/`, `app/skills/`, `app/slack/`, `app/sync/`, `app/tools/`.
- `http/routes/`: one file per domain. Each exports an array of routes. `http/routes/index.ts` spreads them into `routes`.
- `adapters/`: one file per provider, plus the shared helpers listed in the Layers table.
- Tests (`*.test.mjs`) sit next to the module they test. `conventions.md` lists each one under "Verify before committing".
- Frontend: one folder per card or dialog family under `features/`. Code used by more than one feature goes to `ui/` (components, hooks, helpers) or `api/` (HTTP client, shared types, window events).
- Generated files (`symbols.md`, `imports.md`) are rebuilt by `node agent/gen-index.mjs`. Line numbers live only there.

## Where data lives
Everything is under `MIP_HOME` (`storage/paths.ts`). Paths below are relative to it. "Synced" means `app/sync/snapshot.ts` sends the data to the private `dotmip` repo.

| path | contents | written by | synced |
| --- | --- | --- | --- |
| `data/mip.db` | SQLite (`node:sqlite`), mode 600. Agents, messages, runs, personas, bots, rooms, notes, spending, Pi credentials and model catalogs | `storage/*` through `storage/db.ts` | yes, by table |
| `data/pi/` | Pi's agent folder: `settings.json`, `models.json` | Pi SDK (`adapters/pi.ts`). Sync writes them through `storage/pi.ts` | yes |
| `data/mcp.json` | MCP servers, mode 600. Tokens and OAuth state are inside | `app/mcp/config.ts` | yes |
| `data/mail.json` | mail accounts with IMAP app passwords, mode 600 | `app/mail/accounts.ts` | yes |
| `data/mail-cache.json` | newest mail headers per account. No bodies | `app/mail/cache.ts` | yes |
| `data/slack.json` | Slack app client ID and secret, and each connected user's token, mode 600 | `app/slack/config.ts` | yes |
| `data/slack-cache.json` | Slack conversations, messages, unread counts, mode 600 | `app/slack/cache.ts` | yes |
| `data/device-id` | this install's device UUID, made on first use | `app/installation.ts` | no |
| `sessions/claude/` | Claude CLI config (`CLAUDE_CONFIG_DIR`): login and CLI transcripts | the Claude CLI, run by `adapters/claude-cli.ts` | no |
| `sessions/pi/` | Pi session files | `adapters/pi.ts` (`SessionManager`) | no |
| `repos/<name>/` | master clones of repositories | `app/repos.ts` | no |
| `workspaces/<agentId>/` | an agent's files and its repository copies. The `bash` working folder | `app/tools/workspace.ts` (`workspaceFor`), `app/repos.ts` | no |
| `skills/<name>/` | installed skills: `SKILL.md` and text files | `SKILL.md`: `app/skills/create.ts` (form) and `app/skills/imports.ts` (import, on confirm, by rename from staging) | no |
| `skills/.staging/<id>/` | an import awaiting confirmation: the copied folder and `.mip-source.json` (source path, SHA-256 of `SKILL.md`, time) | `app/skills/imports.ts` only. `.mip-source.json` is written by no other code | no |
| `sync/base.json` | the merge base: the whole local snapshot as of the last sync (`writeBase`). Holds the synced secrets in plain text: MCP tokens and env values, mail app passwords, the Slack client secret and user tokens, Pi credentials. Written with no mode option, so it gets the process umask, not 600 | `app/sync/engine.ts` | no. Local only, but it holds secrets |
| `sync/state.json` | chosen GitHub account, last sync result. No secrets | `app/sync/engine.ts` | no |
| `sync/dotmip/` | local git clone of the `dotmip` repo. `writeTree` writes the same records, including the secret-bearing `mcp/`, `mail/`, `slack-app/`, `slack/`, `pi-credentials/`, and commits them. Their history stays in `.git` | `app/sync/repo.ts` | yes, pushed to GitHub |
| `restart.log` | output of the last restart | the restart script (`app/system.ts`) | no |

- `removeAgent` (`app/agents.ts`) deletes the agent row and `workspaces/<agentId>` (`removeWorkspace`). Its provider session files stay.
- The `dotmip` repo folders are the `FOLDERS` list in `app/sync/repo.ts`: `personas`, `bots`, `notes`, `agents`, `mcp`, `mail`, `slack-app`, `slack`, `pi-credentials`, `pi-models`, `pi-files`, `mail-cache`, `slack-cache`, `spending`. Plus `rooms.json` and `room.json`.
- Not in the repo: skills, sessions, repository clones, workspaces, the device id, and the Claude CLI login. Pi's credentials are in the repo.
- The GitHub token is never written to disk. Each sync reads it from `gh auth token` and passes it to git through `authEnv` (`app/sync/github.ts`). The synced secrets are on disk in `sync/base.json` and `sync/dotmip/` (see the table).

## State held in memory (lost on restart)
| state | where | notes |
| --- | --- | --- |
| run tokens and their `RunContext` | `runs` map in `app/tools/index.ts` | `registerRun` and `releaseRun`. One token per run |
| rooms with a turn running, and who is speaking | `talking` map in `app/room/room.ts` | `roomStatus`. One conversation per room |
| rooms with an `agent_ask` task out | `delegating` set in `app/tools/index.ts` | one task per room |
| an agent run's pending question | `pending` map in `app/tools/ask.ts` | taken when the run ends, saved on its reply |
| MCP connections and config problems | `state` in `app/mcp/manager.ts` | rebuilt by `startMcpServers()` from `data/mcp.json` |
| IMAP connections | `sessions` map in `app/mail/sessions.ts` | one per account. Closed after `DEFAULT_IDLE_CLOSE_MS` (5 min) without a read |
| Slack sign-in states | `pending` map in `app/slack/connect.ts` | each state is used once and expires after 10 min |
| Slack cache | `entries` in `app/slack/cache.ts` | loaded from `slack-cache.json` |
| GitHub sync | `chosen`, `lastSync` (loaded from `sync/state.json`), `running` in `app/sync/engine.ts` | `running` is not saved |
| Claude auth status (5 s) and model catalog (10 min) | `statusCache`, `catalogCache` in `adapters/claude-cli.ts` | `STATUS_TTL_MS`, `CATALOG_TTL_MS` |
| sign-in attempts: output lines, pending prompt | `SignInSession` (`adapters/sign-in-session.ts`), used by `claude-cli.ts` and `pi.ts` | Pi keeps them in `signIns` |
| Pi credential writes | `chains` in `DbCredentialStore` (`app/pi/store.ts`) | writes for one provider run in order |
| device id | `cached` in `app/installation.ts` | read from `device-id` once |
| client polling state | `features/*` hooks | cleared on page reload |

## Startup
In the order the code runs:
1. `storage/db.ts` calls `ensureMipDirs()` (`storage/paths.ts`): creates `data/`, `repos/`, `data/pi/`, `sessions/claude/`, `sessions/pi/`. Opens `data/mip.db` and sets it to mode 600.
2. `storage/db.ts` creates the schema (`CREATE TABLE IF NOT EXISTS`), runs the table renames and the additive `hasColumn` migrations, and creates the room `main` with every bot if there are no rooms. It marks `runs` left `running` as `error`, and `repos` left `cloning` as `error` with `interrupted by a server restart`.
3. `app/personas.ts` (on import): replaces an unedited copy of the previous built-in persona text (matched by SHA-256), inserts the `default` persona if missing, and makes one persona the default if none is.
4. `app/providers.ts` builds `ClaudeCliProvider` and `PiProvider`.
5. `http/server.ts` runs `importLegacyPiAuth()`. It copies `~/.pi/agent/auth.json` into `pi_credentials` when that table is empty, then records `pi-auth-imported` in `pi_state`. It runs once.
6. `http/server.ts` calls `listen(PORT, HOST)`, then `startMcpServers()` in the background.

## Providers
- Contract: `adapters/contract.ts`. `AgentProvider` has `id`, `name`, `capabilities` (`streaming`, `tools`, `mcp`, `sessions`, `signIn`), `models()`, `targets()`, optional `startSignIn`, `signInProgress`, `answerSignIn`, `signOut`, and `run(options)`. `run` yields `AgentEvent`s: `text`, `tool_call`, `tool_result`, `error`, `done`. It always ends with `done` or `error`.
- `RunOptions`: `prompt`, `systemPrompt`, `model`, `thinking`, `sessionId`, `tools`, `deferredTools`, `workspace`, `agentId`, `botId`, `roomId`, `toolServer` (`url`, `token`), `signal`.
- Registry: `app/providers.ts`. The array `providers` holds:
  - `ClaudeCliProvider` (`adapters/claude-cli.ts`): id `claude-cli`, name "Claude (official CLI)", config in `sessions/claude/`. Its one sign-in target is `claude-subscription`, method `cli`.
  - `PiProvider` (`adapters/pi.ts`): id `pi`, name "Pi". In-process SDK. `HIDDEN_PROVIDERS` hides Pi's `anthropic` provider.
- Exports of `app/providers.ts`: `listProviders`, `findProvider` (404 for an unknown id), `hasProvider`, `signIn`, `answerSignIn`, `signOut`, `reloadPiConfig`.
- Capabilities: both set `streaming`, `sessions`, `signIn`. `claude-cli` also sets `tools` and `mcp`. Pi sets `tools: false` and `mcp: false`, yet it receives the app's tools. The flags are informational.

## Tools
- `ToolSpec` (`adapters/contract.ts`): `name`, `description` (one line, used by search), `guide` (one paragraph on when and how to use it), `inputSchema` (JSON Schema), `run(input, context)`. `ToolContext`: `workspace`, `agentId`, `botId`, `roomId`, `deferred`, `signal`.
- Results: `ok(text)` and `fail(text)` from `app/tools/result.ts`. A failed result still goes back to the model as text.
- Registry: `app/tools/index.ts`. `TOOLS` lists every mip tool. A tool shows in `GET /api/tools` only if it is in one of the lists below.
  - `BASIC_TOOLS` (agent runs only): `bash`, `read`, `edit`, `write`, `skill_search`, `skill_read`, `ask_user`.
  - `DEFERRED_TOOLS` (agent runs, not offered): `memory_search`, `memory_read`, `memory_edit`, `skill_file`.
  - Search tools (`app/tools/search.ts`): `tool_search` finds deferred tools by words, `tool_call` runs one of them by name.
  - Agent lists: `AGENT_TOOLS` = `BASIC_TOOLS` + the search tools (offered). `AGENT_DEFERRED` = `DEFERRED_TOOLS` + `spending_upsert` (deferred). `agentDeferredTools()` adds the connected MCP tools, taken when a run starts.
  - Bot lists: `BOT_TOOLS` (offered): `memory_search`, `memory_read`, `memory_edit`, `skill_search`, `skill_read`, `skill_file`, `room_search`, `agents_list`, `agent_ask`, `tool_search`, `tool_call`. `botDeferredTools()` (deferred): `mail_list`, `mail_read`, `slack_search`, `slack_read`, `slack_unreplied`, `spending_list`, and the connected MCP tools.
  - Bots get no `BASIC_TOOLS`: no `bash`, `read`, `edit`, `write`, or `ask_user`.
- Guides: `toolGuidesPrompt(tools)` puts the guides of the offered tools in the system prompt. Agent runs pass `AGENT_TOOLS` (`app/runs.ts`). Bot turns pass `BOT_TOOLS` (`app/room/room.ts`). A deferred tool's guide comes back in its `tool_search` result.
- Run tokens: `registerRun(context)` returns a UUID for one run. `runContextForToken` reads it. `/mcp` answers `tools/list` and `tools/call` from the run's `tools` only. `tool_call` runs only a tool in the run's `deferred` list.
- `describeTools()` feeds `GET /api/tools`. Each entry has `load` (`basic`, `search`, or `deferred`), `agent`, and `bot`.
- Claude reaches the tools through `/mcp`. Its command line has `--mcp-config` (server `mip`, HTTP, bearer token), `--strict-mcp-config`, `--tools ""` (built-in tools off), `--allowedTools mcp__mip__<name>` for each offered tool, and `--disable-slash-commands`.
- Pi gets the offered tools as `customTools`, with `noTools: "builtin"` and `noSkills: true`.
- External MCP servers (`data/mcp.json`) connect at startup, on `POST /api/mcp/reload`, and after a sync changes `mcp.json`. Each tool is named `mcp_<server>_<tool>` (non-word characters become `_`, 64 characters at most, `app/mcp/manager.ts`). They are deferred for agents and bots.
- Paths are confined to the workspace by `inWorkspace` (`app/tools/workspace.ts`). `bash` is not sandboxed.

## Frontend
- Versions from `package.json`: Preact `^11.1.0`, daisyUI `^5.7.50`, Tailwind CSS `^4.3.3` (with `@tailwindcss/vite`), Vite `^8.3.5` (with `@preact/preset-vite`), TypeScript `^5.6.0`.
- Entry: `src/frontend/main.tsx` renders `App.tsx`. The theme is the daisyUI theme `mip-nord-dark` (`styles.css`). `styles.css` also defines the `.glow-<name>` and `.bot-<name>` color classes.
- `App.tsx`: a header (view toggle `dash`, `preview`, `offline`, where only `dash` has cards; Settings gear opens `SettingsDialog`), then one grid:
  - `AgentCard` (8 of 12 columns on `xl`) and `BotsCard` (4 of 12) side by side on desktops.
  - `EmailCard`, `SlackCard`, `WhatsAppCard` in a row of three from `md` up.
  - `MemoryCard` and `RepositoriesCard`, half width each from `md` up.
  - Bottom row: `SpendingCard`, `ToolsCard`, `SkillsCard`, `McpCard`, and two `PlaceholderCard`s, `Tasks` and `Activity`.
- No global store. State lives in feature hooks and components. Cards tell each other about changes with named window events in `api/events.ts` (`announce`, `subscribe`; names `AGENTS_CHANGED`, `PERSONAS_CHANGED`, `PROVIDERS_CHANGED`). Listeners use `useAnnouncement` (`ui/hooks.ts`).
- Polling: `usePolling(fn, ms, enabled)` in `ui/hooks.ts`.
- Every HTTP call goes through `api/client.ts`: `api.get|post|put|patch|del`. Errors are `ApiError` with the server's `error` text and the status.
- Every dashboard card is a `Card` (`ui/Card.tsx`), with a `glow` from the `Glow` type and a `CardBody` (`title`, `actions`).
- Every dialog is a `Modal` (`ui/Modal.tsx`), a native `<dialog>` opened by its `open` prop.
