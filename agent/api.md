# HTTP API

All bodies are JSON. Errors are `{"error": "<message>"}`. Route handlers live in `src/backend/http/routes/<domain>.ts`, listed in `routes/index.ts`. Status: `200` ok, `201` created, `202` accepted (work continues in the background).

Common errors: `400` bad input, `404` not found (message `no such …`), `409` conflict (busy, still running, in use, duplicate), `500` unexpected. Unknown path or method: `404 {"error":"not found"}`. Non-API GET: static file from `dist/frontend`, else 404.

Matching: path segments are decoded before matching; a trailing slash is tolerated.

## Agents (agents) — `routes/agents.ts`
| method | path | status | body | errors |
| --- | --- | --- | --- | --- |
| GET | /api/agents | 200 | `{agents: Agent[]}` | |
| POST | /api/agents | 201 | `Agent` (body `{providerId, personaId}`) | 400 unknown provider/persona |
| GET | /api/agents/:agentId | 200 | `{agent, messages, activeRunId?}` | 404 no such agent |
| PATCH | /api/agents/:agentId | 200 | `Agent` (body `{title?, openToBots?, model?, thinking?}`; `""` clears model/thinking) | 400 empty title, openToBots not true or false, unknown model, thinking not accepted by model; 404 |
| DELETE | /api/agents/:agentId | 200 | `{ok:true}` | 404; 409 run active |

## Runs — `routes/runs.ts`
| method | path | status | body | errors |
| --- | --- | --- | --- | --- |
| POST | /api/run | 202 | `{runId}` (body `{agentId, prompt}`) | 404 no such agent; 400 prompt required; 409 agent still running |
| GET | /api/runs/:runId/events?after=N | 200 | `{status: "running"|"done"|"error", events: [{seq, event}]}` | 404 no such run |

`event` is an `AgentEvent` (`adapters/contract.ts`): `text`, `tool_call`, `tool_result`, `error`, `done`.

## Personas — `routes/personas.ts`
| method | path | status | body | errors |
| --- | --- | --- | --- | --- |
| GET | /api/personas | 200 | `{personas: Persona[]}` | |
| POST | /api/personas | 201 | `Persona` (body `{name, systemPrompt}`) | 400 name / prompt required |
| PUT | /api/personas/:personaId | 200 | `Persona` | 400; 404 |
| DELETE | /api/personas/:personaId | 200 | `{ok:true}` | 400 built-in default or current default; 409 agents use it; 404 |
| POST | /api/personas/:personaId/default | 200 | `{ok:true}` | 404 |

## Bots — `routes/bots.ts`
| method | path | status | body | errors |
| --- | --- | --- | --- | --- |
| GET | /api/bots | 200 | `{bots: Bot[]}` | |
| POST | /api/bots | 201 | `Bot` (body `{name, persona, providerId, model?, thinking?, color?}`) | 400 name rule / persona / provider / model / thinking / color; 409 name taken |
| PUT | /api/bots/:botId | 200 | `Bot` | same; 404 |
| DELETE | /api/bots/:botId | 200 | `{ok:true}` | 404 |

`Bot` is `{id, name, persona, providerId, model, thinking, color}`. `color` is one of `frost`, `orange`, `violet`, `green`, `yellow`, `red`, `teal`, `blue`. A new bot without a color takes the first one no bot uses. An edit without a color keeps the bot's color.

Name rule: starts with a letter, 2–24 letters, digits, `-` or `_`; unique, case-insensitive.

## Room — `routes/room.ts`
| method | path | status | body | errors |
| --- | --- | --- | --- | --- |
| GET | /api/rooms | 200 | `{rooms: Room[]}` | |
| POST | /api/rooms | 201 | the new `Room` (body `{name, botIds?}`) | 400 empty or over 40 characters, or a bot that does not exist; 409 name taken |
| PUT | /api/rooms/:id | 200 | the `Room` (body `{name?, botIds?}`; a field left out keeps its value) | 400 as above; 404 no such room; 409 name taken |
| DELETE | /api/rooms/:id | 200 | `{ok: true}`. The room's messages go with it | 404 no such room; 409 the last room |
| GET | /api/room?room=ID&after=N | 200 | `{messages: RoomMessage[], busy, speaking}` for that room | 404 no such room |
| POST | /api/room/messages | 202 | the saved `RoomMessage` (body `{room, text}`) | 400 empty or over 4000 characters; 404 no such room; 409 that room is busy |

`Room`: `{id, name, botIds, createdAt, updatedAt}`. `RoomMessage`: `{id, roomId, kind: "user"|"bot"|"system", botId, authorName, text, calls, createdAt}`. `calls` is a bot reply's tool calls, each `{name, input, output, isError}`, and is empty for other messages. Without `after`, the latest 100 are returned. With `after`, up to 200 newer ones.

## Repositories — `routes/repos.ts`
| method | path | status | body | errors |
| --- | --- | --- | --- | --- |
| GET | /api/repos | 200 | `{repos: RepoCard[]}` (Repo + `branch`, `copies: [{agentId,title}]`) | |
| POST | /api/repos | 202 | `Repo` with `status: "cloning"` (body `{url}`) | 400 not a clone link / bad folder name; 409 name already here |
| POST | /api/repos/pull | 200 | `{results: [{id,name,ok,message}]}` | |
| DELETE | /api/repos/:repoId | 200 | `{ok:true}` | 404; 409 still cloning |
| POST | /api/repos/:repoId/copies | 201 | `{ok:true}` (body `{agentId}`) | 404 repo or agent; 409 not ready or agent already has it; 500 clone failed |

## Memory — `routes/memory.ts`
| method | path | status | body | errors |
| --- | --- | --- | --- | --- |
| GET | /api/graph | 200 | `{nodes: [{id,title,missing,degree}], edges: [{source,target}]}` | |
| GET | /api/memory?q= | 200 | `{notes: NoteItem[]}` (all notes, or search results with `snippet`) | |
| POST | /api/memory | 200 | `{title, links, tags}` (body `{title, body}`) — note: 200, not 201 | 400 title required |
| GET | /api/memory/:title | 200 | `{title, body, links, backlinks, tags}` | 404 no such note |
| DELETE | /api/memory/:title | 200 | `{ok:true}` | 404 no such note |

## Providers — `routes/providers.ts`
| method | path | status | body | errors |
| --- | --- | --- | --- | --- |
| GET | /api/providers | 200 | `{providers: [{id,name,capabilities,models,targets,error?}]}`; each target has `auth` and `progress` | |
| POST | /api/providers/:providerId/targets/:targetId/sign-in | 202 | `{started:true}` (body `{method}`) | 404 unknown provider; 500 unknown target or method (adapters throw plain `Error`, so these are not 400) |
| POST | /api/providers/:providerId/targets/:targetId/answer | 200 | `{ok:true}` (body `{answer}`) | 404 |
| POST | /api/providers/:providerId/targets/:targetId/sign-out | 200 | `{ok:true}` | 404 |
| POST | /api/providers/:providerId/targets/:targetId/<other> | 404 | `{error:"not found"}` | |

## System — `routes/system.ts`
Both need `Content-Type: application/json`, or they return 415. A page on another site can't send that without a preflight, which this server doesn't answer.

| method | path | status | body | notes |
| --- | --- | --- | --- | --- |
| POST | /api/system/update | 200 | `{output}` (git's output, from `app/system.ts` `pullLatest`) | `git pull --ff-only` in the checkout. Non-fast-forward or git errors come back as `error`. |
| POST | /api/system/restart | 202 | `{restarting: true}` | The server exits about 300 ms later. A detached shell waits, runs `npm install` and `npm run build` (output to `MIP_HOME/restart.log`), then starts the server again. |

## Skills — `routes/skills.ts`
Installed skills are folders under `MIP_HOME/skills`. A skill is added in one of two ways. Create writes it from a form (name, description, instructions). Import stages a folder, checks it, and installs it only when it is confirmed. Writes need `Content-Type: application/json`, or they return 415.

| method | path | status | body | errors |
| --- | --- | --- | --- | --- |
| GET | /api/skills | 200 | `{skills: SkillSummary[], problems: {folder, error}[]}` | |
| GET | /api/skills/:name | 200 | `SkillDetail`: `{name, description, body, files}` | 404 no such skill; 409 the skill is not valid |
| DELETE | /api/skills/:name | 200 | `{ok:true}` | 404 |
| POST | /api/skills | 201 | `SkillDetail` (body `{name, description, body}`). Never replaces an installed skill | 400 bad name, missing or multi-line description, empty instructions, too long; 409 a skill with that name is installed; 415 |
| POST | /api/skills/imports | 201 | `{id, name, description, files, source, skillMd, replaces}` (body `{path}`, a full folder path) | 400 not a folder, no SKILL.md, a symbolic link, a non-text file, too large, bad header; 415 |
| POST | /api/skills/imports/:importId/confirm | 200 | `SkillDetail`. Replaces a skill with the same name | 404 no such import; 415 |
| DELETE | /api/skills/imports/:importId | 200 | `{ok:true}`. Drops the staged import | |

## Tools — `routes/tools.ts`
`GET /api/tools` returns `{tools}`: the tool registry, read only. Each tool is `{name, description, guide, inputSchema, load, agent, bot}`. `guide` is one paragraph on when and how to use the tool. `load` is `basic` (always offered), `deferred` (found with `tool_search`, run with `tool_call`), or `search` (the two tools that do the finding). `agent` and `bot` say whether that kind of run may use the tool. Agents can use every tool but the bot-only ones: `room_search`, `agents_list`, and `agent_ask`. Bots are offered the memory tools, the skill tools, `room_search`, `agents_list`, `agent_ask`, and the two search tools directly. A tool's `load` is how an agent gets it, so `memory_search` is `deferred` for agents and `basic` for bots.

## Sync — `routes/sync.ts`
GitHub sync (Settings → Sync). The account is the one the GitHub CLI (`gh`) is signed in to on this machine. The run needs `Content-Type: application/json`, or it returns 415. The run is in the background: poll `GET /api/sync` until `running` is false.

| method | path | status | body | errors |
| --- | --- | --- | --- | --- |
| GET | /api/sync | 200 | `SyncStatus`: `{accounts, login, repo, running, error, lastSync}` | |
| PUT | /api/sync/account | 200 | `SyncStatus` (body `{login}`) | 400 gh is not signed in to that account; 409 a sync is running; 415 not JSON |
| POST | /api/sync/run | 202 | `SyncStatus` with `running: true` | 409 a sync is running, or gh is signed out; 502 GitHub unreachable; 415 not JSON |

`accounts` lists every account gh is signed in to, and `login` is the one sync uses (null when there is none). `error` says why when gh is missing or signed out. The chosen account is kept in `sync/state.json`. `lastSync` is `{at, ok, message, pulled, pushed, notes}`. A failed run has `ok: false` and the reason in `message` (public repo, empty local database, GitHub changed during the run).

## MCP servers — `routes/mcp-servers.ts`
The servers listed in `data/mcp.json`. Each one shows its state and tools. Environment values, headers, and OAuth tokens are never returned.

| method | path | status | body | errors |
| --- | --- | --- | --- | --- |
| GET | /api/mcp | 200 | `{configFile, servers: {name, transport, status, error, tools: {name, remoteName, description}[]}[], problems: {server, error}[]}`. `status` is connecting, connected, sign-in, or error. `sign-in` means the server waits for the user to sign in at `signInUrl`. Each server also says whether it uses OAuth (`oauth`) | |
| POST | /api/mcp/reload | 200 | the same shape, after every server has connected or failed. Closes the old connections first | |
| POST | /api/mcp | 201 | the same shape, with the new server connected, waiting for sign-in, or failed. Body `{name, transport: "oauth" \| "http" \| "stdio", url?, headers?, command?, args?, env?}`. Writes its entry to mcp.json, then connects again | 400 a name, transport, url, or command the file would not load; 409 the name is listed already; 415 not JSON |
| DELETE | /api/mcp/:name | 200 | the same shape, after the server is removed from mcp.json and the others have connected again | 404 no such server |
| POST | /api/mcp/:name/sign-in | 200 | the same shape. Starts the sign-in again, so `signInUrl` is a new link | 400 the server does not sign in with OAuth; 404 no such server; 415 not JSON |
| GET | /api/mcp/oauth/callback | 200 HTML | a page, not JSON. The authorization server redirects the browser here with `code` and `state`. The sign-in finishes, and the server connects. The page says so | 400 page when the server refused, or no sign-in is waiting for that state |

## Mail accounts — `routes/mail.ts`
The IMAP accounts in `data/mail.json`. Passwords are never returned. Reading connects to the account's server, and a read never marks a message as read.

| method | path | status | body | errors |
| --- | --- | --- | --- | --- |
| GET | /api/mail/accounts | 200 | `{accounts: {id, label, host, port, secure, user, mailbox, watch: {mode, pollSeconds}, maxBytes}[], presets: {id, label, host, port, secure, help, passwordUrl}[], problems: {account, error}[]}` | |
| POST | /api/mail/accounts | 201 | the new account, without its password. Body `{preset: "gmail" \| "icloud" \| "fastmail" \| "outlook" \| "other", address, password, host?, port?, secure?}`. Signs in first, and a refused sign-in saves nothing | 400 a missing or bad field, or the server refused the sign-in (the reason is in the message); 409 the address is already added on that server; 415 not JSON |
| DELETE | /api/mail/accounts/:id | 200 | the same shape as the GET, after the account is removed | 404 no such account |
| POST | /api/mail/accounts/:id/test | 200 | `{messages, unseen}` | 404 no such account; 415 not JSON; 502 the server could not be reached or refused the sign-in |
| GET | /api/mail/accounts/:id/messages | 200 | `{mailbox, messages: {uid, from, subject, date, seen}[], complete}`, the newest messages, newest first. `count` is an optional query (at most 200). Without it, the list is everything kept, and at least 25. `complete` is true when there are no older messages. The card's Load more asks for one page more | 404 no such account; 502 the server could not be read |
| GET | /api/mail/accounts/:id/messages/:uid | 200 | `{uid, from, subject, date, seen, to, text, truncated}`. The body is fetched with BODY.PEEK, so the message stays unread | 400 the uid is not a positive whole number; 404 no such message; 502 the server could not be read |

## Slack — `routes/slack.ts`
The Slack app and the connected users, in `data/slack.json`. Tokens and the client secret are never returned. Reads use the connected user's token, so they show what that user can see.

| method | path | status | body / returns | errors |
| --- | --- | --- | --- | --- |
| GET | /api/slack | 200 | `{app: {clientId} \| null, redirectUri, scopes: string[], accounts: {id, teamId, teamName, userId, userName}[], problems: {account, error}[]}`. `scopes` is the list the Slack app must grant under User Token Scopes | |
| PUT | /api/slack/app | 200 | the same shape. Body `{clientId, clientSecret}`; the client ID is `digits.digits` | 400 a bad client ID or a missing secret; 415 not JSON |
| POST | /api/slack/connect | 200 | `{url}`, the Slack page to open. Its state is one-time and lasts ten minutes | 400 no app saved; 415 not JSON |
| GET | /api/slack/oauth/callback | HTML | Slack's redirect lands here (not under `/api` JSON). Exchanges the code for the user's token and saves the account | 400 a refused sign-in, or an unknown or used state |
| POST | /api/slack/token | 201 | the account, without its token. Body `{token}`, which must start with `xoxp-` | 400 not a user token; 401 Slack refuses it; 415 not JSON |
| DELETE | /api/slack/accounts/:id | 200 | the same shape as GET | 404 no such account |
| GET | /api/slack/accounts/:id/conversations | 200 | `{id, name, kind: "channel" \| "private" \| "group" \| "dm"}[]`, channels first. Served from the cache unless `?refresh=1` | 404 no such account; 401 the connection is no longer accepted; 403 a missing scope; 429 rate limited |
| GET | /api/slack/accounts/:id/conversations/:channel/messages | 200 | `{ts, time, user, author, text, replies, threadTs?}[]`, the newest 30, newest first, replies left out. Served from the cache for two minutes unless `?refresh=1` | 400 not a conversation id; 404 no such account or no access to the conversation; 429 rate limited |
| POST | /api/slack/accounts/:id/conversations/:channel/messages | 201 | `{ts}`. Body `{text, threadTs?}`. Sends as the user (`chat.postMessage`); the card sends only when the user presses Send. Max 4,000 characters | 400 empty, too long, or a bad channel or thread; 404 no such account; 415 not JSON; 401 or 403 Slack refuses it |
| GET | /api/slack/accounts/:id/conversations/:channel/threads/:ts | 200 | `{ts, time, user, author, text, replies, threadTs?}[]`, the parent then its replies, oldest first. Served from the cache for two minutes unless `?refresh=1` | 400 not a conversation or thread id; 404 no such account |

## Spending — `routes/spending.ts`

| Method | Path | Success | Body | Errors |
|---|---|---|---|---|
| GET | /api/spending | 200 | `{entries: {id, kind: "income" \| "expense", category, amount, createdAt}[]}`, newest first | |
| POST | /api/spending | 201 | Body `{kind, category, amount}`. A category typed in another case keeps the existing spelling | 400 bad kind, empty or long category, or amount not above 0 |

## Tool endpoint — `http/server.ts` and `http/mcp.ts`
| method | path | auth | body | notes |
| --- | --- | --- | --- | --- |
| POST | /mcp | `Authorization: Bearer <run token>` | JSON-RPC 2.0: `initialize`, `tools/list`, `tools/call`, notifications (no id → 202) | 401 without a live token. JSON-RPC errors are returned with HTTP 200. |

## Static
| method | path | notes |
| --- | --- | --- |
| GET | any path not starting with /api/ | file from `dist/frontend` (`/` → `index.html`). Missing → falls through to the router (404). |
