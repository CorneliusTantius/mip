# Backend modules

Each entry gives the file, its job, its main exports, and who calls it. Line numbers are in `symbols.md`, which is generated.

## http/
- `server.ts`: entry point. `handle` tries static files, then `/mcp`, then the router, then 404. Errors: `AppError` gives its status, anything else gives 500.
- `router.ts`: `get`, `post`, `put`, `patch`, `del`, and `matchRoute`. `:name` captures one decoded path segment. The first match wins.
- `respond.ts`: `Reply` and the helpers `ok`, `created`, `accepted`, `ack`, `notFound`, `sendJson`, `readJson` (an empty body reads as `{}`), and `requireJson` (415 for a non-JSON request, used by routes that act on this machine).
- `mcp.ts`: `handleMcp`. JSON-RPC 2.0 for the Claude CLI: `initialize`, `tools/list`, and `tools/call`. Both list and call use the run's offered tools. Without a live run token it answers 401.
- `mcp-oauth.ts`: `handleOAuthCallback`, the page an MCP sign-in returns to. It finishes the sign-in with the `code` and `state`, and shows the result. Tested by `mcp-oauth.test.mjs`.
- `static.ts`: serves `dist/frontend`, and keeps every path inside it.
- `routes/index.ts`: concatenates the domain route lists. A new domain is added here.
- `routes/<domain>.ts`: one `Route[]` per domain: `agents`, `runs`, `personas`, `bots`, `room`, `repos`, `memory`, `providers`, `system`, `sync`, `skills`, `tools`, `mcp-servers`, `mail`. Each handler reads the body, calls one `app/*` function, and returns a `Reply`. The routes are listed in `api.md`.

## app/: use cases
Flat files, one per domain:
- `config.ts`: `HOST` and `PORT` (from `MIP_PORT`).
- `errors.ts`: `AppError(status, message)` and `errorMessage`.
- `git.ts`: `runGit(args, env?)`. Prompts are off, so a clone that needs a password fails instead of waiting. `env` adds variables for one call.
- `names.ts`: `pickAgentName`. Norse names, with no repeats among open agents.
- `system.ts`: `pullLatest` (`git pull --ff-only`) and `restartMip` (a detached shell that waits, runs `npm install` and `npm run build`, then starts the server).
- `agents.ts`: agents. `listAgents`, `createAgent`, `getAgent` (agent, messages, active run), `updateAgent`, `deleteAgent`.
- `runs.ts`: a turn in an agent. `startRun` and `readRun` for the routes, and `execute`, the background loop. It builds the system prompt, streams the provider's events into the run, records the tool calls, and saves the reply.
- `personas.ts`: the built-in persona. Its prompt holds identity and style only. `DEFAULT_PERSONA_ID`, `personaPrompt`, and the create, edit, default, and remove functions.
- `bots.ts`: bot create, edit, and remove, and the name rule. Model and thinking are checked against the provider's live catalog. A color is checked against the palette, and `nextBotColor` gives a new bot the first color no bot uses.
- `providers.ts`: the provider registry (`claude-cli`, `pi`), `findProvider`, `listProviders`, and sign-in, answer, and sign-out.
- `installation.ts`: `installationId`, this installation's device ID. Pi passes it to every sign-in, since OpenAI's ChatGPT sign-in needs one. It is made on first use and kept in `MIP_HOME/data/device-id`. Tested by `installation.test.mjs`.
- `memory.ts`: shared notes. Write, read, search, list, graph, forget, and `recallFor` (the notes that match a message, added to the system prompt).
- `repos.ts`: repository clones, pull all, copies into agents, and `repoNote`.

## app/room/: the bots room
- `room.ts`: `postToRoom`, `roomMessages`, `roomStatus` (per room), and `runTurn`. A bot turn registers its own run token for `BOT_TOOLS` and its deferred MCP tools, with the room's id and no workspace, since none of its tools read a folder. Its system prompt is the persona, the room's rules (which name the room), and the tool guides. Its run token also carries the bot id.
- `rooms.ts`: `allRooms`, `createRoom`, `editRoom`, `removeRoom`. A name is unique ignoring case and at most 40 characters. The last room cannot be removed. Tested by `rooms.test.mjs`.
- `engine.ts`: pure turn-taking: `mentionedBots`, `isSilent`, `converseRoom`. Tested by `engine.test.mjs`.

## app/tools/: the tool registry
- `index.ts`: the registry. `BASIC_TOOLS`, `DEFERRED_TOOLS`, `TOOLS`, `AGENT_TOOLS`, `AGENT_DEFERRED`, `BOT_TOOLS`, `agentDeferredTools`, `botDeferredTools`. Also `RunContext`, `registerRun`, `releaseRun`, `runContextForToken`, `describeTools` (for `GET /api/tools`), and `toolGuidesPrompt`.
- `search.ts`: `toolSearchTool`, `toolCallTool`, and the pure `searchTools`. Tested by `tool-search.test.mjs`.
- `room.ts`: `roomSearchTool` (`room_search`), the one tool only bots get. It searches the messages of the bot's own room with `storage/room.ts` `searchRoomMessages`, newest first. The run's room id comes from the run's token. Tested by `room-search.test.mjs`.
- `social.ts`: the read tools for bots over mail and Slack, all deferred (`botDeferredTools`), so a bot finds them with `tool_search`: `mail_list` and `mail_read` (the mail module's `listMailMessages` and `openMailMessage`), and `slack_search` (`search.messages`) and `slack_read` (the Slack read module's cached history and thread). They are read-only, and a bot never sends. An account is named by label, address, id, or name; with one connected it can be left out. Tested by `social.test.mjs`.
- `index.ts` also defines `agents_list` and `agent_ask`, the bot-only tools for sending a task to an agent open to bots. `agent_ask` starts the agent's run with `startRun`, whose `onFinish` posts the reply to the room as an `agent` message and frees the room for the next task. One task per room at a time. They are defined in `index.ts`, not their own file, because `runs.ts` reads the registry: a tool file that imported `runs.ts` would break the module load order. Tested by `agents.test.mjs`.
- `calls.ts`: `ToolCallLog`. It records a reply's calls, matching results to calls by id, and cuts long text. Tested by `calls.test.mjs`.
- `files.ts`: `read`, `write`, `edit`. Paths go through `inWorkspace`.
- `bash.ts`: `bash`. The working directory is the workspace. Output keeps the last 50 KB. The default timeout is 120 seconds. Not sandboxed.
- `memory.ts`: `memory_search`, `memory_read`, `memory_edit`. Only existing notes can be edited.
- `ask.ts`: `ask_user`, offered to every agent. It checks the question's kind and its controls (choice and multi take 2 to 8 options, a slider needs a min below its max). `takePendingAsk(agentId)` hands the question to the reply when the run ends. One question per run. Tested by `ask.test.mjs`.
- `skills.ts`: `skill_search`, `skill_read`, and `skill_file`. Every installed skill is open to every agent and bot.
- `workspace.ts`: `workspacePath`, `workspaceFor`, `removeWorkspace`, `inWorkspace`.
- `result.ts`: `ok` and `fail`.
- `guides.test.mjs`: checks that every tool has a guide and that the guides reach the prompt.

## app/mail/: mail over IMAP
- `accounts.ts`: the accounts file, `data/mail.json`, in the shape OpenClaw's IMAP plugin uses: an `accounts` map from an id to one account, with its server, login, mailbox, watch settings, and `maxBytes`. `parseMailAccounts` (pure) reports an account that does not load and keeps the others. `saveMailAccount` and `removeMailAccount` edit the file as JSON, keep what the app does not load, and write it with mode 600. `writeMailAccounts` replaces the accounts for a sync, after checking them. `MAIL_PRESETS` lists the providers the add form offers. Tested by `accounts.test.mjs`.
- `imap.ts`: `checkAccount`, `syncMailbox` (the list: UIDs new since the cache, older ones only when the count asks, read states of the cached ones, removals; headers only), and `fetchMessage`, on `imapflow`.
- `cache.ts`: `data/mail-cache.json`, the newest headers of each account (uidValidity and messages). `readMailCache`, `saveMailbox`, `dropMailbox` (on account removal). Not synced. Tested by `mail-sync.test.mjs`. Each read runs through `inSession` (`sessions.ts`), so it uses the account's open connection. `signInOnce` is the one-shot sign-in used when an account is added. Reads use a read-only mailbox lock, and a body is fetched with `BODY.PEEK`. IDLE is off (`disableAutoIdle`), and the card re-reads on the account's `pollSeconds`.
- `sessions.ts`: one IMAP connection per account, kept between reads. Reads on one account queue, a connection the server dropped is replaced, and a read that failed on an open connection runs once more on a new one. A connection unused for five minutes is closed (`DEFAULT_IDLE_CLOSE_MS`), and `closeMailSession` closes one when its account is removed. Tested by `mail.test.mjs`, which counts connections on the fake server.
- `messages.ts`: the pure mapping from an `imapflow` message to a header and a message (`headerOf`, `messageOf`, `clipBody`, `htmlToText`). Tested by `messages.test.mjs`.
- `mail.ts`: the facade the routes call. `addMailAccount` signs in before it saves, and `reasonOf` passes the server's own reason on, never the password. Tested by `mail.test.mjs` against `fake-imap.test-support.mjs`, a small IMAP server that records body fetches and sets `\Seen` only for a fetch that is not a peek.
- Not built yet: IDLE, a watcher that reports new mail, sending, and agent tools. Sender checks (OpenClaw's DMARC rules) matter once mail reaches an agent, not for the card.

## app/slack/: Slack as the connected user
- `config.ts`: `data/slack.json`, with the app's `clientId` and `clientSecret` under `app`, and one account per connected user under `accounts`. `parseSlackConfig` (pure) reports a part that does not load. `saveSlackApp`, `saveSlackAccount`, and `removeSlackAccount` edit the file as JSON and keep other fields. `writeSlackState` replaces the app and accounts for a sync, after checking them. Tokens must start with `xoxp-`. Mode 600.
- `api.ts`: `slackCall(method, token, params)`, one POST to `slack.com/api/`. A refused call becomes an `AppError`: an auth failure is a 401, a missing scope a 403, a rate limit a 429, and any other code a 502 with Slack's code in the message.
- `connect.ts`: `startConnect` builds the authorize URL with `user_scope` (read and write scopes, including `chat:write`; `SLACK_USER_SCOPES`) and a one-time state held in memory for ten minutes. `completeConnect` exchanges the code with `oauth.v2.access` and takes `authed_user.access_token`; no bot token is asked for. `connectWithToken` takes a pasted token and checks it with `auth.test`. `userNameOf` looks a name up with `users.info` and falls back to the id. `slackRedirectUri` is the address the Slack app must list.
- `read.ts`: `listConversations` (`users.conversations`) and `listMessages` (`conversations.history`, newest 30). Both go through `cached`, so a reload reads the cache. Names come from one `users.list` pass per workspace (`namesOf`, a day), not a call per person. Time to live: conversations 10 min, messages 2 min, names 24 h. `force` (the `?refresh=1` query) asks Slack again. `listMessages` leaves replies out; `listReplies` (`conversations.replies`) reads one thread. Both keep `user`, `replies`, and `threadTs`.
- `post.ts`: `sendMessage` posts as the user with `chat.postMessage`, checks the text (non-empty, 4,000 characters at most) and the thread id, and drops the cached messages and replies of that conversation so the next read shows the new message. Tested by `slack.test.mjs` for the account check.
- `cache.ts`: `cached(key, ttl, load, force)` keeps each answer in `data/slack-cache.json` with its fetch time, and `forgetCache(prefixes)` drops an account's entries when it is disconnected. Not synced. Tested by `cache.test.mjs`.
- `slack.ts`: the reply the page uses (the client ID, never the secret; the accounts without tokens; the redirect address) and the app and disconnect actions.
- Tested by `slack.test.mjs`, which never reaches Slack.
- Not built yet: sending (`chat:write`), search, Slack markup in messages (`<@U…>` shows as the raw id), and agent tools. Slack limits `conversations.history` for apps not listed on the Marketplace to 15 messages a minute, unless the app is internal to one workspace, which is how this app is set up.

## app/mcp/: external MCP servers
- `config.ts`: `parseMcpConfig` (pure) and `readMcpConfig`. Reads `data/mcp.json`: a stdio server has a `command`, `args`, and `env`, and a Streamable HTTP server has a `url` and `headers`. A bad entry is reported by name, and the others still load. An http entry may carry `oauth`, its sign-in state with the tokens. `editMcpFile` changes the file as JSON and keeps every entry the app does not load. Tested by `mcp.test.mjs`.
- `manager.ts`: `startMcpServers` connects every configured server in parallel, with 30 s for the start and the tool list. `closeMcpServers`, `mcpTools` (the tools of the connected servers), `mcpStatus`, and `mcpToolName` (`mcp_<server>_<tool>`, cut to 64 characters). A tool whose name another tool already has is skipped and reported. A connection that drops marks its server as error. An OAuth server whose first connect needs the user waits in status `sign-in`, with its link in `signInUrl`. `completeSignIn` finishes the sign-in from the callback, `signInServer` starts it again, and the OAuth store saves its state into mcp.json (`saveSignIn`).
- `servers.ts`: `addMcpServer` and `removeMcpServer`. The card's form becomes an mcp.json entry, which `parseMcpConfig` checks before `editMcpFile` writes it. Then the servers connect again. Tested by `mcp-oauth.test.mjs`.
- Sync: `app/sync/snapshot.ts` reads these servers as the `mcp` part, and rewrites mcp.json when a sync changes them, after the new text is checked to load. `merge.ts` keeps GitHub's copy when both sides changed one server.

## app/pi/: Pi's credentials and catalogs
- `store.ts`: `DbCredentialStore` (read, list, the serialized `modify`, delete) and `DbModelsStore`, both on `storage/pi.ts`. `importLegacyPiAuth` copies `~/.pi/agent/auth.json` once. Tested by `pi-store.test.mjs`.

## app/skills/: installed skills
- `format.ts`: pure rules. `parseSkill` (the `SKILL.md` header), `isValidName`, `isTextFile`, `isSafeRelativePath`, and the size limits. Tested by `format.test.mjs`.
- `registry.ts`: what is installed. `listSkills`, `loadSkill`, `readSkillFile`, `searchSkills`, `withSkillCommand` (a leading `/name` in a message gets that skill's instructions), `removeSkill`.
- `imports.ts`: the two-step install. `stageImport` copies and checks a folder into staging, `confirmImport` moves it into place, and `discardImport` drops it.
- `create.ts`: `createSkill`, which writes a skill from a form and never replaces an installed one.
- `skills.test.mjs`: import review, refusals, search, the `/name` command, the tools, and removal.

## app/sync/: GitHub sync
- `engine.ts`: `syncStatus` (accounts, the one in use, last run), `chooseAccount` (saved to `state.json`), `startSync` (background), and `syncWith({url, env, repo})` (one sync, also used by the tests). The merge base is kept per repo in `base.json`.
- `github.ts`: `parseAccounts` and `pickAccount` (pure), `listAccounts` (`gh auth status`), `ghToken(login)` (`gh auth token --user`), `gitHubAccount`, `ensureRepo` (creates a private `dotmip`, refuses a public one), `repoUrl`, and `authEnv` (the token, only in git's environment).
- `repo.ts`: the local clone in `sync/dotmip`. `fetchRepo` (re-clones when the URL changes), `readTree`, `writeTree`, and `commitAndPush`.
- `snapshot.ts`: `readLocal` and `applySnapshot`. Only the records that differ are written.
- `merge.ts`: pure three-way merge. Types, `keyOf`, `mergeSnapshots`, and `countChanges`.
- Tests: `github.test.mjs`, `merge.test.mjs`, `sync.test.mjs` (two machines and a local bare repo, through real git).

## adapters/
- `contract.ts`: `AgentEvent`, `ToolContext`, `ToolSpec` (with `guide`), `RunOptions` (with `agentId` and `deferredTools`), `ProviderCapabilities`, and `AgentProvider`.
- `async-queue.ts`: `AsyncQueue`, the push-to-pull bridge both providers use.
- `sign-in-agent.ts`: `SignInSession`, the sign-in progress and the pending prompt.
- `claude-cli.ts`: `ClaudeCliProvider`. `run` builds the CLI arguments (stream-json, the MCP config, `--disable-slash-commands`) and maps the output to events. Also models, sign-in, and sign-out.
- `pi.ts`: `PiProvider`. `run` builds a Pi session with `noSkills`, and the app's tools as custom tools (`toPiTool`). Also models and sign-in.

## storage/
- `db.ts`: the connection, the schema, the additive migrations (`hasColumn`), and startup recovery.
- `paths.ts`: `MIP_HOME`, `DATA_DIR`, `SESSIONS_DIR`, `REPOS_DIR`, `SYNC_DIR`, `SKILLS_DIR`, `MCP_CONFIG_FILE`, `ensureMipDirs`.
- `agents.ts`: agents and messages, including each message's `calls`.
- `runs.ts`, `notes.ts`, `personas.ts`, `bots.ts`, `room.ts`, `rooms.ts`, `repos.ts`: one file per domain.
- `bot-colors.ts`: `BOT_COLORS` (the palette, in the order a new bot takes them), `BotColor`, and `isBotColor`. Used by storage, the schema migration, and the bot rules.
- `sync.ts`: the rows GitHub sync reads and writes. A `remove` returns false where the database must keep the row (the default persona, a persona an agent uses, an agent with a running run).

## Rules across the backend
- App code throws `AppError` for client mistakes. Routes don't catch.
- A write that touches several tables runs in `BEGIN`, `COMMIT`, and `ROLLBACK`.
- Providers are reached only through the registry (`findProvider`).
- A run's events are saved as they arrive, so a page can resume them.
- Synced tables set their change times on every write (see `data-model.md`).
- Tool lists come from the registry. A kind of run is offered a tool only when its list includes the tool.
