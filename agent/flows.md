# Flows

Each flow lists its steps in order, with the function that does each step.

## 1. Server start
1. `http/server.ts:26` creates the HTTP server. Requests go to `handle` (`server.ts:11`).
2. Importing `storage/db.ts` opens `data/mip.db`, creates tables, adds missing columns (`db.ts:95-111`), and recovers stale runs and clones (`db.ts:114-115`).
3. Importing `app/personas.ts` seeds the built-in persona `default` if missing, and makes one persona the default if none is (`personas.ts:29-32`).
4. `app/providers.ts:9-12` constructs both providers with their folders.
5. `server.ts:26` listens on `127.0.0.1:PORT`.

## 2. Request handling
1. `GET` and not `/api/...`: try `serveStatic` (`http/static.ts:18`) over `dist/frontend`. A miss falls through.
2. `POST /mcp`: `handleMcp` (`http/mcp.ts:7`). It needs a bearer token from a live run, else 401.
3. Otherwise `matchRoute` (`http/router.ts:28`) over `routes` (`http/routes/index.ts:13`). No match gives `404 {"error":"not found"}`.
4. The handler returns a `Reply` (`http/respond.ts`). `sendJson` writes it.
5. A thrown `AppError` (`app/errors.ts:2`) gives its status and `{error}`. Other errors give 500 and `{error}`.

## 3. Send a chat message (run)
Server side:
1. `POST /api/run` → `routes/runs.ts:7` → `startRun` (`app/runs.ts:16`).
2. `startRun` checks: session exists (404), prompt non-empty (400), no active run in this chat (409). Then `createRun` (status `running`), `addMessage` (user), `workspaceFor` (creates the folder), `registerRun` (token). Returns `runId` with 202. `execute` starts in the background.
3. `execute` (`app/runs.ts:56`) calls `provider.run` with: `prompt`; `systemPrompt` = persona prompt + repository note + recalled memory (`personaPrompt`, `repoNote`, `recallFor`); `tools: TOOLS`; `workspace`; `toolServer` = `http://127.0.0.1:PORT/mcp` + token; `model`, `thinking`; `sessionId` = the saved provider session (to resume).
4. Each event is saved with `appendRunEvent` (sequence number `seq`). The loop collects text, tool names, error, and the provider session id from `done`.
5. `finally`: `releaseRun(token)`. Then `addMessage` (assistant: text, tools, error), `saveProviderSession`, `setRunStatus` (`done` or `error`).

Client side (`features/chat/useTranscript.ts`):
1. `send` (`:70`) posts `/api/run`, appends the user message locally, then calls `follow`.
2. `follow` (`:31`) appends an empty assistant message and polls `GET /api/runs/:id/events?after=<seq>` every 600 ms (`POLL_MS`). `applyEvent` (`:23`) adds text, tool badges, and errors to that last message.
3. When status is no longer `running`, `load` (`:61`) refetches the chat, which replaces the streamed text with the saved messages. `onRunSaved` refreshes the chat list.

Reopening a chat: `load` gets `activeRunId` from `GET /api/sessions/:id`, and if set, `follow` resumes from `seq` 0. So a run keeps going after the page closes.

## 4. Claude provider run (`adapters/claude-cli.ts:251`)
- Args: `-p <prompt> --output-format stream-json --verbose --include-partial-messages`.
- With tools: `--mcp-config` (`mcpConfig`, `:118`), `--strict-mcp-config`, `--tools ""`, `--allowedTools mcp__mip__<name>...`. With an empty tool list: `--tools ""` only.
- `--model`, `--effort <thinking>`, `--system-prompt <text> --system-prompt-snapshot off`.
- New chat: `--session-id <uuid>`. Existing: `--resume <id>`.
- Environment (`cliEnv`, `:58`): drops `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN`, sets `CLAUDE_CONFIG_DIR`. Subscription login is used.
- Stdout lines are parsed by `parseStreamLine` (`:79`) into events. Timeout 300 s (`defaultTimeoutMs`).

## 5. Pi provider run (`adapters/pi.ts:204`)
- Opens or creates a Pi session in `sessions/pi`. Resource loader with `noContextFiles: true` and the system prompt.
- `createAgentSession` with `noTools: "builtin"` and `customTools` = app tools wrapped by `toPiTool`.
- Pi events go through `toAppEvent` (`:78`): text deltas, tool start and end.

## 6. Tool call from the Claude CLI
1. The CLI posts JSON-RPC to `/mcp` with `Authorization: Bearer <token>`.
2. `handleMcp` (`http/mcp.ts:7`) maps the token to a workspace (`workspaceForToken`, `app/tools/index.ts:41`). Unknown token: 401.
3. `tools/list` returns `TOOLS` (name, description, inputSchema). `tools/call` runs `findTool` then `tool.run(args, {workspace})`.
4. The result is `{content:[{type:"text",text}], isError}`.
Tokens are removed when the run ends, so a late call fails.

## 7. Memory
- Write (dashboard only): `POST /api/memory` → `writeNote` (`app/memory.ts:24`). Parses `[[Title]]` links (`LINK`, line 6) and `#tags` (`TAG`, line 7). Titles are case-insensitive. An existing title keeps its id, so the note is replaced. `saveNote` (`storage/notes.ts:16`) writes notes, FTS, links and tags in one transaction.
- Agent write: `memory_edit` (`app/tools/memory.ts:46`) changes one exact, unique piece of an existing note. It can't create or delete notes.
- Read by agents: `memory_search` (`searchMemory`, `memory.ts:43`), `memory_read` (`readNote`, `memory.ts:36`).
- Automatic recall: `recallFor(prompt)` (`memory.ts:83`) searches the prompt (words of 4+ characters, 5 notes) and puts snippets in the system prompt. Runs do this. Room turns do not.
- Graph for the card: `GET /api/graph` → `memoryGraph` (`memory.ts:55`). Link targets with no note become "missing" nodes.

## 8. Room (bots)
1. `POST /api/room/messages` → `postToRoom` (`app/room.ts:28`). Rejects with 409 when the room is busy, 400 for empty or over 4000 characters.
2. Saves the user message. With no bots, adds a system message and stops.
3. `mentionedBots` (`room-engine.ts:9`) finds `@Name` for bots in the text. Queue = those bots, or all bots in order if none.
4. `busy = true`. `converseRoom` (`room-engine.ts:39`) runs turns from the queue:
   - each turn calls `runTurn` (`room.ts:67`): prompt = last 30 room messages, "You are X", other bots; system prompt = bot persona + room rules; no tools;
   - reply `PASS` or empty → silent, and its mentions are not queued (`isSilent`, `:20`);
   - a reply's `@mentions` of other bots are queued (not self, not already waiting);
   - a provider error → system message "X couldn't reply: …" and stop;
   - after 8 turns (`MAX_TURNS`, `room.ts:9`) → system message "Paused after 8 turns…".
5. Each reply is saved with `addRoomMessage`. `busy` is cleared in `finally`.
Client (`features/bots/useRoom.ts`): polls `GET /api/room?after=<id>` every 1.5 s. Only new messages come back. `send` (`:49`) posts and then polls.

## 9. Mention autocomplete (client)
- `mentionAt(text, caret)` (`features/bots/mentions.ts:12`) finds an `@partial` at the caret.
- `suggestions` (`:19`) lists bots whose names start with it. A fully typed name hides the list, so Enter sends.
- `MentionInput` (`features/bots/MentionInput.tsx`): arrows move, Enter or Tab picks (`completeMention`, `:27`), Escape hides.

## 10. Chats
- Create: `POST /api/sessions` → `createChat` (`app/sessions.ts:14`). Validates provider and persona. Name from `pickAgentName` (`app/names.ts:51`), unused by current chats.
- Update: `PATCH /api/sessions/:id` → `updateChat` (`:29`). Title non-empty. Model must be in the provider's current catalog. Thinking must be one the model accepts. When a new model lacks the chat's thinking level, the level is cleared.
- Delete: `DELETE` → `deleteChat` (`:59`). 409 if a run is active. Removes DB rows, then the workspace.
- New chats use the default persona (`defaultPersona`, `personas.ts:38`). The persona is fixed for the chat's life. Its text is read on each run (`personaPrompt`, `:47`), so edits apply to the next message.

## 11. Personas
- Create `createPersona` (`personas.ts:51`), edit `editPersona` (`:57`), set default `makeDefaultPersona` (`:64`), delete `removePersona` (`:70`).
- Delete refused: the built-in `default` (400), the current default (400), a persona some chat uses (409).

## 12. Repositories
- Add: `POST /api/repos` → `addRepo` (`app/repos.ts:78`). `withScheme` (`:18`) adds https to bare host links. `CLONE_LINK` (line 12) checks the link. The name comes from the link and must match `FOLDER_NAME` (line 14). A duplicate name gives 409. Status starts `cloning`, and `git clone` runs in the background with `runGit` (`app/git.ts:5`). On failure the partial folder is removed and the error is saved.
- List: `listRepoCards` (`:46`) adds the branch (`git rev-parse --abbrev-ref HEAD`) and the chats whose workspace has `<name>/.git`.
- Pull all: `pullAllRepos` (`:61`). `git pull --ff-only` on each ready repo. Result per repo: "already up to date" or "updated to the latest commit", or git's error.
- Copy into a chat: `copyRepoToChat` (`:102`). Clones the master into `workspaces/<chat>/<name>`, then sets `origin` back to the real link.
- Remove: `removeRepo` (`:120`). Refused while cloning (409). Deletes the master folder. Chat copies stay.
- Each run is told which repositories are in its workspace: `repoNote` (`:128`).

## 13. Provider sign-in
- Settings → `ProviderTab` polls `GET /api/providers` every 2 s while open.
- Sign-in: `POST .../targets/:target/sign-in {method}` → `signIn` → adapter `startSignIn`. Claude runs `claude auth login --claudeai`. Pi runs `runtime.login` with OAuth or API key, and asks for input through prompts.
- Output and prompts come back in `targets[].progress`. Answers: `POST .../answer {answer}` → `answerSignIn`.
- Sign-out: `POST .../sign-out` → `signOut`. The dashboard asks first (`confirmSignOut`, `features/settings/SignInPanel.tsx`).
- Models: `provider.models()`. Claude asks the CLI over its control channel (`listModels`, `claude-cli.ts:157`). Pi lists models of signed-in providers.

## 14. Dashboard events and layout
- Chat list changes → `announce(CHATS_CHANGED)` → repositories card reloads (`api/events.ts`).
- Persona saved or deleted → `announce(PERSONAS_CHANGED)` → chat list reloads its persona dropdown.
- Memory saved or deleted → `MemoryDialog` `onChange` → `App` bumps `memoryVersion` → `MemoryCard` reloads its graph.
- Memory dot clicked → `openMemory(title)` in `App.tsx` → `MemoryDialog` opens that note.
