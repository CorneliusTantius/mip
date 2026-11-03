# HTTP API

Server: `src/backend/http/server.ts`, one `createServer` on `HOST` 127.0.0.1, `PORT` from `MIP_PORT` (default 3000). Every reply is JSON except the two OAuth callback pages and static files.

## Conventions — `http/server.ts`, `http/respond.ts`, `http/router.ts`

Pipeline (`handle` in `http/server.ts`), in this order:
1. `GET` and the path does not start with `/api/` → `serveStatic`. Served if a file exists.
2. `POST /mcp` → `handleMcp` (`http/mcp.ts`). The body is parsed by `readJson` before this step.
3. `GET /api/mcp/oauth/callback` → `handleOAuthCallback`. Path constant `OAUTH_CALLBACK_PATH` in `app/mcp/manager.ts`.
4. `GET /api/slack/oauth/callback` → `handleSlackCallback`. Path constant `SLACK_CALLBACK_PATH` in `app/slack/connect.ts`.
5. `matchRoute(routes, method, pathname)` → the route handler. No match → `notFound()`.

Routing (`http/router.ts`):
- `routes/<domain>.ts` exports `<domain>Routes: Route[]`. `routes/index.ts` concatenates them into `routes`.
- A route is `{method, path, handle}`. `path` segments starting with `:` capture one segment into `params`.
- Match: method equal, same segment count, literal segments equal. The path is split on `/` before decoding, so `%2F` stays inside one segment. Empty segments are dropped (trailing and doubled slashes are tolerated).
- No two routes match the same method and segment shape, so order in `routes/index.ts` does not change behavior.
- Unknown path, or known path with another method: `404 {"error": "not found"}`. There is no 405.

Request and reply (`http/respond.ts`):
- `readJson(req)`: reads the whole body and `JSON.parse`s it. Empty body → `{}`. Does not check `Content-Type`.
- `requireJson(req)`: throws `AppError(415, "send this request as JSON")` unless the `Content-Type` header contains `application/json`. `http/server.ts` calls it before routing for every `POST`, `PUT`, and `PATCH` to the API, so no route calls it. `DELETE` has no body and is not checked. `/mcp` and the two OAuth callbacks are not API routes and are not checked.
- Host: `http/server.ts` answers `403 {"error": "this server answers only on this machine"}` before any other step, unless the `Host` header names `localhost`, `127.0.0.1`, or `[::1]`, with or without a port. No route checks `Origin`.
- `Reply` is `{status, body}`. Helpers: `ok` 200, `created` 201, `accepted` 202, `ack()` 200 `{ok: true}`, `notFound()` 404 `{error: "not found"}`.
- `sendJson` sends `Content-Type: application/json` and `Cache-Control: no-store`.

Errors (`app/errors.ts`, `http/server.ts`):
- `AppError(status, message)` → that status with `{error: message}`.
- Any other thrown error → `500 {error: err.message}`. Internal messages (SQLite, git, JSON parse errors) reach the client as is.
- A malformed JSON body is therefore `500`, not `400`.
- If headers were already sent, the response is ended without a body.

Tables below: **JSON** is `yes` when the route is `POST`, `PUT`, or `PATCH`, so `server.ts` checks its `Content-Type`. **reads** lists the fields the handler reads; `?` means optional. Field types are what the handler passes on; the app coerces with `String()`, `Number()` or `Boolean()` where noted. Quoted error messages are exact.

## Agents (agents) — `routes/agents.ts`
App: `app/agents.ts`.

| method | path | JSON | reads | reply | errors |
| --- | --- | --- | --- | --- | --- |
| GET | /api/agents | no | — | 200 `{agents: Agent[]}` | — |
| POST | /api/agents | yes | `providerId` string; `personaId?` string (missing → default persona) | 201 `Agent` | 400 "unknown provider"; 400 "unknown persona" (also for `personaId: null`) |
| GET | /api/agents/:agentId | no | — | 200 `{agent, messages, activeRunId?}` | 404 "no such agent" |
| PATCH | /api/agents/:agentId | yes | `title?` string (trimmed, non-empty); `openToBots?` boolean; `model?` string (`""` or `null` = provider default); `thinking?` string (`""` or `null` clears) | 200 `Agent` | 404 "no such agent"; 400 "title is required"; 400 "openToBots must be true or false"; 400 `this provider has no model "<id>"`; 400 `this model has no thinking level "<level>"` (only when `thinking` is sent) |
| DELETE | /api/agents/:agentId | no | — | 200 `{ok: true}` | 404 "no such agent"; 409 "this agent is still running" |

- `Agent`: `{id, providerId, providerSessionId, personaId, model, thinking, title, openToBots, updatedAt}`. New agents have `openToBots: true`.
- `Message` (in `messages`): `{role, text, tools: string[], calls: ToolCall[], error, ask}`. `ToolCall`: `{name, input (JSON text), output (null if the run ended first), isError}`.
- PATCH applies fields in order: title, openToBots, then model and thinking. There is no transaction, so a 400 on a later field leaves earlier fields saved.
- `model` is checked against `findProvider(providerId).models()` at request time. If `model` changes and `thinking` is not sent, a thinking level the new model does not list is cleared silently.
- DELETE removes the agent, its messages, runs, run events, and `~/.mip/workspaces/<agentId>`. Provider session files are kept.
- Persona is fixed at creation. There is no API to change it.

## Runs — `routes/runs.ts`
App: `app/runs.ts`.

| method | path | JSON | reads | reply | errors |
| --- | --- | --- | --- | --- | --- |
| POST | /api/run | yes | `agentId` string (missing → ""); `prompt` string (trimmed; missing → "") | 202 `{runId}` | 404 "no such agent"; 400 "prompt is required"; 409 "this agent is still running" |
| GET | /api/runs/:runId/events | no | query `after` (missing → 0; `Number()`, not validated) | 200 `{status, events: {seq, event}[]}` | 404 "no such run" |

- `status`: `"running"` until the run ends, then `"done"` or `"error"`.
- `events`: those with `seq > after`, ascending.
- `event` is an `AgentEvent` (`adapters/contract.ts`): `{type: "text", text}`, `{type: "tool_call", id, name, input}`, `{type: "tool_result", id, output, isError}`, `{type: "error", message}`, `{type: "done", sessionId?}`.
- POST saves the user message before it returns. The run continues if the client disconnects. Each event is written to `run_events` as it arrives. The assistant message is saved when the run ends.
- An agent has at most one running run (`activeRunForAgent`).
- A prompt starting with `/<skill-name>` is expanded for the model (`withSkillCommand`). The saved message keeps the text as typed.

## Personas — `routes/personas.ts`
App: `app/personas.ts`.

| method | path | JSON | reads | reply | errors |
| --- | --- | --- | --- | --- | --- |
| GET | /api/personas | no | — | 200 `{personas: Persona[]}` | — |
| POST | /api/personas | yes | `name` string (trimmed, required); `systemPrompt` string (trimmed, required) | 201 `Persona` | 400 "name is required"; 400 "system prompt is required" |
| PUT | /api/personas/:personaId | yes | same as POST | 200 `Persona` | 404 "no such persona"; 400 as POST |
| DELETE | /api/personas/:personaId | no | — | 200 `{ok: true}` | 404 "no such persona"; 400 "the built-in Default persona can't be deleted" (id `default`); 400 "set another persona as default before deleting this one"; 409 `<n> agent(s) use(s) this persona` |
| POST | /api/personas/:personaId/default | yes | — | 200 `{ok: true}` | 404 "no such persona" |

- `Persona`: `{id, name, systemPrompt, isDefault}`. Exactly one persona has `isDefault: true`.
- Built-in persona id `default` (`DEFAULT_PERSONA_ID`) is created at startup and cannot be deleted. It is the fallback when an agent's persona is missing (`personaPrompt`).
- The prompt is read on every run, so edits apply to the next message.

## Bots — `routes/bots.ts`
App: `app/bots.ts`.

| method | path | JSON | reads | reply | errors |
| --- | --- | --- | --- | --- | --- |
| GET | /api/bots | no | — | 200 `{bots: Bot[]}` | — |
| POST | /api/bots | yes | `name` string (trimmed; rule below); `persona` string (trimmed, required, max 4000); `providerId?` string (missing or null → `"claude-cli"`); `model?` string (missing or empty → provider default); `thinking?` string (missing or empty → none); `color?` one of the colors (missing → first color no bot uses) | 201 `Bot` | 400 "name must start with a letter and use 2 to 24 letters, digits, - or _"; 409 `a bot called <name> already exists`; 400 "persona is required"; 400 "persona must be 4000 characters or fewer"; 400 "unknown provider"; 400 `this provider has no model "<id>"`; 400 `this model has no thinking level "<level>"`; 400 `color must be one of frost, orange, violet, green, yellow, red, teal, blue` |
| PUT | /api/bots/:botId | yes | same fields as POST, as a full replacement: omitted `model` and `thinking` clear, omitted `providerId` becomes `"claude-cli"`, omitted `color` keeps the bot's color | 200 `Bot` | 404 "no such bot" (checked before the fields); same 400 and 409 as POST |
| DELETE | /api/bots/:botId | no | — | 200 `{ok: true}` | 404 "no such bot" |

- `Bot`: `{id, name, persona, providerId, model, thinking, color}`.
- Name rule (`NAME` in `app/bots.ts`): `^[A-Za-z][A-Za-z0-9_-]{1,23}$`, 2 to 24 characters. Unique, case-insensitive (the column is `COLLATE NOCASE`).
- Checks run in this order: name format, name taken, persona, provider, model, thinking, color.
- Colors (`BOT_COLORS`, `storage/bot-colors.ts`): `frost`, `orange`, `violet`, `green`, `yellow`, `red`, `teal`, `blue`.
- DELETE removes the bot from every room (`room_bots`). Its messages stay, with its name.

## Room — `routes/room.ts`
App: `app/room/rooms.ts` (rooms), `app/room/room.ts` (messages and turns), `app/room/engine.ts` (turn order).

| method | path | JSON | reads | reply | errors |
| --- | --- | --- | --- | --- | --- |
| GET | /api/rooms | no | — | 200 `{rooms: Room[]}`, oldest first | — |
| POST | /api/rooms | yes | `name` string (trimmed, required, max 40); `botIds?` string[] (each must be an existing bot; duplicates dropped; missing → []); `masterBotId?` string or null (`""` or null clears; must be in `botIds`); `collapseOthers?` (`Boolean()`, default false) | 201 `Room` | 400 "name is required"; 400 "name must be 40 characters or fewer"; 409 `a room called "<name>" already exists`; 400 "botIds must be a list"; 400 "a bot in the list does not exist"; 400 "the room master must be a bot in the room" |
| PUT | /api/rooms/:roomId | yes | same fields, all optional; a field left out keeps its value | 200 `Room` | 404 "no such room"; same 400 and 409 as POST |
| DELETE | /api/rooms/:roomId | no | — | 200 `{ok: true}`; the room's messages and member rows are deleted | 404 "no such room"; 409 "keep at least one room" |
| GET | /api/room | no | query `room` (room id; missing → 404); `after?` (message id; missing → 0; `Number()`, not validated) | 200 `{messages: RoomMessage[], busy: boolean, speaking: string \| null}` | 404 "no such room" |
| POST | /api/room/messages | yes | `room` string (room id); `text` string (trimmed, required, max 4000) | 202 `RoomMessage` (the saved user message) | 404 "no such room"; 409 "this room is busy, wait for the bots to finish"; 400 "message is required"; 400 "message must be 4000 characters or fewer" |

- `Room`: `{id, name, botIds, masterBotId, collapseOthers, createdAt, updatedAt}`. `masterBotId` is cleared automatically when that bot leaves `botIds`.
- `RoomMessage`: `{id, roomId, kind, botId, authorName, text, calls, createdAt}`. `kind` is `"user"`, `"bot"`, `"agent"` or `"system"`. `"agent"` is the reply of an agent a bot sent a task to (`agent_ask`); its `botId` is null. `calls` is non-empty only on bot messages.
- GET: `after` 0 → the latest 100 messages. `after` > 0 → up to 200 with `id > after`. Both return oldest first.
- `busy` and `speaking` are in memory. They clear on restart.
- POST checks in this order: room (404), busy (409), empty text (400), length (400). It returns at once; turns run in the background.
- Turn queue: if the text has `@Name` mentions, the queue starts with those bots. Otherwise it starts with every member, master first. A bot reply that names another member queues that member. At most 8 turns per message (`MAX_TURNS`).
- A room with no members gets a `system` message. The user message is still returned.
- Room names are unique, case-insensitive. The last room cannot be deleted.

## Repositories — `routes/repos.ts`
App: `app/repos.ts`.

| method | path | JSON | reads | reply | errors |
| --- | --- | --- | --- | --- | --- |
| GET | /api/repos | no | — | 200 `{repos: RepoCard[]}`. `RepoCard` is `Repo` plus `branch` and `copies` | — |
| POST | /api/repos | yes | `url` string (trimmed; a link with no scheme such as `github.com/owner/repo` gets `https://`) | 202 `Repo` with `status: "cloning"` (no `branch` or `copies` keys) | 400 "paste a git clone link, such as github.com/owner/repo"; 400 `can't use "<name>" as a folder name`; 409 `a repository called "<name>" is already here` |
| POST | /api/repos/pull | yes | — | 200 `{results: {id, name, ok, message}[]}`, one per ready repo | — (a failed pull is `ok: false` with git's message) |
| DELETE | /api/repos/:repoId | no | — | 200 `{ok: true}`; removes the master clone folder | 404 "no such repository"; 409 `<name> is still cloning` |
| POST | /api/repos/:repoId/copies | yes | `agentId` string | 201 `{ok: true}`; clones into `~/.mip/workspaces/<agentId>/<name>` | 404 "no such repository"; 404 "no such agent"; 409 `<name> isn't ready yet`; 409 `this agent already has <name>`; 500 git's message (partial copy removed) |

- `Repo`: `{id, name, url, status, error}`. `status` is `"cloning"`, `"ready"` or `"error"`. `name` is the last path segment of the link without `.git`.
- `branch`: the checked-out branch. `"detached"` when HEAD is detached. Null when not ready or unknown.
- Clones run in the background into `~/.mip/repos/<name>`. A failed clone removes its folder and sets `status: "error"`.
- Pull is `git pull --ff-only`. Agents' copies are not pulled.
- A copy's `origin` is the real link, not the master clone. Deleting the master does not affect copies.
- `copies` lists agents whose workspace has `<name>/.git`.

## Memory — `routes/memory.ts`
App: `app/memory.ts`.

| method | path | JSON | reads | reply | errors |
| --- | --- | --- | --- | --- | --- |
| GET | /api/graph | no | — | 200 `{nodes: {id, title, missing, degree}[], edges: {source, target}[]}` | — |
| GET | /api/memory | no | query `q?` string | 200 `{notes: NoteItem[]}`. Without `q` (or blank): every note as `{id, title, updatedAt}`, newest first. With `q`: up to 100 matches as `{id, title, snippet}`, best first | — |
| POST | /api/memory | yes | `title` string (trimmed, required); `body?` string (missing → "") | 200 `{title, links, tags}` (200, not 201) | 400 "title is required" |
| GET | /api/memory/:title | no | path `title` (decoded; `%2F` allowed) | 200 `{id, title, body, links, backlinks, tags}` | 404 "no such note" |
| DELETE | /api/memory/:title | no | — | 200 `{ok: true}`; links from other notes to it stay | 404 "no such note" |

- Titles are unique and case-insensitive. POST with an existing title replaces that note's body and title, and keeps its id.
- `links`: every `[[Title]]` or `[[Title|alias]]` in `body`. The first spelling of each title is kept.
- `tags`: every `#tag` at the start of the text or after whitespace, lowercased.
- `backlinks`: titles of notes that link to this one.
- Links may name notes that do not exist. The graph shows those as `missing: true`.
- Graph: node `id` is the lowercased title. Edges are undirected and deduplicated. Self-links are dropped. `degree` counts edges.
- Search: `q` is split into runs of letters and digits. Any word matches (OR). A `q` with no letters or digits returns `[]`. Snippets come from FTS5.
- `/api/graph` is its own path, so a note titled "graph" still opens at `/api/memory/graph`.

## Providers — `routes/providers.ts`
App: `app/providers.ts`. Adapters: `adapters/claude-cli.ts` (id `claude-cli`), `adapters/pi.ts` (id `pi`).

| method | path | JSON | reads | reply | errors |
| --- | --- | --- | --- | --- | --- |
| GET | /api/providers | no | — | 200 `{providers: ProviderInfo[]}` | — |
| POST | /api/providers/:providerId/targets/:targetId/sign-in | yes | `method?` (`"subscription"`, `"api_key"` or `"cli"`; passed to the adapter unchecked) | 202 `{started: true}`. Sign-in runs in the background; poll GET `/api/providers` (`targets[].progress`) | 404 `unknown provider "<id>"`; 500 for adapter errors (plain `Error`): unknown target, method not supported |
| POST | /api/providers/:providerId/targets/:targetId/answer | yes | `answer` string (missing → "") | 200 `{ok: true}` | 404 `unknown provider "<id>"`; 500 for adapter errors |
| POST | /api/providers/:providerId/targets/:targetId/sign-out | yes | — | 200 `{ok: true}` | 404 `unknown provider "<id>"`; 500 for adapter errors |
| POST | /api/providers/:providerId/targets/:targetId/:action | yes | body is read first | 404 `{error: "not found"}` for any other `:action` | — |

- `ProviderInfo`: `{id, name, capabilities: {streaming, tools, mcp, sessions, signIn}, models: ModelOption[], targets: SignInTarget[], error?}`.
- A failing `targets()` gives `targets: []` and `error`. A failing `models()` gives `models: []`.
- `SignInTarget`: `{id, name, methods, auth: {loggedIn, method?}, progress}`. `progress`: `{running, output: string[], prompt?: {message, type: "text" \| "secret" \| "manual_code", placeholder?}, error?}`.
- `claude-cli` accepts method `cli` or none. `pi` accepts `subscription` and `api_key`.
- A provider without a sign-in method (`startSignIn`, `answerSignIn`, `signOut` are optional on `AgentProvider`) ignores the call and still returns 202 or 200.
- Pi's `answerSignIn` does nothing when no sign-in is running.

## System — `routes/system.ts`
App: `app/system.ts`.

| method | path | JSON | reads | reply | errors |
| --- | --- | --- | --- | --- | --- |
| POST | /api/system/update | yes | body ignored | 200 `{output}`: stdout of `git pull --ff-only` in the checkout root | 415 "send this request as JSON"; 500 with git's error line (for example a non-fast-forward pull) |
| POST | /api/system/restart | yes | body ignored | 202 `{restarting: true}` | 415 |

- `update` does not install or build. The checkout root is three folders above `dist/backend/app/system.js`.
- `restart`: the reply is sent, then `process.exit(0)` runs 300 ms later. A detached `sh` waits for that PID to exit. It runs `npm install && npm run build` (output appended to `~/.mip/restart.log`) and then `exec`s `node dist/backend/http/server.js`. It starts the server even if install or build failed.

## Skills — `routes/skills.ts`
App: `app/skills/registry.ts` (reads), `create.ts`, `imports.ts`, `format.ts` (rules).

Installed skills are folders `~/.mip/skills/<name>/` with a `SKILL.md`. Its `---` header holds `name:` and `description:` lines. Staged imports sit in `~/.mip/skills/.staging/<id>/` and are not listed. A folder that is not a valid skill is listed under `problems`, not hidden.

| method | path | JSON | reads | reply | errors |
| --- | --- | --- | --- | --- | --- |
| GET | /api/skills | no | — | 200 `{skills: SkillSummary[], problems: {folder, error}[]}`, skills sorted by name | — |
| GET | /api/skills/:name | no | — | 200 `SkillDetail` `{name, description, body, files}` | 404 "no such skill"; 409 `skill "<name>" is not valid: <reason>` |
| DELETE | /api/skills/:name | no | — | 200 `{ok: true}` | 404 "no such skill"; 409 `skill "<name>" is not valid: …` (an invalid skill cannot be deleted through the API) |
| POST | /api/skills | yes | `name` string (required; lowercase letters, digits, single hyphens; max 64; `imports` is reserved); `description` string (required; one line; max 1024); `body` string (required; the instructions) | 201 `SkillDetail` | 400 "the name must be lowercase letters, digits, and single hyphens, up to 64 characters"; 400 "a description is required"; 400 "the description must be one line"; 400 "the description must be 1024 characters or fewer"; 400 "the instructions are required"; 400 "the instructions are too long" (SKILL.md over 64 KB); 409 `a skill named <name> is already installed`; 415 |
| POST | /api/skills/imports | yes | `path` string (required; a full path to a folder) | 201 `{id, name, description, files, source, skillMd, replaces}`. Nothing is installed yet | 400 "give the full path of the skill folder"; 400 "that path is not a folder" (a symbolic link is refused too); 400 "the folder has no SKILL.md at its top level"; 400 "SKILL.md is too large"; 400 with the header reason (for example "the SKILL.md header needs a name"); 400 "symbolic links are not allowed: <path>"; 400 "not a regular file: <path>"; 400 "<path>: skills take text files only (.md, .txt, .json, .yaml, .yml, .csv)"; 400 "a skill has at most 50 files"; 400 "a skill is at most 512 KB in total"; 415 |
| POST | /api/skills/imports/:importId/confirm | yes | body ignored | 200 `SkillDetail`. An installed skill with the same name is replaced | 404 "no such import"; 415 |
| DELETE | /api/skills/imports/:importId | no | — | 200 `{ok: true}`. Drops the staged folder. Unknown or malformed ids are ignored | — |

- `SkillSummary`: `{name, description, files}`. `SkillDetail`: `SkillSummary` plus `body` (the text after the header).
- `files`: the text files besides `SKILL.md`, as paths relative to the skill folder, sorted. Dot entries and symbolic links are skipped.
- Text extensions (`TEXT_EXTENSIONS`): `.md`, `.txt`, `.json`, `.yaml`, `.yml`, `.csv`.
- Limits: 50 files per skill, 512 KB in total, SKILL.md 64 KB, and 64 KB per file read through `skill_file`.
- Create writes `SKILL.md` only. Files need an import.
- Import `replaces` is the installed SKILL.md text when a skill with the same name exists, else null.
- Confirm removes the installed folder and renames the staged folder into place.
- Staging folders older than 24 hours are removed each time a new import is staged.
- `GET` and `DELETE` routes on skills do not require JSON.

## Tools — `routes/tools.ts`
App: `app/tools/index.ts` (`describeTools`, run lists).

| method | path | JSON | reads | reply | errors |
| --- | --- | --- | --- | --- | --- |
| GET | /api/tools | no | — | 200 `{tools: ToolInfo[]}` | — |

`ToolInfo`: `{name, description, guide, inputSchema, load, agent, bot}`.

- `load` is one value per tool. It does not depend on the run kind:
  - `basic`: offered to the model directly.
  - `deferred`: found with `tool_search`, run with `tool_call`.
  - `search`: `tool_search` and `tool_call` themselves.
- `agent` and `bot` say whether that kind of run may use the tool.
- Bots are offered some `deferred` tools directly (`BOT_TOOLS`). `memory_*` and `skill_file` have `load: "deferred"` but are offered to bots directly.

| tool | load | agent | bot | defined in |
| --- | --- | --- | --- | --- |
| `bash`, `read`, `edit`, `write` | basic | yes | no | `app/tools/bash.ts`, `files.ts` |
| `skill_search`, `skill_read` | basic | yes | yes | `app/tools/skills.ts` |
| `ask_user` | basic | yes | no | `app/tools/ask.ts` |
| `room_search` | basic | no | yes | `app/tools/room.ts` |
| `agents_list`, `agent_ask` | basic | no | yes | `app/tools/index.ts` |
| `memory_search`, `memory_read`, `memory_edit` | deferred | yes | yes | `app/tools/memory.ts` |
| `skill_file` | deferred | yes | yes | `app/tools/skills.ts` |
| `tool_search`, `tool_call` | search | yes | yes | `app/tools/search.ts` |
| `mail_list`, `mail_read`, `mail_send`, `mail_delete`, `slack_search`, `slack_read`, `slack_unread`, `slack_send`, `slack_mark_read` | deferred | no | yes | `app/tools/social.ts` |
| `finance_list` | deferred | no | yes | `app/tools/financial.ts` |
| `finance_create_entry` | deferred | no | yes | `app/tools/financial.ts` |
| `spending_upsert` | deferred | yes | no | `app/tools/financial.ts` |
| `mcp_<server>_<tool>` | deferred | yes | yes | `app/mcp/manager.ts` (`mcpToolName`) |

- Bot-only (`bot: true`, `agent: false`): `room_search`, `agents_list`, `agent_ask`, `mail_list`, `mail_read`, `mail_send`, `mail_delete`, `slack_search`, `slack_read`, `slack_unread`, `slack_send`, `slack_mark_read`, `finance_list`, `finance_create_entry`. Fourteen tools.
- Agent-only (`agent: true`, `bot: false`): `bash`, `read`, `edit`, `write`, `ask_user`, `spending_upsert`. Six tools.
- Offered directly on `POST /mcp` `tools/list`:
  - agents: `AGENT_TOOLS` (`bash`, `read`, `edit`, `write`, `skill_search`, `skill_read`, `ask_user`, `tool_search`, `tool_call`).
  - bots: `BOT_TOOLS` (`memory_search`, `memory_read`, `memory_edit`, `skill_search`, `skill_read`, `skill_file`, `room_search`, `agents_list`, `agent_ask`, `tool_search`, `tool_call`).
- MCP tools are listed here too, with `load: "deferred"`, `agent: true`, `bot: true`.

## Sync — `routes/sync.ts`
App: `app/sync/engine.ts` (run, merge), `app/sync/github.ts` (gh and GitHub API).

GitHub sync (Settings → Sync). The account is the one the GitHub CLI (`gh`) is signed in to. `gh auth token` is read at each run and never stored.

| method | path | JSON | reads | reply | errors |
| --- | --- | --- | --- | --- | --- |
| GET | /api/sync | no | — | 200 `SyncStatus`: `{accounts: string[], login, repo, running, error, lastSync}` | — |
| PUT | /api/sync/account | yes | `login` string (required) | 200 `SyncStatus` | 415; 409 "Wait for the running sync to finish before switching accounts."; 400 `gh is not signed in to <login>.` |
| POST | /api/sync/run | yes | body ignored | 202 `SyncStatus` with `running: true`. Poll GET until `running` is false | 415; 409 "A sync is already running."; 409 "Sign in with the GitHub CLI first: run `gh auth login` in a terminal." (no account); 409 `gh has no token for <login>. …`; 502 GitHub's message (token refused by `GET /user`), or `Could not reach GitHub: …` |

- `accounts`: every account gh is signed in to.
- `login`: the account chosen with `PUT /api/sync/account` if gh still has it, else gh's active account, else the first. Null when gh has none.
- `repo`: `<login>/dotmip`.
- `error`: why gh has no account (gh missing, or not signed in). Null when there are accounts.
- `lastSync`: `{at, ok, message, pulled, pushed, notes}`. Failures inside the background run are stored here with `ok: false`, not returned by POST. Examples: "… is public. Make it private, then sync again." (repo public), "This database is empty, but the last sync had data. Nothing was changed. Check ~/.mip first." (empty local database), "GitHub changed during the sync. Sync again." (push rejected three times).
- A sync that would delete everything on GitHub because the local database is empty is refused.
- The chosen login is kept in `~/.mip/sync/state.json`. The merge base is kept in `~/.mip/sync/base.json`.

## MCP servers — `routes/mcp-servers.ts`
App: `app/mcp/manager.ts` (connections, status, sign-in), `app/mcp/servers.ts` (add, remove), `app/mcp/config.ts` (mcp.json).

Servers are the entries under `mcpServers` in `~/.mip/data/mcp.json` (`MCP_CONFIG_FILE`). They connect after the server starts listening and again on each reload.

| method | path | JSON | reads | reply | errors |
| --- | --- | --- | --- | --- | --- |
| GET | /api/mcp | no | — | 200 `McpStatus`: `{configFile, servers: McpServerStatus[], problems: {server, error}[]}` | — |
| POST | /api/mcp/reload | yes | — | 200 `McpStatus`, after every server has connected or failed. Old connections are closed first | — |
| POST | /api/mcp | yes | `name` string (required; `^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$`); `transport` `"oauth"`, `"http"` or `"stdio"`; `url` string (oauth, http); `headers` object of strings (http; default `{}`); `command` string (stdio); `args` string[] (stdio; default `[]`); `env` object of strings (stdio; default `{}`) | 201 `McpStatus`, with the new server connected, waiting for sign-in, or failed. Its entry is written to mcp.json first | 400 "A name is required."; 400 `The transport must be "oauth", "http", or "stdio".`; 400 the entry's problem (for example `a stdio server needs a "command"`); 409 `A server called "<name>" is already listed.`; 409 `mcp.json is not valid JSON. Fix it, then try again.` or `mcp.json has no "mcpServers" map. Fix it, then try again.`; 415 |
| DELETE | /api/mcp/:name | no | — | 200 `McpStatus`, after the entry is removed and the others reconnect | 404 `No MCP server called "<name>".`; 409 (mcp.json invalid) |
| POST | /api/mcp/:name/sign-in | yes | — | 200 `McpStatus`. Starts a new OAuth sign-in, so `signInUrl` is a new link | 400 `"<name>" does not sign in with OAuth`; 404 `no MCP server called "<name>"`; 415 |

- `McpServerStatus`: `{name, transport: "stdio" | "http", status, error, oauth, signInUrl, tools: {name, remoteName, description}[]}`.
- `status`: `"connecting"`, `"connected"`, `"error"` or `"sign-in"`. `"sign-in"` means the server waits for the user at `signInUrl`. `signInUrl` is null otherwise.
- `oauth`: true for an http server that has OAuth configuration.
- `problems`: entries of mcp.json that did not load, and tools skipped because their name clashes with another server's tool.
- Tool names: `mcp_<server>_<tool>`. Characters outside `[A-Za-z0-9_-]` become `_`. Cut to 64 characters.
- Startup timeouts: connect and list tools 30 s; one tool call 120 s.
- Only servers with `status: "connected"` provide tools to runs.
- The sign-in redirect is `http://127.0.0.1:3000/api/mcp/oauth/callback` (`OAUTH_REDIRECT_URL`, port from `MIP_PORT`).
- Replies never include environment values, headers, or OAuth tokens.
- Writes to mcp.json keep entries the app cannot load.

## Mail accounts — `routes/mail.ts`
App: `app/mail/mail.ts` (routes' logic), `accounts.ts` (mail.json), `imap.ts` (IMAP), `messages.ts` (shapes).

IMAP accounts are in `~/.mip/data/mail.json` (`MAIL_CONFIG_FILE`), with app passwords. Header cache: `~/.mip/data/mail-cache.json`.

| method | path | JSON | reads | reply | errors |
| --- | --- | --- | --- | --- | --- |
| GET | /api/mail/accounts | no | — | 200 `{accounts: MailAccount[], presets: MailPreset[], problems: {account, error}[]}` | — |
| POST | /api/mail/accounts | yes | `preset` (required: `gmail`, `icloud`, `fastmail`, `outlook`, `other`); `address` (required; trimmed, lowercased); `password` (required; all whitespace removed); `host` (`other` only, required); `port` (`other` only; default 993; 1–65535); `secure` (`other` only; default true; `false` turns it off) | 201 `MailAccount` (no password). Saved only after sign-in succeeds | 400 `The provider must be one of gmail, icloud, fastmail, outlook, other.`; 400 "Enter the email address."; 400 "Enter the app password."; 400 "Enter the IMAP server."; 400 "The port must be a number from 1 to 65535."; 409 `<address> is already added.` (same address and host); 400 `Could not sign in to <host>: <reason>` (any sign-in failure, including an unreachable server); 415 |
| DELETE | /api/mail/accounts/:id | no | — | 200 the GET reply shape, after removal | 404 `No mail account called "<id>".` |
| POST | /api/mail/accounts/:id/test | yes | — | 200 `{messages: number, unseen: number}` | 404 `No mail account called "<id>".`; 502 `Could not read <address>: <reason>`; 415 |
| GET | /api/mail/accounts/:id/messages | no | query `count?` (integer, clamped to 1–200; non-numeric or 0 gives 25) | 200 `{mailbox, messages: MailHeader[], complete}`, newest first | 404 `No mail account called "<id>".`; 502 `Could not read <address>: <reason>` |
| GET | /api/mail/accounts/:id/messages/:uid | no | path `uid` (positive integer) | 200 `MailMessage` | 400 "The message id must be a positive whole number."; 404 `No message <uid> in <address>.`; 404 no such account; 502 as above |

- `MailAccount`: `{id, label, host, port, secure, user, mailbox, watch: {mode, pollSeconds}, maxBytes}`. Accounts added here get `label` = address, `mailbox` `INBOX`, `watch` `{mode: "auto", pollSeconds: 60}`, `maxBytes` 20000. `id` is made from the address (`idFor`).
- `MailPreset`: `{id, label, host, port, secure, help, passwordUrl}`.
- `MailHeader`: `{uid, from, subject, date, seen}`. `from` is `Name <address>` or the bare address. `date` is an ISO string or null.
- `MailMessage`: `MailHeader` plus `{to, text, truncated}`. `text` is cut to `maxBytes` in UTF-8, and `truncated` says so. A body with only HTML is converted to text.
- `complete` is true when the mailbox has no older messages. Without `count`, the list has at least 25 (`LIST_LIMIT`) or every cached header.
- Reads never mark a message as read. Bodies are fetched with `BODY.PEEK`.
- Read failures are 502 with the server's reason. The message is labelled with the account, never the password.

## Slack — `routes/slack.ts`
App: `app/slack/slack.ts` (state), `connect.ts` (sign-in), `read.ts` (reads), `post.ts` (send), `api.ts` (Slack calls and errors), `config.ts` (slack.json), `cache.ts` (cache).

The Slack app and connected users are in `~/.mip/data/slack.json` (`SLACK_CONFIG_FILE`). Each account holds a user token (`xoxp-`). Cache: `~/.mip/data/slack-cache.json`. Reads use the connected user's token, so they show what that user sees.

| method | path | JSON | reads | reply | errors |
| --- | --- | --- | --- | --- | --- |
| GET | /api/slack | no | — | 200 `SlackState`: `{app: {clientId} \| null, redirectUri, scopes, manifest, accounts: SlackAccount[], problems: {account, error}[]}` | — |
| PUT | /api/slack/app | yes | `clientId` string (required; `^\d+\.\d+$`); `clientSecret` string (required) | 200 `SlackState` | 400 "The client ID looks like 1234567890.1234567890. Copy it from the Slack app's Basic Information page."; 400 "Enter the client secret from the same page."; 415 |
| POST | /api/slack/connect | yes | — | 200 `{url}`: the Slack authorize URL. Its `state` is random, single use, and valid 10 minutes | 400 "Save the Slack app's client ID and secret first."; 415 |
| POST | /api/slack/token | yes | `token` string (required; must start with `xoxp-`) | 201 `SlackAccount` | 400 "Paste a Slack user token, which starts with xoxp-."; 401 "Slack no longer accepts this connection. …" (Slack refuses the token); 502 `Could not reach Slack: …` or `Slack refused the request: <code>.`; 415 |
| DELETE | /api/slack/accounts/:id | no | — | 200 `SlackState` | 404 "No Slack account with that id." |
| GET | /api/slack/accounts/:id/conversations | no | query `refresh=1` forces a Slack call; any other value uses the cache | 200 `SlackConversation[]` in order: `channel`, `private`, `group`, `dm`. Cached 10 minutes | 404 `No Slack account called "<id>".`; 401, 403, 429, 502 (see Slack call errors below) |
| GET | /api/slack/accounts/:id/unread | no | query `refresh=1` | 200 `{<conversationId>: number}`. Counts messages after the user's last read, not sent by the user. Covers the 40 most recent conversations, reading up to 100 messages each. A conversation that fails counts 0. Cached 2 minutes | 404 `No Slack account called "<id>".` |
| GET | /api/slack/accounts/:id/conversations/:channel/messages | no | path `channel` (`^[A-Z0-9]{1,32}$`); query `refresh=1` | 200 `SlackMessage[]`: newest 30, newest first, thread replies left out. Cached 2 minutes | 404 `No Slack account called "<id>".`; 400 "That is not a conversation id."; 404 "This account cannot read that conversation."; 401, 403, 429, 502 |
| GET | /api/slack/accounts/:id/conversations/:channel/threads/:ts | no | path `ts` (`^\d+\.\d+$`); query `refresh=1` | 200 `SlackMessage[]`: the parent, then up to 100 replies, oldest first. Cached 2 minutes | 404 no such account; 400 "That is not a conversation id." or "That is not a thread."; 404 "This account cannot read that conversation."; 401, 403, 429, 502 |
| POST | /api/slack/accounts/:id/conversations/:channel/messages | yes | `text` string (trimmed, required, max 4000); `threadTs?` string (`^\d+\.\d+$`) | 201 `{ts}`. Posted as the user (`chat.postMessage`). Cached reads of that channel are dropped | 404 no such account; 400 "That is not a conversation id."; 400 "Write a message first."; 400 "A message can be 4000 characters at most."; 400 "That is not a thread."; 404 "This account cannot read that conversation."; 401, 403, 429, 502; 415 |

- `SlackState.scopes`: the user scopes the Slack app must list (`SLACK_USER_SCOPES`). `SlackState.manifest`: an app manifest JSON for Slack's "From a manifest" page, with the same redirect and scopes. Neither the client secret nor any token is returned.
- `SlackAccount`: `{id, teamId, teamName, userId, userName}`. `id` is `<teamId>.<userId>`.
- `SlackConversation`: `{id, name, kind}`, where `kind` is `"channel"`, `"private"`, `"group"` (multi-party DM) or `"dm"`.
- `SlackMessage`: `{ts, time, user, author, text, replies, threadTs?}`. `time` is ISO. `user` is the Slack id, `""` for bots. `text` has `<@U…>` mentions replaced with `@name`. `replies` counts the thread.
- Slack call errors (`slackCall`, `app/slack/api.ts`):
  - `invalid_auth`, `not_authed`, `token_revoked`, `token_expired`, `account_inactive` → 401.
  - `missing_scope` → 403.
  - `not_in_channel`, `channel_not_found` → 404 "This account cannot read that conversation."
  - `ratelimited` or HTTP 429 → 429.
  - Anything else → 502.
- DELETE removes the account and its cache entries. Nothing is revoked in Slack.

## Spending — `routes/spending.ts`
App: `app/spending.ts`. Storage: `storage/spending.ts`.

| method | path | JSON | reads | reply | errors |
| --- | --- | --- | --- | --- | --- |
| GET | /api/spending | no | — | 200 `{entries: SpendingEntry[]}`, newest first | — |
| POST | /api/spending | yes | `kind` `"income"` or `"expense"` (required); `category` string (trimmed, required, max 40; takes the spelling of an existing category that matches case-insensitively); `amount` number (`Number()`; finite and above 0); `description?` string (trimmed, max 200); `date?` string as `YYYY-MM-DD`, a real day (default: today for a new entry, the entry's own day when an edit gives none); `id?` string (trimmed, max 64; an existing id is replaced and keeps `createdAt`) | 201 `SpendingEntry`, also when it replaces an entry | 400 "kind must be income or expense"; 400 "category is required"; 400 "category must be 40 characters or fewer"; 400 "amount must be a number above 0"; 400 "description must be 200 characters or fewer"; 400 "date must be a real day as YYYY-MM-DD"; 400 "id must be 64 characters or fewer" |

- `SpendingEntry`: `{id, kind, category, amount, description, entryDate, createdAt}`. `description` is `""` when none was given. `entryDate` is the day the entry is for, `YYYY-MM-DD`. `createdAt` is when it was saved.

## Tool endpoint — `http/server.ts` and `http/mcp.ts`
MCP over HTTP (JSON-RPC 2.0). The Claude CLI calls it with `toolServer: {url: http://127.0.0.1:3000/mcp, token}`, set in `app/runs.ts` and `app/room/room.ts`.

| method | path | auth | body | reply | notes |
| --- | --- | --- | --- | --- | --- |
| POST | /mcp | `Authorization: Bearer <run token>` | JSON-RPC request, or a notification (no `id`) | HTTP 200 `{jsonrpc: "2.0", id, result}` or `{jsonrpc, id, error: {code, message}}`. Notification: 202, empty body. No live token: 401 `{error: "unauthorized"}` | JSON-RPC errors are always HTTP 200. Malformed JSON gives 500 before the token check, because `server.ts` reads the body first |

Methods:
- `initialize` → `{protocolVersion: params.protocolVersion ?? "2025-03-26", capabilities: {tools: {}}, serverInfo: {name: "mip", version: "0.1.0"}}`.
- `tools/list` → `{tools: [{name, description, inputSchema}]}` for the run's offered tools only (`RunContext.tools`). Deferred tools are not listed.
- `tools/call` (`params.name`, `params.arguments`) → `{content: [{type: "text", text}], isError}`. An unknown name, including a deferred one, → error `-32602` `unknown tool: <name>`. Deferred tools run through `tool_call`.
- Any other method → error `-32601` `method not found: <method>`.

Tokens:
- `registerRun` (`app/tools/index.ts`) gives each run a UUID token. It maps to a `RunContext`.
- The token works only until the run ends (`releaseRun` in `finally`).
- Agent runs: `workspace`, `agentId`, `tools` = `AGENT_TOOLS`, `deferred`.
- Bot turns: `botId`, `roomId`, `tools` = `BOT_TOOLS`, `deferred`. A bot turn has no workspace, so `workspace` is `""`.
- A tool error is returned as `isError: true` text (`guarded` in `app/tools/index.ts`).

## OAuth and Slack callback pages — `http/mcp-oauth.ts`, `http/slack-oauth.ts`, `http/page.ts`

The browser lands on these after a sign-in. Both paths are matched in `http/server.ts` before the router. They are not in `routes/`. Other methods on these paths get the router's JSON 404. The reply is an HTML page from `page(res, status, title, message)`. Title and message are HTML-escaped. `Cache-Control: no-store`. Status is the `AppError`'s status, or 500 for any other error.

| path | query read | success | failure |
| --- | --- | --- | --- |
| GET /api/mcp/oauth/callback | `code`, `state`, `iss?`; or `error` / `error_description` | 200 page "Signed in": `<name> is signed in. You can close this tab and go back to mip.` (`completeSignIn`) | 400 "Sign-in failed": `The server did not allow the sign-in: <reason>` when the query has an error; 400 "The sign-in response has no code."; 400 "This sign-in is no longer waiting. Start it again from the MCP card." (unknown or used state); 502 `The sign-in did not finish: <reason>`; 500 otherwise |
| GET /api/slack/oauth/callback | `code`, `state`; or `error` / `error_description` | 200 page "Connected": `<userName> is connected to <teamName>. …` | 400 "Connection failed": `Slack did not allow the connection: <reason>`; 400 "Slack's response has no code."; 400 "This sign-in expired or was already used. Start it again from the Slack card." (state unknown, used, or older than 10 minutes); 400 "The Slack app's client ID and secret are no longer saved."; 502 "Slack did not return a user token. Check the app's user scopes in Slack, then connect again."; Slack call errors keep their own status (see Slack call errors) |

- Slack redirect URI: `slackRedirectUri`, `http://127.0.0.1:3000/api/slack/oauth/callback` unless `MIP_SLACK_REDIRECT_URI` is set. That value must be the URL listed in the Slack app.
- Slack sign-in exchanges the code with `oauth.v2.access` and keeps only the user token (`authed_user.access_token`).

## Static
Served from `dist/frontend` (`WEB_DIR` in `http/static.ts`).

| method | path | notes |
| --- | --- | --- |
| GET | any path not starting with `/api/` | `/` serves `index.html`. A matching file is sent with 200, `Cache-Control: no-store`, and a `Content-Type` from its extension: `.html`, `.js`, `.css`, `.svg`, `.png`, `.ico`; any other extension is `application/octet-stream`. No file, or a directory → falls through to the router, which returns 404 JSON |

- The resolved path must stay inside `dist/frontend/`. Otherwise the request falls through.
- The path is not percent-decoded before the file lookup.
