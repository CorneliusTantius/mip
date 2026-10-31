# Backend modules

Format: `file` — purpose. Key exports (line). Touchpoints: who calls it, what it touches.

## http/
- `http/server.ts` — entry point. `handle` (:11): static → `/mcp` → router → 404. `createServer` (:26) listens. Errors: `AppError` status, else 500.
- `http/router.ts` — `Route` (:13), `get/post/put/patch/del` (:21-25), `matchRoute` (:28). Patterns: `:name` captures one decoded segment. First match wins. Touchpoint: `server.ts`, `routes/*`.
- `http/respond.ts` — `Reply` (:4), `ok` (:9), `created` (:10), `accepted` (:12), `ack` (:14, `{ok:true}`), `notFound` (:15), `sendJson` (:18), `readJson` (:24, empty body → `{}`). Touchpoints: all routes, `mcp.ts`.
- `http/routes/index.ts` — `routes` (:13). Concatenates the domain route lists. Add a new domain here.
- `http/routes/system.ts` — `systemRoutes` (:16), `requireJson` (:9, refuses non-JSON with 415). `POST /api/system/update` pulls, `POST /api/system/restart` restarts.
- `http/routes/{sessions,runs,personas,bots,room,repos,memory,providers}.ts` — one `Route[]` each. Handlers are small: read body → call an `app/*` function → return a `Reply`. Lines: see `api.md`.
- `http/mcp.ts` — `handleMcp` (:7). JSON-RPC 2.0 for `initialize`, `tools/list`, `tools/call`. 401 without a live run token. Touchpoints: Claude CLI (via `adapters/claude-cli.ts` `mcpConfig`), `app/tools`.
- `http/static.ts` — `serveStatic` (:18). Serves `dist/frontend` (path check keeps requests inside it). Misses return false.

## app/ (use cases)
- `app/config.ts` — `HOST` (:2), `PORT` (:3, env `MIP_PORT`).
- `app/errors.ts` — `AppError(status, message)` (:2), `errorMessage` (:11). Thrown by app code; mapped to HTTP by `server.ts`.
- `app/git.ts` — `runGit(args)` (:5). Runs git with `GIT_TERMINAL_PROMPT=0`. Rejects with git's `fatal:`/`error:` line. Touchpoints: `repos.ts`.
- `app/names.ts` — `pickAgentName(taken)` (:51). Norse names, no repeats among open chats. Touchpoints: `sessions.ts createChat`.
- `app/providers.ts` — provider registry (:9-12). `hasProvider` (:14), `findProvider` (:18, 404 when unknown), `listProviders` (:25), `signIn` (:50), `answerSignIn` (:54), `signOut` (:58). Touchpoints: `http/routes/providers.ts`, `sessions.ts`, `bots.ts`, `runs.ts`, `room.ts`.
- `app/sessions.ts` — chats. `listChats` (:9), `createChat` (:14), `getChat` (:22, `{session, messages, activeRunId}`), `updateChat` (:29), `deleteChat` (:59), `requireSession` (:66). Touchpoints: `routes/sessions.ts`.
- `app/runs.ts` — a turn in a chat. `startRun` (:16), `readRun` (:37), `activeRunId` (:42), `execute` (:56, the background loop). Touchpoints: `routes/runs.ts`, `tools/index.ts registerRun`, `memory.ts recallFor`, `repos.ts repoNote`, `personas.ts personaPrompt`.
- `app/room.ts` — the shared room. `MAX_TURNS` (:9), `HISTORY` (:10), `MAX_TEXT` (:11), `roomStatus` (:17), `roomMessages` (:22), `postToRoom` (:28), `runTurn` (:67). Touchpoints: `routes/room.ts`, `room-engine.ts`, `bots.ts`.
- `app/room-engine.ts` — pure turn-taking, no storage. `mentionedBots` (:9), `isSilent` (:20), `converseRoom` (:39). Tested by `room-engine.test.mjs` (fake bots).
- `app/bots.ts` — bot CRUD and validation. `NAME` regex (:7), `MAX_PERSONA` (:8), `allBots` (:10), `createBot` (:14), `editBot` (:20), `removeBot` (:26), `checkFields` (:32). Model and thinking are checked against the provider's live catalog.
- `app/personas.ts` — `DEFAULT_PERSONA_ID` (:7), `DEFAULT_SYSTEM_PROMPT` (:10), seed (:29-32), `allPersonas` (:34), `defaultPersona` (:38), `hasPersona` (:42), `personaPrompt` (:47), `createPersona` (:51), `editPersona` (:57), `makeDefaultPersona` (:64), `removePersona` (:70). Built-in `default` cannot be deleted.
- `app/memory.ts` — notes. `LINK` (:6), `TAG` (:7), `parseLinks`/`parseTags` (private), `writeNote` (:24), `readNote` (:36), `searchMemory` (:43), `memoryList` (:50), `memoryGraph` (:55), `forgetNote` (:76), `recallFor` (:83). Touchpoints: `routes/memory.ts`, `runs.ts`, `tools/memory.ts`.
- `app/repos.ts` — repositories. `CLONE_LINK` (:12), `FOLDER_NAME` (:14), `HOST_LINK` (:16), `withScheme` (:18), `repoNameFromUrl` (private), `requireRepo` (private), `branchOf` (private), `listRepoCards` (:46), `pullAllRepos` (:61), `addRepo` (:78), `copyRepoToChat` (:102), `removeRepo` (:120), `repoNote` (:128). Touchpoints: `routes/repos.ts`, `runs.ts`, `tools/workspace.ts`.
- `app/tools/index.ts` — `guarded` (:8), `TOOLS` (:21), `findTool` (:23), `runWorkspaces` (:29), `registerRun` (:31), `releaseRun` (:37), `workspaceForToken` (:41).
- `app/tools/result.ts` — `ok` (:4), `fail` (:5). Tool result helpers.
- `app/tools/files.ts` — `readTool` (:10, offset/limit, 2000 lines / 50 KB cap), `writeTool` (:33), `editTool` (:52, exact unique `oldText`). All use `inWorkspace`.
- `app/tools/bash.ts` — `bashTool` (:7). `spawn("bash", ["-c", cmd], {cwd: workspace})`. Output keeps last 50 KB. Timeout default 120 s. Not sandboxed.
- `app/tools/memory.ts` — `memorySearchTool` (:6), `memoryReadTool` (:21), `memoryEditTool` (:46). Only existing notes can be edited.
- `app/tools/workspace.ts` — `workspacePath` (:6), `workspaceFor` (:11, creates), `removeWorkspace` (:18), `inWorkspace` (:23, refuses paths outside).

- `app/system.ts` — `ROOT` (:8, the checkout, three folders above the built file), `RESTART_LOG` (:10, `MIP_HOME/restart.log`), `pullLatest` (:14, `git pull --ff-only`), `restartMip` (:20, detached shell: wait for this process, `npm install`, `npm run build`, then start the server; it starts even if the build fails).

## adapters/
- `adapters/contract.ts` — `AgentEvent` (:4), `ToolResult` (:12), `ToolContext` (:18), `ToolSpec` (:24), `ThinkingLevel` (:33), `ModelOption` (:36), `RunOptions` (:44), `ProviderCapabilities` (:64), `AuthState` (:72), `SignInMethod` (:79), `SignInTarget` (:82), `SignInPrompt` (:90), `SignInProgress` (:97), `AgentProvider` (:104).
- `adapters/async-queue.ts` — `AsyncQueue` (:2). Push-to-pull bridge used by both providers.
- `adapters/sign-in-session.ts` — `SignInSession` (:4). Output lines, pending prompt, `answer`, `finish`, `progress`.
- `adapters/claude-cli.ts` — `TARGET_ID` (:18), `STATUS_TTL_MS` (:20), `CATALOG_TTL_MS` (:22), `toModelOption` (:42), `cliEnv` (:58), `toText` (:66), `parseStreamLine` (:79), `mcpConfig` (:118), `ClaudeCliProvider` (:130): `models` (:148), `listModels` (:157, control channel), `targets` (:202), `startSignIn` (:209), `signInProgress` (:233), `answerSignIn` (:238), `signOut` (:245), `run` (:251), `authStatus` (:313), `runCli` (:323), `assertTarget` (:338).
- `adapters/pi.ts` — `HIDDEN_PROVIDERS` (:27), `toSignInPrompt` (:48), `describeNotice` (:57), `toAppEvent` (:78), `toPiTool` (:94), `PiProvider` (:113): `models` (:128), `targets` (:140), `startSignIn` (:164), `signInProgress` (:191), `answerSignIn` (:195), `signOut` (:199), `run` (:204), `runtime` (private), `resolveModel` (private), `openSession` (private).

## storage/
- `storage/db.ts` — `db` (:8, the one connection), `Row` type (:11), schema (:13-92), `hasColumn` (:95), migrations (:100-111), startup recovery (:114-115).
- `storage/paths.ts` — `MIP_HOME` (:6), `DATA_DIR`, `SESSIONS_DIR`, `REPOS_DIR`, `ensureMipDirs` (:12).
- `storage/personas.ts` — `Persona` (:4), `listPersonas`, `getPersona`, `insertPersona`, `updatePersona`, `setDefaultPersona` (:35), `deletePersona`.
- `storage/sessions.ts` — `Session` (:5), `Message` (:21), `createSession`, `listSessions`, `getSession`, `countSessionsWithPersona`, `listMessages`, `addMessage`, `renameSession`, `setSessionSettings`, `saveProviderSession` (:85), `deleteSession`.
- `storage/runs.ts` — `createRun`, `getRun`, `activeRunForSession` (:13), `setRunStatus`, `appendRunEvent` (:21), `listRunEvents`.
- `storage/notes.ts` — `Note` (:4), `getNoteByTitle`, `saveNote` (:16), `listNotes`, `deleteNote`, `searchNotes` (:60), `linksFrom`, `linksTo`, `allLinks`, `tagsOf`.
- `storage/repos.ts` — `Repo` (:4), `listRepos`, `getRepo`, `getRepoByName`, `insertRepo`, `setRepoStatus`, `deleteRepo`.
- `storage/bots.ts` — `Bot` (:4), `listBots`, `getBot`, `getBotByName`, `insertBot`, `updateBot`, `deleteBot`.
- `storage/room.ts` — `RoomMessage` (:4), `addRoomMessage` (:17), `roomMessagesAfter` (:25).

## Rules that hold across the backend
- App code throws `AppError` for client mistakes. Routes don't catch.
- Every storage write that touches several tables runs in `BEGIN`/`COMMIT`/`ROLLBACK` (see `saveNote`, `deleteSession`, `deleteNote`).
- Provider calls go through the registry (`findProvider`). Nothing else constructs a provider.
- A run's events are persisted as they arrive, so a page can resume them.
