# Flows

Each flow gives its entry point, its steps in order with the function and file that do each step, what it writes, what it returns or emits, and what fails. Routes and status codes are in `api.md`. Tables are in `data-model.md`. Module roles are in `backend.md` and `frontend.md`.

Paths are under `src/` unless shown otherwise. Data paths are under `MIP_HOME` (default `~/.mip`, set by `MIP_HOME`): `data/` holds `mip.db`, `mcp.json`, `mail.json`, `mail-cache.json`, `slack.json`, `slack-cache.json`, `device-id`, and `pi/`. Directly under `MIP_HOME`: `sessions/claude`, `sessions/pi`, `workspaces/<agentId>`, `repos`, `skills`, `sync`, and `restart.log`.

## 1. Server start
Entry: `node dist/backend/http/server.js`. `npm start` builds first. `npm run serve` does not.

Module code runs in import order, before the body of `backend/http/server.ts`:
1. `backend/storage/db.ts`, the first storage module imported:
   - `ensureMipDirs()` (`storage/paths.ts`) creates `data/`, `repos/`, `data/pi/`, `sessions/claude/`, `sessions/pi/`.
   - Opens `data/mip.db` and sets mode 600.
   - Renames old tables and columns (`sessions` to `agents`, `session_id` to `agent_id`).
   - Creates tables (`CREATE TABLE IF NOT EXISTS`), drops `skill_enablements` and `bot_skill_enablements`, adds missing columns, backfills change times and bot colors.
   - Seeds room `main` (name "Main") with every existing bot, only when `rooms` is empty.
   - Startup recovery: `runs` with status `running` become `error`. `repos` with status `cloning` become `error` with "interrupted by a server restart".
2. `app/personas.ts`: a stored `default` persona whose prompt hashes to the previous built-in text is replaced with the current text. An unedited copy only. Inserts `default` (name "Default") when missing. Marks one persona default if none is.
3. `app/providers.ts`: builds `PiProvider` (sets `process.env.PI_CODING_AGENT_DIR` to `data/pi`) and `ClaudeCliProvider` (config dir `sessions/claude`). Provider list: `claude-cli`, then `pi`.

Then `backend/http/server.ts` runs:
4. `importLegacyPiAuth()` (`app/pi/store.ts`), once. Copies credentials from `~/.pi/agent/auth.json` when `pi_credentials` is empty, then sets `pi_state` key `pi-auth-imported`. A failure is logged and start continues.
5. `createServer(...).listen(PORT, HOST)`. `HOST` is `127.0.0.1`. `PORT` is `MIP_PORT`, default 3000 (`app/config.ts`). Logs `mip dashboard: http://127.0.0.1:3000`.
6. `startMcpServers()` (`app/mcp/manager.ts`) runs without `await`. See flow 22.

Gotchas:
- A database that cannot be opened throws at import. The process exits before `listen`.
- Every data path follows `MIP_HOME`. Nothing else reads it.

## 2. Request handling
Entry: every request reaches `handle` (`backend/http/server.ts`). Order:
1. `GET` whose path does not start with `/api/`: `serveStatic` (`http/static.ts`) serves a file from `dist/frontend`. `/` is `index.html`. A missing file, or a path outside the folder, falls through.
2. `POST /mcp`: `handleMcp` (`http/mcp.ts`). See flow 6.
3. `GET /api/mcp/oauth/callback` (`OAUTH_CALLBACK_PATH`): `handleOAuthCallback` (`http/mcp-oauth.ts`). See flow 22.
4. `GET /api/slack/oauth/callback` (`SLACK_CALLBACK_PATH`): `handleSlackCallback` (`http/slack-oauth.ts`). See flow 25.
5. Everything else: `matchRoute` (`http/router.ts`) over `routes` (`http/routes/index.ts`). A match needs the same method and segment count. `:name` segments capture decoded values. First match wins. No match gives `404 {"error":"not found"}`.

Replies:
- Handlers return `Reply {status, body}` (`http/respond.ts`): `ok` 200, `created` 201, `accepted` 202, `ack` (200 `{ok:true}`), `notFound`.
- `sendJson` sets `Content-Type: application/json` and `Cache-Control: no-store`.
- A thrown `AppError` (`app/errors.ts`) gives its status and `{error}`. Any other error gives 500 and `{error}`. A body that is not valid JSON gives 500.
- `requireJson(req)` throws `AppError(415)` unless `Content-Type` contains `application/json`. `server.ts` calls it for every `POST`, `PUT`, and `PATCH` to the API, after step 4 and before step 5. `/mcp` (step 2) and the two callbacks are not checked, and no route calls it.
- Host check: before step 1, `server.ts` answers 403 unless the `Host` header names `localhost`, `127.0.0.1`, or `[::1]`, with or without a port. This blocks DNS rebinding.
- No `Origin` check exists under `http/`. Access control is the loopback bind, the Host check, and the JSON check on writes.

## 3. Send an agent message (run)
Server, entry `POST /api/run` `{agentId, prompt}` (`http/routes/runs.ts`):
1. `startRun` (`app/runs.ts`) checks, in order: agent exists (404 `no such agent`); trimmed prompt is not empty (400 `prompt is required`); no run is active for the agent (409 `this agent is still running`, from `activeRunForAgent`).
2. Writes: `createRun` (`storage/runs.ts`, status `running`), then `addMessage` with role `user` (`storage/agents.ts`), then `workspaceFor` creates `workspaces/<agentId>/`.
3. `agentDeferredTools()` (`app/tools/index.ts`) returns `AGENT_DEFERRED` plus the connected MCP tools. `registerRun({workspace, agentId, tools: AGENT_TOOLS, deferred})` returns a token. The token is kept in the `runs` map in `tools/index.ts`.
4. `execute` starts in the background. Its rejection is logged as `run <id> failed to save`. `startRun` returns the run id. The route replies 202 `{runId}`.
5. `execute` calls `provider.run` with:
   - `prompt`: `withSkillCommand(prompt)` (`app/skills/registry.ts`).
   - `systemPrompt`: the parts `personaPrompt(personaId)`, `repoNote(workspace)`, `toolGuidesPrompt(AGENT_TOOLS)`, `recallFor(prompt)`, joined by blank lines.
   - `tools: AGENT_TOOLS`, `deferredTools`, `workspace`, `agentId`.
   - `toolServer`: `{url: http://127.0.0.1:3000/mcp, token}`.
   - `model`, `thinking`, and `sessionId` (the agent's saved `providerSessionId`).
6. Each event is saved with `appendRunEvent` (`run_events`, `seq` 1, 2, ...). `text` is appended to the reply. `tool_call` adds a name and a `ToolCallLog` entry. `tool_result` attaches output by call id. `error` sets the error. `done` supplies `sessionId`. A throw from `provider.run` is saved as an `error` event.
7. `finally`: `releaseRun(token)`. Then `addMessage` with role `assistant`, text, tool names, calls, error, and `ask: takePendingAsk(agentId)`. Then `saveProviderSession`, which keeps the old id when none came back, and always bumps `updated_at`. Then `setRunStatus` (`done` or `error`).
8. `onFinish({text, error})` runs in a `finally`, so a bot waiting on this run is released even when saving failed.

Reads:
- `GET /api/runs/:runId/events?after=<seq>` (`readRun`): `{status, events: [{seq, event}]}`, in order after `seq`. 404 `no such run`.
- `GET /api/agents/:agentId` returns `activeRunId` while the run is `running`.

Client (`features/agent/useTranscript.ts`):
1. `send` posts `/api/run`, appends the user message, then calls `follow`. A failed start appends an assistant message holding the error.
2. `follow` appends an empty assistant message. It polls `GET /api/runs/:id/events?after=<last seq>` every 600 ms (`POLL_MS`) until `status` is not `running`. `applyEvent` appends text, tool names and call entries, and output by call id.
3. On finish, `load` refetches `GET /api/agents/:id`, so the saved messages replace the streamed ones. Then `onRunSaved` refreshes the agent list.
4. `load` resumes a run when `activeRunId` is set, calling `follow` from `after=0`. A run continues after the page closes.

Failures:
- Provider failure: an `error` event, then an assistant message with `error` set.
- A failure in `addMessage`, `saveProviderSession`, or `setRunStatus` skips `setRunStatus`. The run stays `running`, so the agent answers 409 until the next server start. Startup recovery then marks it `error`.

Gotchas:
- One active run per agent. No route cancels a run.
- Agent runs can reach `bash` in their workspace (flow 21).

## 4. Claude provider run (`adapters/claude-cli.ts`)
Entry: `ClaudeCliProvider.run(options)`. Binary: `CLAUDE_BIN`, else `claude` on `PATH`.

Argument order:
1. `-p <prompt> --output-format stream-json --verbose --include-partial-messages --disable-slash-commands`.
2. If `toolServer` is set and `tools` is not empty: `--mcp-config <json>`, `--strict-mcp-config`, `--tools ""`, `--allowedTools mcp__mip__<name>` for each tool. The JSON config has one server named `mip`, type `http`, the URL, and `Authorization: Bearer <token>`.
   - If `tools` is an empty list: `--tools ""` only.
3. `--model <id>` when a model is set.
4. `--effort <thinking>`. Default `medium` (`DEFAULT_THINKING`).
5. `--system-prompt <text> --system-prompt-snapshot off` when a system prompt is set.
6. `--resume <id>` when `sessionId` is set. Otherwise `--session-id <new uuid>`.

Environment (`cliEnv`): a copy of `process.env` with `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` removed, and `CLAUDE_CONFIG_DIR` set to `sessions/claude`. The CLI uses its subscription login.

The child has no `cwd`, so it runs in mip's own folder. Its built-in tools are off. File and shell work go through the app's tools with the run's workspace.

stdout, one line at a time, through `parseStreamLine`:
- `stream_event` with `content_block_delta` and `text_delta`: `text`.
- `assistant` `tool_use` blocks: `tool_call`. The name is `mcp__mip__<name>`. The dashboard drops the prefix (`ui/toolName.ts`). Storage keeps the full name.
- `user` `tool_result` blocks: `tool_result`, with `is_error` as `isError`.
- `result`: `error` with the `result` text when `is_error`. Otherwise `done` with `session_id`.
- Other lines, and lines that are not JSON, are ignored.

End and failure:
- Exit without a `result`: `error` with the stderr text, or `claude CLI exited with code <n>`.
- Spawn failure: `error` with `failed to start "<bin>": ...`.
- `defaultTimeoutMs` is 300000. The child gets SIGTERM after that, or when the abort signal fires. The consumer stopping early also kills the child.

Model list (`models()`, used by `GET /api/providers`):
- Spawns the CLI with `-p --input-format stream-json --output-format stream-json --verbose`. Sends `control_request` `initialize`, then `list_models`. No prompt is sent.
- Cached 10 minutes (`CATALOG_TTL_MS`). Timeout 20 s. The CLI's `default` entry maps to id `""`.

Auth status (`targets()`): `claude auth status --json`, cached 5 s. One target: `claude-subscription`, named "Claude subscription", method `cli`. Sign-in and sign-out: flow 13.

Gotchas:
- A `sessionId` the local CLI does not have makes `--resume` fail. A synced agent has no session id (flow 15), so its first run on another machine starts a new session.

## 5. Pi provider run (`adapters/pi.ts`)
Entry: `PiProvider.run(options)`.
1. `runtime()` creates Pi's `ModelRuntime` once, with `allowModelNetwork: false`, `DbCredentialStore`, and `DbModelsStore`. `reloadConfig()` drops it, so the next call makes a new one.
2. `resolveModel`:
   - `options.model` is `provider/model`. Unknown: error `unknown Pi model "<id>"`.
   - No model: the first signed-in model. None: error `no Pi provider is signed in; sign in under Settings first`.
3. Session: with `sessionId`, `openSession` finds it with `SessionManager.findById` in `sessions/pi` (error `no Pi session with id <id>`). Without one, `SessionManager.create(cwd, sessions/pi)`. `cwd` is `process.cwd()`, not the workspace.
4. `DefaultResourceLoader`: `noContextFiles: true`, `noSkills: true`, `systemPrompt` set to the run's system prompt. Agent dir is `getAgentDir()`, which is `data/pi`.
5. `createAgentSession({model, thinkingLevel: options.thinking, noTools: "builtin", customTools})`:
   - `customTools` are the app tools wrapped by `toPiTool`. Each one runs `tool.run` with `{workspace, agentId, botId, roomId, deferred, signal}`. A failed result throws, so Pi reports it as an error.
6. Session events go through `toAppEvent`:
   - `message_update` with `text_delta`: `text`.
   - `tool_execution_start`: `tool_call`.
   - `tool_execution_end`: `tool_result`, with Pi's `isError`.
   - `agent_end` with `willRetry` false and a last assistant message whose `stopReason` is `error`: `error` with that message's `errorMessage`.
7. `session.prompt` resolves: `done` with `session.sessionId`. Rejects: `error`. Then the listener is removed and the session disposed.

Gotchas:
- Pi's own tools and skills are off. Pi's capabilities report `tools: false` and `mcp: false`. The app's tools arrive as custom tools.
- Pi's `cwd` is the server's folder. Tools use the run's workspace.
- Resume looks up the session by id in `sessions/pi`. A synced agent has no session id, so it starts a new session.

## 6. Tool call from the Claude CLI
1. The CLI POSTs JSON-RPC to `/mcp` with `Authorization: Bearer <token>`. The token is the run's token from flow 3 or a room turn (flow 8).
2. `handleMcp` (`http/mcp.ts`) looks up the token with `runContextForToken` (`app/tools/index.ts`). An unknown or released token gets 401 `{"error":"unauthorized"}`.
3. Methods. Replies are HTTP 200. A message with no `id` gets 202 and no body.
   - `initialize`: `protocolVersion` (the client's, or `2025-03-26`), `capabilities.tools`, serverInfo `mip` `0.1.0`.
   - `tools/list`: the run's offered `tools` with name, description, and inputSchema.
   - `tools/call`: finds the tool in the offered list. Unknown: error `-32602`. Otherwise runs `tool.run(arguments, {workspace, agentId, botId, roomId, deferred})` and returns `{content:[{type:"text", text}], isError}`.
   - Any other method: error `-32601`.
4. Deferred tools are not in `tools/list`. Calls to them go through `tool_call` (flow 18).
5. `releaseRun` removes the token when the run ends, so a late call gets 401.

Gotcha: a bot turn has no workspace, so `workspace` is `""`. No bot tool reads it.

## 7. Memory
Storage: `notes` (title unique, case-insensitive), `notes_fts` (FTS5 over title and body), `note_links`, `note_tags`.

Dashboard (`http/routes/memory.ts`, `app/memory.ts`):
- `POST /api/memory` `{title, body}` → `writeNote`. Title is trimmed (400 `title is required`). An existing note with the same title keeps its id. Links: `[[Title]]` or `[[Title|alias]]`. Tags: `#tag` with letters, digits, `_`, or `-`. Link titles are de-duplicated without case. `saveNote` (`storage/notes.ts`) writes the note, its FTS row, its links, and its tags in one transaction. Replies 200 `{title, links, tags}`.
- `DELETE /api/memory/:title` → `forgetNote`, 404 `no such note`. `deleteNote` removes the note, its FTS row, its links, and its tags. Links from other notes to its title stay.
- `GET /api/memory?q=` → `memoryList`. With `q`: `searchMemory(q, 100, minLength 1)`. Without: every note, newest first.
- `GET /api/memory/:title` → `readNote`, 404 `no such note`. Returns body, `links`, `backlinks`, `tags`.
- `GET /api/graph` → `memoryGraph`. One node per note. A `missing: true` node for each link target with no note. Edges are undirected and unique.

Agent tools (`app/tools/memory.ts`):
- `memory_search(query)`: `searchMemory(query, 10)`. Words of 2 or more letters and digits are OR-matched in FTS. Output is `title: snippet` per line.
- `memory_read(title)`: title, body, `Links to`, `Linked from`, `Tags`.
- `memory_edit(title, oldText, newText)`: only for an existing note. `oldText` must occur exactly once. `newText` may be empty. Refused if the result is empty. Saved through `writeNote`, so links and tags update.
- Agents get them as deferred tools (`DEFERRED_TOOLS`). Bots get them offered directly (`BOT_TOOLS`).
- Agents cannot create or delete notes.

Automatic recall: `recallFor(prompt)` runs for agent runs only. It searches words of 4 or more characters, takes up to 5 notes, and appends the snippets to the system prompt. Room turns do not recall.

## 8. Room (bots)
Entry: `POST /api/room/messages` `{room, text}` → `postToRoom` (`app/room/room.ts`). Replies 202 with the saved user message.

Checks, in order:
- Room exists (404 `no such room`).
- Room not busy (409 `this room is busy, wait for the bots to finish`). Busy is the in-memory `talking` map.
- Trimmed text not empty (400 `message is required`). At most 4000 characters (400).

Steps:
1. `addRoomMessage` with kind `user`, author `You`.
2. Members are the bots in the room. With no members, a `system` message says "No bots in this room yet. Add some with Members." and the call stops.
3. Queue:
   - `mentionedBots(text, members)` (`app/room/engine.ts`): matches `@([A-Za-z][A-Za-z0-9_-]*)`, case-insensitive, unknown names ignored. Mentioned bots in mention order.
   - With no mention: the master (`masterBotId`) first, then the other members in name order.
4. `talking` marks the room. `converseRoom` runs in the background. Its `finally` clears the mark.
5. Each turn calls `runTurn` (`app/room/room.ts`):
   - Prompt: "Room so far:", then the last 30 messages as `author: text`, then "You are <bot>...", the instruction to mention with `@Name` or reply `PASS`, and "Other bots in the room: ...".
   - System prompt: the bot's persona, `You are in the room "<room>" with the user and other bots. Keep each message short.`, and `toolGuidesPrompt(BOT_TOOLS)`.
   - Run: `registerRun({tools: BOT_TOOLS, deferred: botDeferredTools(), botId, roomId})`. The provider runs with `botId`, `roomId`, `toolServer`, the bot's `model`, and its `thinking`. No session id, so each turn is a new provider session. No memory recall.
   - An `error` event throws.
6. `converseRoom` (`app/room/engine.ts`), per turn:
   - `speaking(bot.name)`.
   - A throw: `system` message `<bot> couldn't reply: <message>`, then stop.
   - Empty or `PASS` reply: silent, and its mentions are not followed.
   - Otherwise a `bot` message with the trimmed text and its calls. Each `@mention` of another bot is queued unless that bot is already waiting. A bot never queues itself.
7. Turn limit: 8 (`MAX_TURNS`). Then `system` "Paused after 8 turns. Mention a bot to keep the room going."
8. Each message is saved with `addRoomMessage` as it happens. The busy mark is cleared in `finally`.

Reads: `GET /api/room?room=<id>&after=<message id>` → `{messages, busy, speaking}`. `after=0` returns the latest 100. Otherwise up to 200 messages with a larger id, oldest first. 404 for an unknown room.

Client (`features/bots/useRoom.ts`): polls every 1500 ms (`POLL_MS`) with `after` set to the last id seen. Switching rooms clears the list. `send` posts to `/api/room/messages`, then polls at once. `busy` from the server disables the input.

Rooms (`app/room/rooms.ts`, `http/routes/room.ts`):
- `GET /api/rooms` → `{rooms}`. `POST /api/rooms` → 201. `PUT /api/rooms/:id` → 200. `DELETE /api/rooms/:id` → `{ok:true}`, or 409 `keep at least one room`.
- `roomFields`: name 1 to 40 characters, unique without case (409). Each bot id must exist (400). `masterBotId` must be a member (400), and is cleared when a later edit removes that member. `collapseOthers` is a boolean.
- Delete removes the room's messages and members (`deleteRoom`).

Bots (`app/bots.ts`, `http/routes/bots.ts`):
- `GET /api/bots` → `{bots}`. `POST /api/bots` → 201. `PUT /api/bots/:id` → 200. `DELETE /api/bots/:id` → `{ok:true}`.
- Name matches `^[A-Za-z][A-Za-z0-9_-]{1,23}$`, unique without case (409).
- Persona is required, at most 4000 characters.
- `providerId` defaults to `claude-cli` and must exist (400).
- `model` must be in the provider's current model list (400). `thinking` must be one of that model's levels (400).
- `color` must be in `BOT_COLORS` (400). Default: the first colour no bot uses.
- Delete removes the bot from every room. Its messages stay, with its name.
- A room whose `master_bot_id` names a deleted bot keeps the id until the room is edited. `postToRoom` then ignores it.

Gotchas:
- Turns use `BOT_TOOLS` only. Bots have no bash, read, write, edit, or `ask_user`.
- The busy state is in memory. A restart clears it.

## 9. Mention autocomplete (client)
- `mentionAt(text, caret)` (`features/bots/mentions.ts`) finds the `@partial` that ends at the caret. The pattern is `(^|\s)@([A-Za-z0-9_-]*)$` on the text before the caret.
- `suggestions(bots, mention)` lists bots whose names start with the partial, without case. The list is hidden when the partial is exactly one bot's name and no other name starts with it, so Enter sends.
- `MentionInput` (`features/bots/MentionInput.tsx`): ArrowDown and ArrowUp move the highlight. Enter or Tab picks, and `completeMention` writes `@Name ` with the caret after it. Escape hides the list.
- `splitMentions(text, bots)` uses the server's pattern `@([A-Za-z][A-Za-z0-9_-]*)`. A pill shows exactly when the server would queue that bot. `MessageText` draws pills in the bot's colour. A click opens `BotProfileModal`.

## 10. Agents
- List: `GET /api/agents` → `{agents}`, ordered by `updated_at` descending. `useAgents.refresh` (`features/agent/useAgents.ts`) announces `AGENTS_CHANGED` after each load.
- Create: `POST /api/agents` `{providerId, personaId?}` → 201 (`createAgent`, `app/agents.ts`).
  - Unknown provider or persona: 400.
  - Persona defaults to the default persona.
  - Title from `pickAgentName` (`app/names.ts`): a Norse name no agent has. When all are used, a name with " 2", " 3", and so on.
  - `open_to_bots` starts at 1.
- Open: `GET /api/agents/:id` → `{agent, messages, activeRunId}`. 404 when unknown.
- Update: `PATCH /api/agents/:id` (`updateAgent`) takes any of:
  - `title`: trimmed, non-empty (400).
  - `openToBots`: boolean (400).
  - `model` and `thinking`: empty means the provider's default. The model must be in the provider's current list (400). A thinking level must be one of that model's levels (400, when set directly). When the model changes and the old level is not valid, the level is cleared.
  - Changes apply to the next message.
- Delete: `DELETE /api/agents/:id` → `{ok:true}`. 409 while a run is active. `deleteAgent` removes `run_events`, `runs`, `messages`, and `agents` in one transaction. `removeWorkspace` deletes `workspaces/<id>/`, including its repo copies. Provider files in `sessions/` stay.
- The persona cannot be changed after creation. No route sets `persona_id`.

## 11. Personas
- `GET /api/personas` → `{personas}`. `POST /api/personas` → 201. `PUT /api/personas/:id` → 200. `POST /api/personas/:id/default` → `{ok:true}`. `DELETE /api/personas/:id` → `{ok:true}`.
- `name` and `systemPrompt` are trimmed and both required (400). Unknown id: 404.
- Delete refusals (`removePersona`):
  - the `default` id: 400 "the built-in Default persona can't be deleted".
  - the current default: 400 "set another persona as default before deleting this one".
  - used by agents: 409 "<n> agent(s) use this persona".
- The default flag is set with `setDefaultPersona` and is local to each machine (flow 15).
- A run reads the persona text each time (`personaPrompt`, flow 3). A missing persona falls back to `default`.
- `DEFAULT_SYSTEM_PROMPT` in `app/personas.ts` is the built-in text. Startup replaces an unedited copy of the previous text (flow 1).
- `PERSONAS_CHANGED` is announced by `PersonasDialog` on save, default, and delete.

## 12. Repositories
- Links (`app/repos.ts`): `CLONE_LINK` accepts `http(s)://`, `ssh://`, `git://`, `file://`, or `user@host:path`. `HOST_LINK` (`github.com/owner/repo`) gets `https://` first. The folder name is the last path segment without `.git`, and must match `^[A-Za-z0-9][A-Za-z0-9._-]*$`.
- Add: `POST /api/repos` `{url}` → 202 with the repo row, `status: cloning`. 409 when the name is in the database or the folder exists. In the background, `runGit(["clone", "--", url, repos/<name>])`:
  - Success: `ready`.
  - Failure: the partial folder is removed, and `error` is saved.
- List: `GET /api/repos` → `{repos}`. Each row adds `branch` (`git rev-parse --abbrev-ref HEAD`; `detached`, or null when not ready) and `copies` (agents whose workspace has `<name>/.git`).
- Pull: `POST /api/repos/pull` → `{results: [{id, name, ok, message}]}`. Ready repos only, with `git pull --ff-only`. Messages: "already up to date", "updated to the latest commit", or git's error. Agent copies are not pulled.
- Copy: `POST /api/repos/:id/copies` `{agentId}` → 201 `{ok:true}`. 404 for an unknown repo or agent. 409 when the repo is not `ready` or the agent already has the folder. `git clone` from the master into `workspaces/<agent>/<name>`, then `origin` is set to the real URL. On failure the copy is removed and the reply is 500.
- Remove: `DELETE /api/repos/:id` → `{ok:true}`. 409 while `cloning`. Deletes `repos/<name>`. Agent copies stay.
- Run note: `repoNote(workspace)` lists the git folders in the workspace for the system prompt.
- `runGit` (`app/git.ts`) sets `GIT_TERMINAL_PROMPT=0`, so a clone that needs a password fails. The error is git's `fatal:` or `error:` line.

## 13. Provider sign-in
Entry: Settings, `ProviderTab` (`features/settings/ProviderTab.tsx`). It polls `GET /api/providers` every 2000 ms (`POLL_MS`) while Settings is open.

- `GET /api/providers` → `{providers: [{id, name, capabilities, models, targets, error?}]}`. Each target has `{id, name, methods, auth, progress}`. `progress` is `{running, output[], prompt?, error?}`.
- Start: `POST /api/providers/:providerId/targets/:targetId/sign-in` `{method}` → 202 `{started:true}`. Calls `signIn`, which calls the adapter's `startSignIn`. The call does not wait.
- Answer: `POST .../answer` `{answer}` → `answerSignIn`, which resolves the prompt shown in `progress.prompt`. → 200 `{ok:true}`.
- Sign out: `POST .../sign-out` → `signOut` → 200 `{ok:true}`. The card confirms first (`confirmSignOut`, `features/settings/SignInPanel.tsx`).
- Any other action: 404.
- An unknown target or unsupported method throws a plain `Error`, so the reply is 500, not 400.

Claude (`claude-cli`): one target, `claude-subscription`, method `cli`.
- Sign-in spawns `claude auth login --claudeai` with `CLAUDE_CONFIG_DIR`. Each output line is logged into `SignInSession` (`adapters/sign-in-session.ts`). `answer` writes a line to the child's stdin.
- On exit the auth-status cache is cleared. The session finishes with the stderr text, or `claude auth login exited with code <n>`.
- Sign-out runs `claude auth logout`.

Pi (`pi`): targets are Pi's providers except `anthropic` (`HIDDEN_PROVIDERS`).
- Methods: `subscription` (OAuth, when the provider has it) and `api_key` (when it has an API key login).
- Sign-in calls `runtime.login(target, "oauth" | "api_key", {prompt, notify, signal}, {getDeviceId})`.
  - Prompts go to `SignInSession.ask`, shown as `progress.prompt`. Select prompts become text with the options listed.
  - Notices (auth URL, device code) become output lines.
- One sign-in per target at a time.
- Sign-out calls `runtime.logout(target)`.
- Credentials are stored through `DbCredentialStore` (flow 23).

Models: `models()`. Claude: from the CLI (flow 4). Pi: every model of the signed-in providers. The first entry is `Default (<name>)` with an empty id.

Events: `ProviderTab` announces `PROVIDERS_CHANGED` when the sign-in state string changes. `SettingsDialog` announces it on close (flow 14).

## 14. Dashboard events and layout
Window events (`api/events.ts`: `announce`, `subscribe`; `useAnnouncement` in `ui/hooks.ts`):

| Event | Sent by | Heard by |
|---|---|---|
| `agents-changed` (`AGENTS_CHANGED`) | `useAgents.refresh`, after each agent list load | `RepositoriesCard` (reloads repo copies) |
| `personas-changed` (`PERSONAS_CHANGED`) | `PersonasDialog`, on save, default, and delete | `useAgents` (persona list) |
| `providers-changed` (`PROVIDERS_CHANGED`) | `ProviderTab` on sign-in state change; `SettingsDialog` on close | `useAgents` (providers and models) |

Memory has no event. `MemoryManager` calls its `onChanged` prop, and `MemoryBody` (`features/memory/MemoryCard.tsx`) reloads `GET /api/graph`.

Client polling intervals:

| Where | Interval | Active while |
|---|---|---|
| `useTranscript` | 600 ms | a run is `running` |
| `useRoom` | 1500 ms | a room is open |
| `ProviderTab` | 2000 ms | Settings is open |
| `useSync` | 1500 ms | a sync is `running` |
| `useMcpServers` | 1500 ms | a server is `connecting` or in `sign-in` |
| `RepositoriesCard` | 1500 ms | a repo is `cloning` |
| `SlackCard` | 3000 ms | up to 120 s after Connect |
| `useMailbox` (`EmailCard`) | the account's `pollSeconds` (60 by default) | an account is shown |

Layout: `App.tsx` places every card in one 12-column grid. The view pill has `dash`, `preview`, and `offline`. Only `dash` has cards. The layout is fixed in code. Nothing is stored in the browser.

Expansion: `Card` (`ui/Card.tsx`) provides `useCardExpansion()` (`expanded`, `open`, `toggle`). An expanded card covers the page. Escape collapses it, unless a `dialog` is open.

## 15. GitHub sync
Entry: Settings, Sync (`features/settings/SyncTab.tsx`, `useSync.ts`). It calls `/api/sync*` (`http/routes/sync.ts`) and `app/sync/engine.ts`.

Accounts:
- `GET /api/sync` → `SyncStatus`: `accounts` (gh logins), `login` (the one used), `repo`, `running`, `error`, `lastSync`.
- `listAccounts` runs `gh auth status --hostname github.com` and parses the text (`parseAccounts`, `app/sync/github.ts`).
- `pickAccount`: the saved choice if gh still has it, else gh's active account, else the first.
- `PUT /api/sync/account` `{login}` → 200 `SyncStatus`. 400 when gh is not signed in to that login. 409 while a sync runs. The choice is saved to `sync/state.json`.

Run:
- `POST /api/sync/run` → 202 `SyncStatus` (`startSync`). 409 while a run is active, or when no account is found ("Sign in with the GitHub CLI first").
- `gitHubAccount` gets the token with `gh auth token --hostname github.com --user <login>`. mip stores no token. It checks the token with `GET /user`. A failure is 502 with GitHub's message.
- `runInBackground`:
  1. `ensureRepo`: `GET /repos/<login>/dotmip`. On 404, creates a private repo with `auto_init`. A public repo is 409.
  2. `syncWith` (below).
- Errors in the background do not change the HTTP reply. They set `lastSync` to `ok: false` with the message. `running` is cleared and `sync/state.json` is written.

`syncWith(remote)`, up to 3 attempts:
1. `fetchRepo` (`app/sync/repo.ts`): clones `sync/dotmip` when the URL changed, otherwise `fetch --prune`. Checks out `origin/main`. An empty remote gets HEAD set to `main`.
2. `readTree()` reads the repo's folders. `readBase` reads `sync/base.json`. A base saved for another repo is ignored. `readLocal()` (`app/sync/snapshot.ts`) reads the database and config files.
3. Empty local database with a non-empty base: 409 "This database is empty, but the last sync had data. Nothing was changed. Check MIP_HOME first." Nothing changes.
4. `mergeSnapshots(base, local, remote)` (`app/sync/merge.ts`), per record:
   - Changed on one side only: that side wins.
   - Changed on both sides: the rules below.
   - Edited on one side and deleted on the other: the edit is kept, and a note is logged.
5. `applySnapshot(local, merged)` (`snapshot.ts`). The three config files go first, each checking its new text before writing: `mcp.json`, `mail.json`, `slack.json`. Then Pi credentials and catalogs, Pi config files, mail cache, spending, Slack cache, personas, bots, notes, agents, rooms, and room messages (added only, never removed).
6. `readLocal()` again. If the MCP entries changed, `startMcpServers()` runs in the background. If Pi files changed, `reloadPiConfig()` runs.
7. `writeTree(final)` rewrites the repo folders and `README.md`.
8. `commitAndPush` (`app/sync/repo.ts`): `git add -A`, commit when there are changes (author `mip <mip@localhost>`), push `HEAD:refs/heads/main`. A non-fast-forward rejection returns `rejected`, and the next attempt starts.
9. Success: `writeBase` saves the merged state to `sync/base.json`. The run returns `SyncRun {at, ok, message, pulled, pushed, notes}`.
10. Three rejections: 409 "GitHub changed during the sync. Sync again." This goes to `lastSync`.

Conflict rules (`merge.ts`). "Both changed" means both sides differ from the base and from each other:

| Part | Both changed |
|---|---|
| personas, bots, notes, rooms | newer `updatedAt` wins; a tie goes to GitHub's copy |
| agents | newer settings win; messages from both sides are kept (union) |
| room messages | never edited; union; a removed room drops its messages |
| Pi credentials, Pi model catalogs | newer `updatedAt` wins |
| Pi config files (`settings.json`, `models.json`) | GitHub's copy wins |
| MCP servers (mcp.json entries) | GitHub's copy wins |
| mail accounts (mail.json entries) | GitHub's copy wins |
| Slack app, Slack accounts | GitHub's copy wins |
| spending entries | GitHub's copy wins |
| mail cache | GitHub's copy wins; not logged |
| Slack cache | newer read wins; not logged |

The sync log gets a note for each conflict except the caches.

Removals: a record missing from GitHub is removed locally. Storage refuses some removals, so the record stays and is pushed back: the default persona, a persona an agent uses, an agent with a running run, and the last room.

Keys (`keyOf`): bots and notes by lowercase name. Agents, personas, and rooms by id. Slack app by `app`.

What syncs (`snapshot.ts`, `storage/sync.ts`, `repo.ts` `README`):
- Synced: personas (not the default flag), bots (with colour), notes (with links and tags), agents (settings and messages; not the provider session id, not tool call details), rooms (name, members by bot name, master, `collapseOthers`), room messages (not calls), `mcp/` (mcp.json entries with tokens, headers, env, and OAuth state), `mail/` (mail.json accounts with app passwords), `slack-app/` (client id and secret), `slack/` (accounts with user tokens), `pi-credentials/`, `pi-models/`, `pi-files/` (settings.json and models.json), `mail-cache/`, `slack-cache/`, and `spending/`.
- Not synced: provider logins (`sessions/`), repository clones (`repos/`), agent workspaces (`workspaces/`), skills (`skills/`), tool call details, the sync state files under `sync/`, `device-id`, and `restart.log`.

Limits:
- Each machine stamps change times with its own clock.
- The three config files are written before the database. A refusal there stops the sync before any database row changes.
- An agent with a running run is not deleted by a sync.

Tests: `app/sync/github.test.mjs` (gh account text and choice), `app/sync/merge.test.mjs` (the rules), and `app/sync/sync.test.mjs` (two machines, a local bare repo, real git). None calls GitHub. `gitHubAccount` and `ensureRepo` are checked only by hand, with a real `gh` login.

## 16. Skills
Card: `features/skills/SkillsCard.tsx` (Create, Import, Remove), `CreateSkillDialog.tsx`, `ImportSkillDialog.tsx`, `useSkills.ts`. The composer also reads the list (`features/agent/Composer.tsx`).

Folder rules (`app/skills/format.ts`):
- Name: `^[a-z0-9]+(-[a-z0-9]+)*$`, at most 64 characters. `imports` is reserved.
- Description: one line, at most 1024 characters.
- Files: `.md`, `.txt`, `.json`, `.yaml`, `.yml`, `.csv` only. At most 50 files and 512 KB in total. `SKILL.md` is at most 64 KB.
- A skill's `SKILL.md` header is the block between the first two `---` lines, with `name` and `description`.
- `skill_file` returns at most 64 KB.

Create: `POST /api/skills` → 201 `createSkill` (`app/skills/create.ts`). Writes `SKILL.md` into `skills/<name>/` with the header. 409 when the name is installed. Writes no `.mip-source.json`.

Import:
1. `POST /api/skills/imports` `{path}` → 201 with a preview. `stageImport` requires an absolute path to a folder (400). It removes staged imports older than a day. It copies the folder into `skills/.staging/<uuid>`, skipping dot entries. It refuses symbolic links, non-regular files, non-text files, and files over the limits (400). It requires `SKILL.md` at the top. It writes `.mip-source.json` into the staged folder.
   - The preview gives `id`, `name`, `description`, `files`, `source`, `skillMd`, and `replaces` (the installed `SKILL.md`, or null).
2. `POST /api/skills/imports/:id/confirm` → 200 `SkillDetail`. `confirmImport` removes any installed skill with that name and renames the staged folder to `skills/<name>/`. The `.mip-source.json` moves with it.
3. `DELETE /api/skills/imports/:id` → `{ok:true}` (`discardImport`). Unknown ids are not an error.

Read and search:
- `GET /api/skills` → `{skills, problems}`. A folder whose skill fails to parse is listed as a problem, not hidden.
- `GET /api/skills/:name` → `SkillDetail` with the body and file list. 404 unknown. 409 invalid.
- `DELETE /api/skills/:name` → `{ok:true}`.
- `searchSkills(query)`: splits on whitespace. Each word is a substring test against name and description. Ranked by matching words, then by name. Limit 10.

Agent and bot use:
- `skill_search(query)`: `searchSkills`. `skill_read(name)`: body and the list of files. `skill_file(name, path)`: one listed file. Every agent and bot can use all of them. The tools do not check the caller.
- The system prompt does not list skills. The guides of `skill_search` and `skill_read` say to search first.

The `/` command: `withSkillCommand` (`app/skills/registry.ts`) runs in `execute` for agent runs. A message that starts with `/name` for an installed skill becomes the skill's instructions, followed by the rest of the message (`The user's message:`). The saved message is what was typed. A `/` that matches no skill is sent as typed. Rooms have no `/` command. In the composer, `skillCommandQuery` and `matchingSkills` (`features/agent/skillCommand.ts`) list skills while `/` is being typed.

Other providers: Claude runs with `--disable-slash-commands`. Pi runs with `noSkills: true`. Neither reads its own skill folders.

Tests: `app/skills/format.test.mjs` (header and file rules) and `app/skills/skills.test.mjs` (import, refusals, search, `/name`, tools, removal). Both use a temporary `MIP_HOME`.

## 17. Tool calls
- Recording: `execute` in `app/runs.ts` keeps a `ToolCallLog` (`app/tools/calls.ts`). `tool_call` starts a call with its input as JSON. `tool_result` attaches output and the error flag by call id. Text over 8000 characters is cut with `… (<n> more characters)`. The reply saves `messages.calls`. Room turns do the same in `room.ts` (`room_messages.calls`).
- Display: `ui/ToolCallsDialog.tsx` (`ToolCallsButton`, "View tool calls (n)") sits at the bottom of a reply that used tools. It is used by `features/agent/Transcript.tsx` and `features/bots/RoomTranscript.tsx`. Each call's input and result show through `ui/ToolCallDetails.tsx`. A reply saved before details existed lists names only.
- Live: `useTranscript.ts` builds the same list while a reply streams.
- Tool names: agent replies from Claude are stored as `mcp__mip__<name>`. Pi stores plain names.
- Tools card: `features/tools/ToolsCard.tsx` lists `GET /api/tools` (`describeTools`). Each tool shows whether agents and bots may use it. The All, Agent, and Bot pills filter. Collapsed, it shows 4 (`PREVIEW`).
- Not synced: calls stay on the machine that ran them. Sync carries tool names only.

## 18. Tool search
- Offered and deferred (`app/tools/index.ts`):
  - Agent run offers `AGENT_TOOLS` = `BASIC_TOOLS` + `SEARCH_TOOLS`. `BASIC_TOOLS` are `bash`, `read`, `edit`, `write`, `skill_search`, `skill_read`, `ask_user`.
  - Agent deferred list `AGENT_DEFERRED` = `DEFERRED_TOOLS` (`memory_search`, `memory_read`, `memory_edit`, `skill_file`) + `spending_upsert`, plus the connected MCP tools (`agentDeferredTools()`).
  - `SEARCH_TOOLS` are `tool_search` and `tool_call`.
  - Bot turn: `BOT_TOOLS` offered directly. Deferred list `botDeferredTools()` = `SOCIAL_DEFERRED` (`mail_list`, `mail_read`, `slack_search`, `slack_read`, `slack_unreplied`) + `spending_list` + connected MCP tools.
- Prompt: `toolGuidesPrompt(offered)` lists each offered tool's guide. The `tool_search` guide tells the model that other tools exist.
- `tool_search(query)` (`app/tools/search.ts`): `searchTools` scores each deferred tool. Each query word found in the name adds 2. Each found in the description adds 1. Best first, up to 8. An empty query lists the first 8. Output is each tool's name, description, guide, and inputs.
- `tool_call(name, input)`: runs one tool from the run's deferred list only. Any other name, including offered tools, fails with "no deferred tool named ... Find it with tool_search first."
- Claude gets these through `/mcp`. The deferred list comes from the token. Pi gets them as custom tools, with `deferredTools` in its context.
- Agents do not get mail or Slack tools. Those are bot-only.

## 19. Asking the user (ask_user)
1. The model calls `ask_user` (`app/tools/ask.ts`), offered to every agent run. Input: `question`, and `kind` (`choice`, `multi`, `text`, or `slider`). `choice` and `multi` need 2 to 8 options. `text` takes an optional `placeholder`. `slider` takes `min` and `max` (max above min), `step` (above 0, default 1), and `value` (between min and max, default min). Invalid input returns a failed result.
2. The question is kept in a map keyed by agent id. A second question in the same run is refused until the first is taken.
3. `execute` calls `takePendingAsk` when the run ends and saves the question on the reply (`messages.ask`). The reply text is what came before it.
4. The run does not wait. The answer is the user's next message, sent through the normal send path.
5. `AskCard` (`features/agent/AskCard.tsx`) shows the controls under the reply. `choice` sends at once. `multi` sends the checked options together. Both have an "Other" option for the user's own answer. `Transcript` disables the controls while the agent is busy or once a user message follows the question.

## 20. Bots sending tasks to agents (agent_ask)
1. Agents are open to bots from creation (`open_to_bots` = 1). The "Bots may control" switch in the composer (`Composer.tsx`) sets it through `PATCH /api/agents/:id`.
2. A bot turn can call `agents_list` (open agents, marked `(busy)` when a run is active) and `agent_ask` (`app/tools/index.ts`). Both are bot-only.
3. `agent_ask {agent, task}` refuses, as tool errors: a caller that is not a bot in a room; an unknown or closed agent; an empty task; a room that already has a task out (`delegating` set); a busy agent (`startRun` throws 409). A refused start frees the room again.
4. Accepted: `startRun` makes a user message in the agent's chat, `"<bot> in <room> asks: <task>"`. The agent runs it with its own tools, including `bash`.
5. When the run ends, `onFinish` removes the room from `delegating` and saves a room message with kind `agent`, author = the agent's title, text = the reply, or "(no reply)". An error is appended as `Error: <message>`. `onFinish` runs even if saving failed.
6. The bot does not wait. It sees the reply on a later turn. A question the agent asks during the task appears in the agent's own chat, and the room gets only the final reply.

## 21. Workspace and file tools
All agent-only (`BASIC_TOOLS`, flow 18). Bots do not have them.
- `inWorkspace(workspace, path)` (`app/tools/workspace.ts`) resolves a relative path. A path outside the workspace is refused with `path is outside the workspace`. `read`, `write`, and `edit` all use it.
- `bash` (`app/tools/bash.ts`): runs `bash -c <command>` with the workspace as `cwd` and the server's environment. Default timeout 120 s, or `timeout` in seconds. The child gets SIGTERM on timeout or abort. Output keeps the last 50000 characters. Text is `exit code <n>` or `stopped (timeout or cancelled)`, then the output. `isError` is true for any code other than 0. Nothing is sandboxed.
- `read` (`app/tools/files.ts`): `offset` from line 1, `limit`. At most 2000 lines and 50,000 characters (`text.length`, despite the constant's name `MAX_BYTES`). When lines remain, a footer `[showing lines a-b of n]` follows. A character cut adds `[cut at 50 KB]`.
- `write`: creates missing folders, overwrites the file.
- `edit`: `oldText` must occur exactly once. Otherwise a failed result says how many times it occurs or that it was not found.
- Every tool call is wrapped by `guarded`, so a thrown error becomes a failed result.

## 22. External MCP servers
- Config: `data/mcp.json` (`MCP_CONFIG_FILE`, mode 600). Shape: `mcpServers` map from name to entry. `stdio` entries have `command`, `args`, and `env`. `http` entries have `url`, `headers`, and optional `oauth`. A missing `type` means `http` when `url` is set, else `stdio`. Names match `^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$`. A bad entry is reported by name and skipped (`parseMcpConfig`, `app/mcp/config.ts`).
- Start: `startMcpServers()` (`app/mcp/manager.ts`) closes every connection and connects each server in parallel. Each server has 30 s to start and 30 s to list its tools. Each call has 120 s. Server status is `connecting`, `connected`, `error`, or `sign-in`.
- Tool names: `mcp_<server>_<tool>`, with characters outside `[A-Za-z0-9_-]` replaced by `_`, cut to 64 characters. A name another server already has is skipped, and reported in `problems`.
- `mcpTools()` returns the tools of connected servers. `agentDeferredTools()` and `botDeferredTools()` take this list when a run or turn starts, so a later reload does not change a run in progress. A call to a closed server then fails.
- A tool result with `isError` is a failed result. A connection error is a failed result with the cause.
- Routes: `GET /api/mcp` (status), `POST /api/mcp` (add; JSON; 201), `POST /api/mcp/reload` (close and reconnect from the file), `DELETE /api/mcp/:name` (remove; 404), `POST /api/mcp/:name/sign-in` (JSON; 400 unless the server uses OAuth; 404 unknown). `addMcpServer` refuses a name already listed (409) and an entry the file would not load (400). Transport `oauth` builds an http entry with `oauth.serverUrl`; `http` takes headers; `stdio` takes a command.
- OAuth (`app/mcp/manager.ts`, `http/mcp-oauth.ts`): an http entry with `oauth` uses `@earendil-works/pi-mcp/oauth`. Its redirect URL is `http://127.0.0.1:3000/api/mcp/oauth/callback`, client name `mip`. Without tokens the server ends in `sign-in` with `signInUrl`. The browser returns to the callback. `completeSignIn` matches the state (400 when no server is waiting), exchanges the code (`authorizeMcp`, 502 on failure), and reconnects. Tokens are saved in the server's `mcp.json` entry through `saveSignIn`. The library refreshes expired tokens.
- Bots: a bot turn takes `botDeferredTools()`. Its `tool_search` and `tool_call` reach the MCP tools too.
- Sync: `mcp/<name>.json` in the dotmip repo, tokens included (flow 15). A sync that changes the servers rewrites `mcp.json` and reconnects in the background.
- Tests: `app/mcp/mcp.test.mjs` (a fake stdio server, temporary `MIP_HOME`) and `app/mcp/mcp-oauth.test.mjs` (a fake OAuth server through sign-in, reload with saved tokens, add and remove).

## 23. Pi's config
- Location: `PI_AGENT_DIR` = `data/pi` (set in `PiProvider`'s constructor). Pi's `settings.json` and `models.json` live there. Only the names in `PI_CONFIG_FILES` are read or written (`storage/pi.ts`).
- Credentials and model catalogs are rows in `pi_credentials` and `pi_models`, not files. Pi reads and writes them through `DbCredentialStore` and `DbModelsStore` (`app/pi/store.ts`), passed to `ModelRuntime.create`. Pi never reads `~/.pi`.
- Writes: `DbCredentialStore.modify` is the only write path. Writes for one provider run one at a time, so an OAuth refresh cannot race another write. Each write stores `updated_at = Date.now()`.
- First start: `importLegacyPiAuth` (flow 1) copies `~/.pi/agent/auth.json` once. It runs only when `pi_credentials` is empty. The flag `pi_state.pi-auth-imported` stops later imports, even after every credential is removed. The source file is left alone.
- Runtime: `runtime()` caches one `ModelRuntime` (`allowModelNetwork: false`). `reloadConfig()` drops it, so the next call reads `models.json` again. A sync that changes Pi files calls it (flow 15).
- Sync: credentials and catalogs use the newer `updated_at` (flow 15). `settings.json` and `models.json` use GitHub's copy when both sides changed.
- Permissions: `mip.db` is mode 600, since it holds credentials.
- Tests: `app/pi/pi-store.test.mjs` (stores, write order, import), `adapters/pi-signin.test.mjs` (sign-in), and the two-machine cases in `app/sync/sync.test.mjs`.

## 24. Mail over IMAP
Card: `features/email/EmailCard.tsx`, `useMail.ts`, `AddMailAccountDialog.tsx`, `MailMessageDialog.tsx`. Backend: `app/mail/mail.ts` (orchestration), `accounts.ts` (`data/mail.json`), `imap.ts` (ImapFlow reads), `sessions.ts` (connections), `cache.ts` (`data/mail-cache.json`), `messages.ts` (headers and text).

Accounts:
- `GET /api/mail/accounts` → `{accounts, presets, problems}`. Presets: `gmail`, `icloud`, `fastmail`, `outlook` (port 993, TLS), and `other`. Passwords are never returned.
- `POST /api/mail/accounts` (JSON) → 201. `addMailAccount` checks the preset (400), the address (`^[^\s@]+@[^\s@]+\.[^\s@]+$`, lowercased), the password (spaces removed), and the host and port for `other` (`secure` defaults to true). A same user and host already listed is 409. The account signs in with `signInOnce` before it is saved. A refusal is 400 `Could not sign in to <host>: <reason>`. The id comes from `idFor` (the address with runs of other characters as `-`). The saved account has `mailbox` INBOX, `watch` `{mode: "auto", pollSeconds: 60}`, and `maxBytes` 20000.
- `DELETE /api/mail/accounts/:id` → `MailAccountsReply`. Removes the account, its cache entry, and its open connection.
- `POST /api/mail/accounts/:id/test` (JSON) → `{messages, unseen}`. Uses the open connection.

Reading:
- `GET /api/mail/accounts/:id/messages[?count=N]` → `{mailbox, messages, complete}`. `N` is clamped to 1 to 200. Without `N`, the list is everything cached, and at least 25. `complete` is true when the mailbox has no older messages.
- `syncMailbox` (`imap.ts`) reads the mailbox read-only. It lists every UID. It keeps cached headers whose UID still exists, when `UIDVALIDITY` matches. It fetches headers for UIDs above the newest cached one, or the newest `N` when the cache is empty. It fetches older headers until `N` is reached. It refreshes the `\Seen` flag of every kept message. Headers are sorted by UID, newest first. The result is saved to `mail-cache.json`. No bodies are cached.
- `GET /api/mail/accounts/:id/messages/:uid` → `MailMessage` with `to`, `text`, and `truncated`. `fetchMessage` fetches one UID with its source and parses it with mailparser. Text falls back to HTML with tags removed. The text is cut to `maxBytes`. 400 for a non-positive UID. 404 when the mailbox has no such UID.
- Reading never sets `\Seen`, as the mailbox is opened read-only and the comment on `fetchMessage` says the body is fetched with `BODY.PEEK`.

Connections (`sessions.ts`):
- One ImapFlow connection per account, kept between reads. Its session is keyed by a hash of host, port, TLS flag, user, and password, so changed settings open a new one.
- Reads on one account run one after another.
- A read that fails on an open connection retries once on a new connection. A failure on a new connection is thrown.
- A connection unused for 5 minutes (`DEFAULT_IDLE_CLOSE_MS`) is logged out.

Failures: a read failure is 502 `Could not read <label>: <reason>`. The reason is the server's `responseText` when it sent one. The password is not included. Unknown account: 404.

Card: the list is re-read every `watch.pollSeconds` while an account is shown (`useMailbox`). "Load more" asks for 25 more. Opening a message shows it in `MailMessageDialog`.

Bots (read-only, deferred, bot-only): `mail_list` (`account`, `count` up to 25, default 10) and `mail_read` (`account`, `uid`). They go through `listMailMessages` and `openMailMessage`. `account` may be left out when one account is connected. Agents do not have them.

Sync: `data/mail.json` accounts sync to `mail/` (flow 15), with app passwords. `mail-cache.json` syncs to `mail-cache/`. When both sides changed an account, GitHub's copy wins. A `mail.json` entry that fails its checks stops the sync (409). `parseAccount` clamps `watch.pollSeconds` to at least 15 when a file is read. `watch.mode` is read and validated, and no backend code uses it.

Tests: `app/mail/accounts.test.mjs`, `messages.test.mjs`, `mail.test.mjs` (against `fake-imap.test-support.mjs`), and `mail-sync.test.mjs`. A real mail server is not tested here.

## 25. Slack
Card: `features/slack/SlackCard.tsx` (conversation list, transcript, composer, Accounts), `SlackDialog.tsx` (app setup and accounts), `SlackThreadDialog.tsx`, `useSlack.ts`. Backend: `app/slack/connect.ts` (OAuth and token), `config.ts` (`data/slack.json`), `api.ts` (Web API calls), `read.ts` (reads), `post.ts` (send), `cache.ts` (`data/slack-cache.json`), `slack.ts` (the settings view). Routes: `http/routes/slack.ts`, `http/slack-oauth.ts`.

Everything acts as the connected user. Only user scopes are requested (`SLACK_USER_SCOPES` in `connect.ts`), so nothing posts as a bot. A token is never returned by the API.

App setup:
- `PUT /api/slack/app` (JSON) `{clientId, clientSecret}` → `saveSlackAppInput`. The client id must match `^\d+\.\d+$`, and the secret must not be empty (400). Saved as `app` in `slack.json`.
- `GET /api/slack` → `SlackReply`: the client id (never the secret), `redirectUri`, `scopes`, a `manifest` JSON for Slack's "From a manifest" page, `accounts` (no tokens), and `problems`.
- The redirect URI is `MIP_SLACK_REDIRECT_URI` when set, else `http://127.0.0.1:3000/api/slack/oauth/callback`. Slack must list it.

Connect (OAuth):
1. `POST /api/slack/connect` (JSON; body `{}`) → 200 `{url}`. `startConnect` needs a saved app (400). It makes a 16-byte random state, valid for 10 minutes. The URL is `https://slack.com/oauth/v2/authorize` with `client_id`, `user_scope` (the scopes joined by commas), `redirect_uri`, and `state`.
2. The card opens the URL in a new tab and polls `GET /api/slack` every 3 s for up to 120 s.
3. Slack returns to `GET /api/slack/oauth/callback?code&state`. `completeConnect` requires a pending, unexpired state (400 otherwise, and the state is used once). It calls `oauth.v2.access` with the client id, secret, code, and redirect URI. Without `authed_user.access_token` and `team`: 502.
4. `save` makes the account id `<team id>.<user id>`, looks up the display name with `users.info` (falls back to the id), and writes it with `saveSlackAccount`. The browser gets an HTML page from `page()`.

Token connect: `POST /api/slack/token` (JSON) `{token}` → 201. The token must start with `xoxp-` (400). `auth.test` identifies the account. Then it is saved as above.

Disconnect: `DELETE /api/slack/accounts/:id` → `SlackReply`. 404 when not connected. The token is removed. Nothing is revoked in Slack. `forgetCache` drops the `conversations:<id>` and `messages:<id>:` entries.

Reads (all answers cached in `slack-cache.json`; `?refresh=1` bypasses the cache):
- `GET /api/slack/accounts/:id/conversations`: `users.conversations` (public and private channels, MPIMs, IMs; archived excluded; limit 200). Names come from `users.list`, cached for a day per team. Sorted: channels, private channels, group DMs, DMs, then by name. Cached 10 minutes.
- `GET .../unread`: for the first 40 conversations, `conversations.info` `last_read` and `conversations.history` (limit 100), counting messages not from the user. Batches of 5. A failing conversation counts 0. Cached 2 minutes.
- `GET .../conversations/:channel/messages`: `conversations.history` (limit 30). Thread replies are removed, and each parent shows `replies`. Cached 2 minutes. The channel id must match `^[A-Z0-9]{1,32}$` (400).
- `GET .../conversations/:channel/threads/:ts`: `conversations.replies` (limit 100). `ts` must match `^\d+\.\d+$` (400).
- `resolveMentions` turns `<@U…>` into `@name`.

Send: `POST .../conversations/:channel/messages` (JSON) `{text, threadTs?}` → 201 `{ts}`. `chat.postMessage` as the user. The text is trimmed, non-empty (400), and at most 4000 characters (400). The channel's message and reply cache entries are dropped. The card then reloads with `refresh`. The draft is kept when Slack refuses.

Errors (`api.ts`): HTTP 429 gives 429 with `Retry-After`. A network failure gives 502. Slack error codes: `invalid_auth`, `not_authed`, `token_revoked`, `token_expired`, `account_inactive` give 401. `missing_scope` gives 403. `not_in_channel`, `channel_not_found` give 404. `ratelimited` gives 429. Any other code gives 502.

Cache keys: `conversations:<account>`, `messages:<account>:<channel>`, `replies:<account>:<channel>:<ts>`, `unread:<account>`, `unreplied:<account>`, `users:<team id>`. Time to live: conversations 10 min; messages, replies, and unread 2 min; users 24 h.

Bots (read-only, deferred, bot-only): `slack_search` (`search.messages`, `count` up to 20, default 10, newest first) and `slack_read` (a channel id or a name, with optional `thread_ts`; 30 messages, or the last 100 replies). `slack_unreplied` (`unrepliedMessages`): the messages from others that the user has not answered, in the first 40 conversations, newest first, each with its conversation. `query` keeps the messages that contain all its words; `count` up to 30, default 10. It sends and marks nothing. `account` may be left out when one account is connected.

Sync: the app and accounts go to `slack-app/` and `slack/` (GitHub's copy wins on conflict). The Slack cache goes to `slack-cache/` (the newer read wins). A `slack.json` entry that fails its checks stops the sync (409).

Gotchas:
- `deleteSlackAccount` drops every key of the account: `conversations:`, `messages:`, `replies:`, `unread:`, and `unreplied:`.

## 26. Spending
Card: `features/spending/SpendingCard.tsx`, `AddSpendingDialog.tsx`, `useSpending.ts`. Backend: `app/spending.ts`, `storage/spending.ts` (table `spending_entries`).

- `GET /api/spending` → `{entries}`, newest first.
- `POST /api/spending` `{kind, category, amount, description?, id?}` → 201 with the saved entry. `kind` is `income` or `expense`. `category` is trimmed, required, at most 40 characters. A name typed in another case uses the existing spelling. `amount` is above 0. `description` is at most 200 characters. An `id` at most 64 characters replaces that entry and keeps its first `createdAt`. Without an id a UUID is made.
- Agents: `spending_upsert` (deferred, agent-only) adds or changes an entry by id. Its result is `Saved <id>: ...`.
- Bots: `spending_list` (deferred, bot-only) returns totals for income, expense, and balance, totals per category and kind, and the newest entries (default 10, at most 50). It can filter by category and kind.
- Sync: `spending/` (flow 15). Entries are matched by id. A same-id edit made on both sides keeps GitHub's copy. A removal on GitHub removes the local entry.

## 27. System update and restart
Entry: the Settings update tab (`features/settings/UpdateTab.tsx`).
- `POST /api/system/update` (JSON) → 200 `{output}`. `pullLatest` runs `git -C <repo root> pull --ff-only`. The repo root is three folders above `dist/backend/app/system.js`. A git failure is a 500 with git's message.
- `POST /api/system/restart` (JSON) → 202 `{restarting: true}`. `restartMip` starts a detached `sh` that:
  1. waits for this process to exit,
  2. changes to the repo root,
  3. runs `npm install && npm run build`, appending output to `MIP_HOME/restart.log`,
  4. runs `exec node dist/backend/http/server.js`, appending output to the same log.
  This process calls `process.exit(0)` 300 ms later. The server starts even when install or build fails.
- The dashboard checks again after a delay, so the restarted server is found.

