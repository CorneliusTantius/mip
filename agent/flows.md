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
1. `POST /api/room/messages` → `postToRoom` (`app/room/room.ts`). Rejects with 409 when the room is busy, 400 for empty or over 4000 characters.
2. Saves the user message. With no bots, adds a system message and stops.
3. `mentionedBots` (`app/room/engine.ts`) finds `@Name` for bots in the text. Queue = those bots, or all bots in order if none.
4. `busy = true`. `converseRoom` (`app/room/engine.ts`) runs turns from the queue:
   - each turn calls `runTurn` (`room.ts`): prompt = last 30 room messages, "You are X", other bots; system prompt = bot persona + room rules; no tools;
   - reply `PASS` or empty → silent, and its mentions are not queued (`isSilent`, );
   - a reply's `@mentions` of other bots are queued (not self, not already waiting);
   - a provider error → system message "X couldn't reply: …" and stop;
   - after 8 turns (`MAX_TURNS`, `room.ts`) → system message "Paused after 8 turns…".
5. Each reply is saved with `addRoomMessage`. `busy` is cleared in `finally`.
Client (`features/bots/useRoom.ts`): polls `GET /api/room?after=<id>` every 1.5 s. Only new messages come back. `send` posts and then polls.

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
- **What syncs:** personas, bots (with their colors), notes, agents with their messages, and the room. **Not:** provider logins (`sessions/`), repo clones, agent workspaces, the default-persona flag, and the provider session id (so a synced agent starts a new model conversation on another machine).
- **Limits:** the later edit is decided by each machine's clock. An agent with a running run is not deleted by a sync. A persona still used by an agent is not deleted.
- Tests: `app/sync/github.test.mjs` (reading gh's accounts and picking one), `app/sync/merge.test.mjs` (the rules), and `app/sync/sync.test.mjs` (two machines and a local bare repo, through real git). Neither needs GitHub. The GitHub calls (`gitHubAccount`, `ensureRepo`) are checked only by hand, with a real `gh` login.

## 17. Tool calls
- **Recording.** `runs.ts` `execute` keeps a `ToolCallLog` (`app/tools/calls.ts`). A `tool_call` event starts a call with its input as JSON text. A `tool_result` event attaches its output and error flag, matched by the call's id. The reply saves the list in `messages.calls` with the tool names. Text longer than 8000 characters is cut with a marker.
- **Reply button.** `Transcript.tsx` puts "View tool calls (n)" at the bottom of a reply that used tools. `ToolCallsDialog.tsx` lists each call's input and result with `ui/ToolCallDetails.tsx`. A reply saved before details were recorded lists its names only.
- **Live.** `useTranscript.ts` builds the same list while a reply streams, from `tool_call` and `tool_result` events.
- **Tools card.** `features/tools/ToolsCard.tsx` lists the tool registry from `GET /api/tools`: each tool with whether agents and bots may use it. The All / Agent / Bot pill filters the list, the same way as the Skills card. Collapsed, it shows four. Clicking a tool opens its description, guide, and inputs in a dialog.
- **Not synced.** Tool details stay on the machine that ran them. The GitHub sync carries tool names but not calls.

## 18. Tool search
- **Offered and deferred.** `app/tools/index.ts` splits the registry. `BASIC_TOOLS` (bash, read, edit, write, skill_read) are offered to every agent run. `DEFERRED_TOOLS` (the three memory tools and skill_file) are not. The two search tools, `tool_search` and `tool_call`, are offered.
- **An agent run.** `runs.ts` passes `AGENT_TOOLS` as the offered list and `AGENT_DEFERRED` as the deferred list, to the run's token and to the provider. The system prompt gets the guides of the offered tools (`toolGuidesPrompt`), including the `tool_search` guide, which tells the model that more tools exist and how to find them.
- **tool_search.** `searchTools` scores each deferred tool by the words in its name (two points) and description (one point), best first, up to eight. The reply lists each match with its inputs.
- **tool_call.** Runs one deferred tool by name with its inputs. It refuses any name not in the run's deferred list, so a basic tool, or a tool a bot was not given, is never run this way.
- **Other providers.** Claude gets the search tools through `/mcp`, and the deferred list is read from the run's token. Pi gets them as custom tools, with `deferredTools` in its context.
- **Guides.** Every tool has a `guide`. `runs.ts` puts the guides of the tools a run is offered into the system prompt (`toolGuidesPrompt`). A deferred tool's guide is in the `tool_search` result, so it reaches the model when the tool is found.
- **Not built.** Code mode, and external MCP servers. Code mode needs a sandbox first.

## 16. Skills
Skills tab: `features/skills/SkillsCard.tsx` (the All / Agent / Bot pill: installed skills, the skills each agent has, or each bot's skills, which is none yet), `CreateSkillDialog.tsx` and `ImportSkillDialog.tsx`, `useSkills.ts`. Agent: the **Skills** button → `features/agent/AgentSkillsDialog.tsx` → `PUT /api/agents/:id/skills`.

- **Import.** `POST /api/skills/imports` → `stageImport`: a full folder path, not a symbolic link, with a SKILL.md at the top. Every file is copied into `skills/.staging/<id>` and checked: text types only, at most 50 files and 512 KB, no links, and a valid header (`parseSkill`). Nothing is installed yet. `confirmImport` moves the staged folder into `skills/<name>/` and replaces any skill with that name. Agents keep their enablement. Staged imports older than a day are cleared.
- **Create.** `POST /api/skills` → `createSkill` (`app/skills/create.ts`): the name must be valid, the description one line and not empty, and the instructions not empty. It writes `SKILL.md` into `skills/<name>/` in the same header form an import reads, and refuses a name that is installed (409). It writes no `.mip-source.json`, since there is no source folder.
- **Enable.** `setAgentSkills` checks each name is installed, then replaces the agent's rows in `skill_enablements`. Removing a skill deletes its rows. Deleting an agent deletes its rows.
- **A run.** `runs.ts` adds `skillsPrompt(agentId)` to the system prompt: the enabled skills' names and descriptions, nothing more. The run's token carries the agent id and the tool list (`AGENT_TOOLS`).
- **Reading.** The model calls `skill_read(name)`. `enabledSkill` refuses a skill the agent did not enable, and otherwise returns the body and the list of files. `skill_file(name, path)` checks the same, then `readSkillFile` allows only the paths the listing shows, relative and within the skill, with a 64 KB cap.
- **Other agents.** Claude runs with `--disable-slash-commands`, and Pi with `noSkills: true`. Neither reads its own skill folders.
- Tests: `app/skills/format.test.mjs` (the header and file rules) and `app/skills/skills.test.mjs` (import review, refusals, enablement, the tools, the tool lists, and removal), both with a temporary `MIP_HOME`.
