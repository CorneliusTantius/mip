# Flows

Each flow lists its steps in order, with the function that does each step.

## 1. Server start
1. `http/server.ts` creates the HTTP server. Requests go to `handle` (`server.ts`).
2. Importing `storage/db.ts` opens `data/mip.db`, creates tables, adds missing columns (`db.ts`), and recovers stale runs and clones (`db.ts`).
3. Importing `app/personas.ts` seeds the built-in persona `default` if missing, and makes one persona the default if none is (`personas.ts`).
4. `app/providers.ts` constructs both providers with their folders.
5. `server.ts` listens on `127.0.0.1:PORT`.

## 2. Request handling
1. `GET` and not `/api/...`: try `serveStatic` (`http/static.ts`) over `dist/frontend`. A miss falls through.
2. `POST /mcp`: `handleMcp` (`http/mcp.ts`). It needs a bearer token from a live run, else 401.
3. Otherwise `matchRoute` (`http/router.ts`) over `routes` (`http/routes/index.ts`). No match gives `404 {"error":"not found"}`.
4. The handler returns a `Reply` (`http/respond.ts`). `sendJson` writes it.
5. A thrown `AppError` (`app/errors.ts`) gives its status and `{error}`. Other errors give 500 and `{error}`.

## 3. Send an agent message (run)
Server side:
1. `POST /api/run` → `routes/runs.ts` → `startRun` (`app/runs.ts`).
2. `startRun` checks: agent exists (404), prompt non-empty (400), no active run in this agent (409). Then `createRun` (status `running`), `addMessage` (user), `workspaceFor` (creates the folder), `registerRun` (token). Returns `runId` with 202. `execute` starts in the background.
3. `execute` (`app/runs.ts`) calls `provider.run` with: `prompt`; `systemPrompt` = persona prompt + repository note + recalled memory (`personaPrompt`, `repoNote`, `recallFor`); `tools: TOOLS`; `workspace`; `toolServer` = `http://127.0.0.1:PORT/mcp` + token; `model`, `thinking`; `sessionId` = the saved provider session (to resume).
4. Each event is saved with `appendRunEvent` (sequence number `seq`). The loop collects text, tool names, error, and the provider session id from `done`.
5. `finally`: `releaseRun(token)`. Then `addMessage` (assistant: text, tools, error), `saveProviderSession`, `setRunStatus` (`done` or `error`).

Client side (`features/agent/useTranscript.ts`):
1. `send` posts `/api/run`, appends the user message locally, then calls `follow`.
2. `follow` appends an empty assistant message and polls `GET /api/runs/:id/events?after=<seq>` every 600 ms (`POLL_MS`). `applyEvent` adds text, tool badges, and errors to that last message.
3. When status is no longer `running`, `load` refetches the agent, which replaces the streamed text with the saved messages. `onRunSaved` refreshes the agent list.

Reopening an agent: `load` gets `activeRunId` from `GET /api/agents/:id`, and if set, `follow` resumes from `seq` 0. So a run keeps going after the page closes.

## 4. Claude provider run (`adapters/claude-cli.ts`)
- Args: `-p <prompt> --output-format stream-json --verbose --include-partial-messages`.
- With tools: `--mcp-config` (`mcpConfig`, ), `--strict-mcp-config`, `--tools ""`, `--allowedTools mcp__mip__<name>...`. With an empty tool list: `--tools ""` only.
- `--model`, `--effort <thinking>`, `--system-prompt <text> --system-prompt-snapshot off`.
- New agent: `--agent-id <uuid>`. Existing: `--resume <id>`.
- Environment (`cliEnv`, ): drops `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN`, sets `CLAUDE_CONFIG_DIR`. Subscription login is used.
- Stdout lines are parsed by `parseStreamLine` into events. Timeout 300 s (`defaultTimeoutMs`).

## 5. Pi provider run (`adapters/pi.ts`)
- Opens or creates a Pi session in `sessions/pi`. Resource loader with `noContextFiles: true` and the system prompt.
- `createAgentSession` with `noTools: "builtin"` and `customTools` = app tools wrapped by `toPiTool`.
- Pi events go through `toAppEvent`: text deltas, tool start and end.

## 6. Tool call from the Claude CLI
1. The CLI posts JSON-RPC to `/mcp` with `Authorization: Bearer <token>`.
2. `handleMcp` (`http/mcp.ts`) looks up the token's run context with `runContextForToken` (`app/tools/index.ts`): workspace, agent, offered tools, and deferred tools. Unknown token: 401.
3. `tools/list` returns the run's offered tools (name, description, inputSchema). `tools/call` runs one of them with the run's workspace, agent, and deferred list. A deferred tool is run through `tool_call`, not called directly.
4. The result is `{content:[{type:"text",text}], isError}`.
Tokens are removed when the run ends, so a late call fails.

## 7. Memory
- Write (dashboard only): `POST /api/memory` → `writeNote` (`app/memory.ts`). Parses `[[Title]]` links (`LINK`) and `#tags` (`TAG`). Titles are case-insensitive. An existing title keeps its id, so the note is replaced. `saveNote` (`storage/notes.ts`) writes notes, FTS, links and tags in one transaction.
- Agent write: `memory_edit` (`app/tools/memory.ts`) changes one exact, unique piece of an existing note. It can't create or delete notes.
- Read by agents: `memory_search` (`searchMemory`, `memory.ts`), `memory_read` (`readNote`, `memory.ts`).
- Automatic recall: `recallFor(prompt)` (`memory.ts`) searches the prompt (words of 4+ characters, 5 notes) and puts snippets in the system prompt. Runs do this. Room turns do not.
- Graph for the card: `GET /api/graph` → `memoryGraph` (`memory.ts`). Link targets with no note become "missing" nodes.

## 8. Room (bots)
1. `POST /api/room/messages` with `{room, text}` → `postToRoom` (`app/room/room.ts`). Rejects with 404 for a room that does not exist, 409 when that room is busy, 400 for empty or over 4000 characters.
2. Saves the user message in the room. With no bots in the room, adds a system message and stops.
3. `mentionedBots` (`app/room/engine.ts`) finds `@Name` for the room's bots in the text. Queue = those bots, or all the room's bots in order if none.
4. The room is marked busy (`talking` in `room.ts`). `converseRoom` (`app/room/engine.ts`) runs turns from the queue:
   - each turn calls `runTurn` (`room.ts`): prompt = last 30 messages of that room, "You are X", the room's other bots; system prompt = bot persona, the room's rules (which name the room), and the guides of `BOT_TOOLS`; tools = `BOT_TOOLS` through a run token that carries the room id and is released when the turn ends; the reply and its tool calls are saved as the bot's message;
   - reply `PASS` or empty → silent, and its mentions are not queued (`isSilent`, );
   - a reply's `@mentions` of other bots are queued (not self, not already waiting);
   - a provider error → system message "X couldn't reply: …" and stop;
   - after 8 turns (`MAX_TURNS`, `room.ts`) → system message "Paused after 8 turns…".
5. Each reply is saved with `addRoomMessage` in the room. The room's busy mark is cleared in `finally`. Other rooms are not held up.
Client (`features/bots/useRoom.ts`): polls `GET /api/room?room=<id>&after=<id>` every 1.5 s for the room on screen. Only new messages come back. Switching rooms drops the old room's messages. `send` posts to the room on screen and then polls. Rooms and bots load in `useRooms.ts`. Rooms themselves: `GET` and `POST /api/rooms`, and `PUT` and `DELETE /api/rooms/:id` (`app/room/rooms.ts`).

## 9. Mention autocomplete (client)
- `mentionAt(text, caret)` (`features/bots/mentions.ts`) finds an `@partial` at the caret.
- `suggestions` lists bots whose names start with it. A fully typed name hides the list, so Enter sends.
- `MentionInput` (`features/bots/MentionInput.tsx`): arrows move, Enter or Tab picks (`completeMention`, ), Escape hides.
- `splitMentions` (`features/bots/mentions.ts`) splits a shown message into text and bot mentions, matched the way the server matches them. `MessageText` draws each mention as a pill in the bot's color. A click opens `BotProfileModal`.

## 10. Agents
- Create: `POST /api/agents` → `createAgent` (`app/agents.ts`). Validates provider and persona. Name from `pickAgentName` (`app/names.ts`), unused by current agents.
- Update: `PATCH /api/agents/:id` → `updateAgent`. Title non-empty. Model must be in the provider's current catalog. Thinking must be one the model accepts. When a new model lacks the agent's thinking level, the level is cleared.
- Delete: `DELETE` → `deleteAgent`. 409 if a run is active. Removes DB rows, then the workspace.
- New agents use the default persona (`defaultPersona`, `personas.ts`). The persona is fixed for the agent's life. Its text is read on each run (`personaPrompt`, ), so edits apply to the next message.

## 11. Personas
- Create `createPersona` (`personas.ts`), edit `editPersona`, set default `makeDefaultPersona`, delete `removePersona`.
- Delete refused: the built-in `default` (400), the current default (400), a persona some agent uses (409).

## 12. Repositories
- Add: `POST /api/repos` → `addRepo` (`app/repos.ts`). `withScheme` adds https to bare host links. `CLONE_LINK` checks the link. The name comes from the link and must match `FOLDER_NAME`. A duplicate name gives 409. Status starts `cloning`, and `git clone` runs in the background with `runGit` (`app/git.ts`). On failure the partial folder is removed and the error is saved.
- List: `listRepoCards` adds the branch (`git rev-parse --abbrev-ref HEAD`) and the agents whose workspace has `<name>/.git`.
- Pull all: `pullAllRepos`. `git pull --ff-only` on each ready repo. Result per repo: "already up to date" or "updated to the latest commit", or git's error.
- Copy into an agent: `copyRepoToAgent`. Clones the master into `workspaces/<agent>/<name>`, then sets `origin` back to the real link.
- Remove: `removeRepo`. Refused while cloning (409). Deletes the master folder. Agent copies stay.
- Each run is told which repositories are in its workspace: `repoNote`.

## 13. Provider sign-in
- Settings → `ProviderTab` polls `GET /api/providers` every 2 s while open.
- Sign-in: `POST .../targets/:target/sign-in {method}` → `signIn` → adapter `startSignIn`. Claude runs `claude auth login --claudeai`. Pi runs `runtime.login` with OAuth or API key, and asks for input through prompts.
- Output and prompts come back in `targets[].progress`. Answers: `POST .../answer {answer}` → `answerSignIn`.
- Sign-out: `POST .../sign-out` → `signOut`. The dashboard asks first (`confirmSignOut`, `features/settings/SignInPanel.tsx`).
- Models: `provider.models()`. Claude asks the CLI over its control channel (`listModels`, `claude-cli.ts`). Pi lists models of signed-in providers.

## 14. Dashboard events and layout
- Agent list changes → `announce(AGENTS_CHANGED)` → repositories card reloads (`api/events.ts`).
- Persona saved or deleted → `announce(PERSONAS_CHANGED)` → agent list reloads its persona dropdown.
- Provider signed in or out, or a sign-in ends (`ProviderTab` sees the state change, and closing Settings also announces) → `announce(PROVIDERS_CHANGED)` → agent list reloads the providers, so the session models follow.
- Memory saved or deleted → `MemoryManager` `onChanged` → `MemoryBody` reloads its graph (`features/memory/MemoryCard.tsx`).
- Memory dot clicked → `MemoryBody` sets `startNote` and calls `open()` from `useCardExpansion` → the card expands into `MemoryManager`, which opens that note.

## 15. GitHub sync
Settings → Sync (`features/settings/SyncTab.tsx`, `useSync.ts`) → `/api/sync*` (`http/routes/sync.ts`) → `app/sync/engine.ts`.

- **Account.** `listAccounts` reads `gh auth status` (text, since this gh has no JSON form). `pickAccount` uses the account chosen in Settings while gh still has it, otherwise gh's active account. `startSync` gets that account's token with `gh auth token --user` and checks it with `GET /user`. mip stores no token, so each run asks gh again. The dropdown's choice is saved in `sync/state.json`. Switching is refused while a sync runs.
- **Sync run.** `startSync` runs `runInBackground`: `ensureRepo` checks `dotmip` (creates it private with `auto_init` on a 404, and refuses a public one), then `syncWith` runs:
  1. `fetchRepo`: clone, or fetch (pruning) and check out `origin/main`. A different URL, meaning another account, makes a fresh clone. An empty remote just points HEAD at `main`.
  2. Read the three snapshots: the remote (`readTree`), the base (`base.json`, the state at the last successful sync with this repo; another repo's base is ignored), and this machine (`readLocal`).
  3. Refuse when this database is empty but the base had data (wrong `MIP_HOME`).
  4. `mergeSnapshots` (`app/sync/merge.ts`), per record: unchanged on both sides keeps it; changed on one side takes that side; changed on both takes the later change time, except that an edit beats a delete, and an agent keeps both sides' messages. Room messages are the union.
  5. `applySnapshot` writes the merge to the database, `readLocal` reads it back, `writeTree` writes the files, and `commitAndPush` commits and pushes.
  6. A rejected push means `main` moved. The run fetches and merges again, up to three times. On success `base.json` becomes the merged state.
- **What syncs:** personas, bots (with their colors), notes, MCP servers from mcp.json (tokens included), Pi's credentials and model catalogs (keys included), Pi's settings.json and models.json, agents with their messages, and the rooms: each room's name and bots, and every room message with its room. A deleted room takes its messages with it. **Not:** provider logins (`sessions/`), repo clones, agent workspaces, the default-persona flag, and the provider session id (so a synced agent starts a new model conversation on another machine).
- **Limits:** the later edit is decided by each machine's clock. An agent with a running run is not deleted by a sync. A persona still used by an agent is not deleted.
- Tests: `app/sync/github.test.mjs` (reading gh's accounts and picking one), `app/sync/merge.test.mjs` (the rules), and `app/sync/sync.test.mjs` (two machines and a local bare repo, through real git). Neither needs GitHub. The GitHub calls (`gitHubAccount`, `ensureRepo`) are checked only by hand, with a real `gh` login.

## 17. Tool calls
- **Recording.** `runs.ts` `execute` keeps a `ToolCallLog` (`app/tools/calls.ts`). A `tool_call` event starts a call with its input as JSON text. A `tool_result` event attaches its output and error flag, matched by the call's id. The reply saves the list in `messages.calls` with the tool names. Text longer than 8000 characters is cut with a marker.
- **Reply button.** `Transcript.tsx` and the room's `RoomTranscript.tsx` put "View tool calls (n)" at the bottom of a reply that used tools. `ui/ToolCallsDialog.tsx` lists each call's input and result with `ui/ToolCallDetails.tsx`. A reply saved before details were recorded lists its names only. Calls stay on this machine: sync does not carry them, for agents or for the room.
- **Live.** `useTranscript.ts` builds the same list while a reply streams, from `tool_call` and `tool_result` events.
- **Tools card.** `features/tools/ToolsCard.tsx` lists the tool registry from `GET /api/tools`: each tool with whether agents and bots may use it. The All / Agent / Bot pill filters the list. Collapsed, it shows four. Clicking a tool opens its description, guide, and inputs in a dialog.
- **Not synced.** Tool details stay on the machine that ran them. The GitHub sync carries tool names but not calls.

## 18. Tool search
- **Offered and deferred.** `app/tools/index.ts` splits the registry. `BASIC_TOOLS` (bash, read, edit, write, skill_search, skill_read, ask_user) are offered to every agent run. `DEFERRED_TOOLS` (the three memory tools and skill_file) are not. The two search tools, `tool_search` and `tool_call`, are offered.
- **An agent run.** `runs.ts` passes `AGENT_TOOLS` as the offered list and `AGENT_DEFERRED` as the deferred list, to the run's token and to the provider. The system prompt gets the guides of the offered tools (`toolGuidesPrompt`), including the `tool_search` guide, which tells the model that more tools exist and how to find them.
- **tool_search.** `searchTools` scores each deferred tool by the words in its name (two points) and description (one point), best first, up to eight. The reply lists each match with its inputs.
- **tool_call.** Runs one deferred tool by name with its inputs. It refuses any name not in the run's deferred list, so a basic tool, or a tool a bot was not given, is never run this way.
- **Other providers.** Claude gets the search tools through `/mcp`, and the deferred list is read from the run's token. Pi gets them as custom tools, with `deferredTools` in its context.
- **Guides.** Every tool has a `guide`. `runs.ts` puts the guides of the tools a run is offered into the system prompt (`toolGuidesPrompt`). A deferred tool's guide is in the `tool_search` result, so it reaches the model when the tool is found.
- **Not built.** Code mode. It needs a sandbox first.

## 16. Skills
Skills card: `features/skills/SkillsCard.tsx` (the installed skills, with Create, Import, and Remove), `CreateSkillDialog.tsx` and `ImportSkillDialog.tsx`, `useSkills.ts`. Every agent and bot can use every installed skill, so the card lists no per-agent or per-bot skills.

- **Import.** `POST /api/skills/imports` → `stageImport`: a full folder path, not a symbolic link, with a SKILL.md at the top. Every file is copied into `skills/.staging/<id>` and checked: text types only, at most 50 files and 512 KB, no links, and a valid header (`parseSkill`). Nothing is installed yet. `confirmImport` moves the staged folder into `skills/<name>/` and replaces any skill with that name. Agents keep their enablement. Staged imports older than a day are cleared.
- **Create.** `POST /api/skills` → `createSkill` (`app/skills/create.ts`): the name must be valid, the description one line and not empty, and the instructions not empty. It writes `SKILL.md` into `skills/<name>/` in the same header form an import reads, and refuses a name that is installed (409). It writes no `.mip-source.json`, since there is no source folder.
- **Search and read.** Every agent and bot can search all installed skills. `skill_search(query)` matches the words against each skill's name and description, best match first. `skill_read(name)` returns the body and the list of files. `skill_file(name, path)` reads one listed file. The tools do not check who is asking.
- **A run.** The system prompt does not list skills. The guides of `skill_search` and `skill_read` tell the model to search first. The run's token carries the agent id and the tool list (`AGENT_TOOLS`). A bot turn uses `BOT_TOOLS`.
- **The / command.** In an agent's message box, typing `/` at the start lists the installed skills, and picking one puts `/name ` in the box. When the message is sent, `runs.ts` passes the prompt through `withSkillCommand`: a leading `/name` for an installed skill becomes that skill's instructions, followed by the rest of the message. The saved message is what was typed. A `/` that matches no installed skill is sent as it is. Rooms have no `/` command.
- **Other agents.** Claude runs with `--disable-slash-commands`, and Pi with `noSkills: true`. Neither reads its own skill folders.
- Tests: `app/skills/format.test.mjs` (the header and file rules) and `app/skills/skills.test.mjs` (import review, refusals, search, the `/name` command, the tools, the tool lists, and removal), both with a temporary `MIP_HOME`. The dropped per-agent and per-bot skill tables are checked by `storage/db.test.mjs`.

## 19. Asking the user (ask_user)

1. The model calls `ask_user` (`app/tools/ask.ts`, offered to every agent). The input is a question and a kind: `choice` (one of 2 to 8 options), `multi` (any of them), `text` (a short answer with a placeholder), or `slider` (min, max, step, value). Bad input comes back as a failed result.
2. The tool keeps the question in a map keyed by agent id. A run asks one question. A second one is refused until the reply takes the first.
3. When the run ends, `execute` in `app/runs.ts` calls `takePendingAsk` and saves the question on the reply (`messages.ask`). The reply's text is what came before the question, and the controls show under it.
4. The run does not wait. The answer is the user's next message, sent through the normal send path. `AskCard` (`features/agent/AskCard.tsx`) draws the controls. They are disabled while the agent is busy, and once a user message follows the question.

## 20. Bots sending tasks to agents (agent_ask)

1. An agent is closed to bots until its switch is on: "Bots may ask" in the composer, which sets `agents.open_to_bots` through `PATCH /api/agents/:id`.
2. A bot calls `agents_list` for the open agents, then `agent_ask` with an agent's name and a task. Both are bot-only tools in `app/tools/index.ts`.
3. `agent_ask` refuses a closed or unknown agent, an empty task, a call that is not a bot in a room, a room already sending a task, and an agent that is busy (`startRun` throws 409). A task that cannot start frees its room again.
4. The task becomes a user message in the agent's chat ("Odin in Work asks: ..."). The agent runs it with its own tools, bash included. The switch is the user's consent for that.
5. When the run ends, `onFinish` posts the reply to the room as an `agent` message (`storage/room.ts`) and frees the room. `onFinish` still runs if saving fails, so a room is never stuck.
6. The bot does not wait. It sees the reply in the room on a later turn. A question the agent asks during a delegated task appears in the agent's own chat, and the room gets only the final reply.

## 17. External MCP servers
- **Config.** `data/mcp.json` (`MCP_CONFIG_FILE`) holds a `mcpServers` map. A stdio entry has `command`, `args`, and `env`. An http entry has `url` and `headers`. `parseMcpConfig` checks each entry, and a bad one is reported by name.
- **Start.** `server.ts` calls `startMcpServers` once it is listening, so the dashboard is up while the servers start. Each server connects on its own: start, then list its tools, with 30 s for each step.
- **Tools.** Each tool becomes `mcp_<server>_<tool>`. `agentDeferredTools()` builds an agent run's deferred list when the run starts, so `tool_search` finds these tools and `tool_call` runs them. A failed result from the server comes back as a failed tool result.
- **Reload.** `POST /api/mcp/reload` closes every connection and starts again from the file. A run in progress keeps its tool list, so its calls to a closed server fail.
- **Bots.** A bot turn takes `botDeferredTools()` when it starts. Its `tool_search` and `tool_call` reach the MCP tools, the same as an agent's.
- **Sync.** The `mcp` part holds each server from mcp.json, with its tokens, as `mcp/<name>.json` in the dotmip repo. A sync that changes a server rewrites mcp.json (mode 600) after checking the new text loads, then reconnects the servers in the background. A server edited on both sides keeps GitHub's copy. A mcp.json with a problem stops the sync before anything changes.
- Tests: `app/mcp/mcp.test.mjs`, with a fake stdio server and a temporary `MIP_HOME`. The sync tests cover the `mcp` part across two machines (`app/sync/sync.test.mjs`, `merge.test.mjs`).

## 18. Pi's config
- **Where it lives.** `PI_CODING_AGENT_DIR` is set to `data/pi/` when the Pi provider is made, so Pi's settings and custom models are kept with mip's data. Pi's credentials and model catalogs go through two stores in `app/pi/store.ts` (`DbCredentialStore`, `DbModelsStore`), kept in `pi_credentials` and `pi_models`. Both are passed to `ModelRuntime.create`, so Pi never reads or writes `~/.pi`.
- **Writes.** Credential writes go through `modify`, one at a time per provider, so an OAuth refresh cannot race another write. Each write records its change time.
- **First start.** `importLegacyPiAuth` copies `~/.pi/agent/auth.json` once, when the credential table is empty. A flag in `pi_state` stops a second import, even after every credential is removed. The file is left as it is.
- **Sync.** Credentials and model catalogs are merged by change time, so the newer copy wins. `settings.json` and `models.json` have no change time, so GitHub's copy wins when both sides changed one. A sync that changes either file resets Pi's runtime, which reads `models.json` when it is made.
- **Permissions.** `mip.db` is set to mode 600, since it holds the credentials.
- Tests: `app/pi/pi-store.test.mjs` (the stores, the write order, the import), `adapters/pi-signin.test.mjs`, and the two-machine cases in `app/sync/sync.test.mjs`.
