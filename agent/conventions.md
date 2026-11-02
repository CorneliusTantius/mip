# Conventions and recipes

## Where new code goes
Backend:
- A route: `http/routes/<domain>.ts`, added to the array spread in `http/routes/index.ts`. The handler parses input, calls one `app/*` function, and returns a `Reply`.
- Business logic: `app/<domain>.ts`. A domain with more than one file gets a folder, `app/<domain>/`. Validation and client-error rules live here.
- SQL: `storage/<domain>.ts`, one file per domain. The schema and migrations live in `storage/db.ts`.
- A provider: `adapters/<name>.ts`, registered in the `providers` array in `app/providers.ts`.
- A tool: a module in `app/tools/`, added to a list in `app/tools/index.ts` (see "Add an agent tool").
- A skill rule: `app/skills/`. A sync rule: `app/sync/`.
- Tests: next to the module they test, and listed under "Verify before committing".

Frontend:
- A card or dialog family: `features/<name>/`. Its hooks and pure rules live beside it.
- Code that two or more features use: `ui/` for components, hooks, and helpers, or `api/` for the HTTP client, shared types, and window events.
- The page layout: `App.tsx`. No feature imports another feature (checked: no `features/*` file imports from a sibling feature folder).

Docs:
- Name files and functions, never line numbers. `symbols.md` carries the lines.
- When you add or move a module, update `backend.md` or `frontend.md`, and run `node agent/gen-index.mjs`.

## Style
- TypeScript `strict: true` on both sides. Backend: ESM with `.js` import suffixes (`module` and `moduleResolution` `NodeNext`). Frontend: `moduleResolution` `bundler`.
- One concern per file. Each exported function or component has a comment that says what it is for, not how it works.
- Backend: route handlers only parse input, call one `app/*` function, and return a `Reply`. Client mistakes throw `AppError(status, message)`.
- Frontend: fetch only through `api/client.ts`. Use `Card` and `CardBody` for every dashboard card, `Modal` for every dialog, `ErrorAlert` for every error box, and `Icon` for every icon. `SignInPanel.tsx` is the exception for `ErrorAlert` (see Gotchas).
- Names: components are PascalCase in `.tsx`, hooks are `useX` in `.ts`, pure rules live in plain `.ts` modules.

## Verify before committing
    npm run typecheck
    npm run build

Backend tests. Run `npm run build:backend` first: they import the compiled modules from `dist/backend`.
    node src/backend/adapters/pi-signin.test.mjs
    node src/backend/app/bots.test.mjs
    node src/backend/app/installation.test.mjs
    node src/backend/app/mail/accounts.test.mjs
    node src/backend/app/mail/mail-sync.test.mjs
    node src/backend/app/mail/mail.test.mjs
    node src/backend/app/mail/messages.test.mjs
    node src/backend/app/mcp/mcp-oauth.test.mjs
    node src/backend/app/mcp/mcp.test.mjs
    node src/backend/app/pi/pi-store.test.mjs
    node src/backend/app/room/engine.test.mjs
    node src/backend/app/room/rooms.test.mjs
    node src/backend/app/skills/format.test.mjs
    node src/backend/app/skills/skills.test.mjs
    node src/backend/app/slack/cache.test.mjs
    node src/backend/app/slack/slack.test.mjs
    node src/backend/app/spending.test.mjs
    node src/backend/app/sync/github.test.mjs
    node src/backend/app/sync/merge.test.mjs
    node src/backend/app/sync/sync.test.mjs
    node src/backend/app/tools/agents.test.mjs
    node src/backend/app/tools/ask.test.mjs
    node src/backend/app/tools/calls.test.mjs
    node src/backend/app/tools/financial.test.mjs
    node src/backend/app/tools/guides.test.mjs
    node src/backend/app/tools/room-search.test.mjs
    node src/backend/app/tools/social.test.mjs
    node src/backend/app/tools/tool-search.test.mjs
    node src/backend/storage/agent-ask.test.mjs
    node src/backend/storage/db.test.mjs

Frontend tests. No build: they import the `.ts` source directly.
    node src/frontend/features/agent/skillCommand.test.mjs
    node src/frontend/features/bots/mentions.test.mjs
    node src/frontend/features/email/mailFormat.test.mjs
    node src/frontend/features/mcp/mcpForm.test.mjs
    node src/frontend/features/mcp/mcpSummary.test.mjs
    node src/frontend/features/mcp/signInWindow.test.mjs
    node src/frontend/features/settings/outputLinks.test.mjs
    node src/frontend/features/slack/mrkdwn.test.mjs
    node src/frontend/ui/filterOptions.test.mjs
    node src/frontend/ui/links.test.mjs
    node src/frontend/ui/markdown.test.mjs

- 41 test files in total. `src/backend/app/mail/fake-imap.test-support.mjs` is a helper that `mail.test.mjs` and `mail-sync.test.mjs` import. Nothing runs it directly.
- Backend tests that touch the database or the data folder set `MIP_HOME` to a temporary folder before they load modules. These six do not set it: `adapters/pi-signin`, `app/mail/messages`, `app/room/engine`, `app/skills/format`, `app/sync/github`, `app/sync/merge`.
- Runtime: Node 26 here (`node --version` gives v26.13.0). `package.json` `engines` says `>=20`, which is lower than `node:sqlite` (used by `storage/db.ts`) needs.

For behavior, restart the server after `npm run build:backend`. Frontend-only changes need only `npm run build:frontend`, because the server reads `dist/frontend` on each request.

Browser check: open http://127.0.0.1:3000, use the affected card, and check the console for errors.

API regression check: before and after a change, record each route's status and body, then diff them. The route list is in `api.md`.

## Recipes

### Add an HTTP route
1. Add a `get|post|put|patch|del(path, handler)` entry (from `http/router.ts`) to the array in `src/backend/http/routes/<domain>.ts`. Path parameters are `:name` segments. The first route whose method and segments match wins.
2. For a new domain, create the file, export its array, and spread it in `src/backend/http/routes/index.ts`.
3. The handler returns a `Reply` (`http/respond.ts`): `ok` (200), `created` (201), `accepted` (202), `ack` (200, `{"ok": true}`), or `notFound` (404). Throw `AppError(status, message)` (`app/errors.ts`) for client errors.
4. Do not check the body type in the route. `http/server.ts` answers 415 to any `POST`, `PUT`, or `PATCH` to the API whose `Content-Type` lacks `application/json`, before routing, so a new write route is covered with no call. The reason is in `http/respond.ts`: a page on another site cannot send a JSON request without a preflight, and the server does not answer preflights. A raw `fetch` to a write route must send `Content-Type: application/json`. `api/client.ts` already does, and sends `{}` for a write with no body.
5. Put the logic in an `app/*` function, and the storage access in `storage/*`.
6. Add the route to `agent/api.md`.

### Add a storage table or query
1. Add the table to the `db.exec` schema block in `storage/db.ts`, with `CREATE TABLE IF NOT EXISTS`.
2. For a new column on an existing table, add a `hasColumn` migration: `if (!hasColumn(table, column)) db.exec("ALTER TABLE ... ADD COLUMN ...")`. The existing ones show the pattern. Migrations only add. The renames at the top of the file also run once.
3. Put the queries in `storage/<domain>.ts`. Map rows to types with a `toX(row)` function. Use `BEGIN`, `COMMIT`, and `ROLLBACK` for writes that touch several statements (`storage/agents.ts`, `storage/notes.ts`).
4. If the table syncs, give its rows a change time (see Gotchas), and add it to the snapshot in `app/sync/snapshot.ts` and `app/sync/merge.ts`, and to `FOLDERS` in `app/sync/repo.ts`.
5. Update `agent/data-model.md`.

### Add an agent tool
1. Create a module in `src/backend/app/tools/` that exports a `ToolSpec` (`adapters/contract.ts`): `name`, `description` (one line, used by search), `guide` (one paragraph on when and how to use it), `inputSchema` (JSON Schema), and `run(input, context)`. Return `ok(text)` or `fail(text)` from `app/tools/result.ts`.
2. Add it to `src/backend/app/tools/index.ts`. The list decides who gets it:
   - `BASIC_TOOLS`: offered on every agent run. Bots never get basic tools.
   - `DEFERRED_TOOLS` or `AGENT_FINANCIAL`: agent runs, found with `tool_search`.
   - `BOT_TOOLS`: offered on bot turns.
   - `SOCIAL_DEFERRED` or `FINANCIAL_DEFERRED`: bot turns, found with `tool_search`.
   Wrap it with `guarded(...)` as the others are, so a throw becomes a failed result. A tool in no list is in no run and not in `GET /api/tools`.
3. A bot's turn has its own run token and no workspace, so a bot tool must not need a folder.
4. Paths go through `inWorkspace` (`app/tools/workspace.ts`).
5. Adapters need no change. Claude gets offered tools through `/mcp`, and Pi gets them as custom tools.
6. `app/tools/tool-search.test.mjs` asserts the exact `AGENT_TOOLS`, `AGENT_DEFERRED`, and `BOT_TOOLS` names. Update it with the list.
7. Update `agent/backend.md` and the tool section of `agent/architecture.md`.

### Add a provider
1. Implement `AgentProvider` (`adapters/contract.ts`) in `src/backend/adapters/<name>.ts`. Map its output to `AgentEvent`. Always end a run with `done` or `error`.
2. Add an instance to the `providers` array in `src/backend/app/providers.ts`. Its `id` must be unique. `findProvider` answers 404 for an id not in the array.
3. Sign-in methods are optional (`startSignIn`, `signInProgress`, `answerSignIn`, `signOut`). Set `capabilities.signIn` to match. `SignInSession` (`adapters/sign-in-session.ts`) holds the progress lines and the pending prompt.

### Add a dashboard card
1. Create `src/frontend/features/<name>/<Name>Card.tsx`. Use `Card` (`ui/Card.tsx`) with a `glow`, and `CardBody` with `title` and `actions`. Put `<ExpandButton />` in `actions` for a card that expands.
2. A new glow color: add it to the `Glow` type in `ui/Card.tsx`, and add a `.glow-<name>` rule in `styles.css`.
3. A card whose body changes when expanded reads `useCardExpansion()` inside the card, as `WhatsAppCard.tsx` does.
4. Put state in a hook next to the card (`use<Name>.ts`). Fetch only through `api`.
5. Add the card to the grid in `App.tsx`, in the cell where you want it.
6. A list with the All / Agent / Bot view uses `RunScopePills` (`ui/RunScopePills.tsx`), so every card's pill looks and grows the same way.
7. Dialogs: use `Modal` (controlled by `open`). Confirmations: use `ConfirmDialog` (`ui/ConfirmDialog.tsx`).
8. Polling: `usePolling(fn, ms, enabled)` (`ui/hooks.ts`).
9. Cross-card changes: add a name constant in `api/events.ts`, call `announce(NAME)` after the change, and listen with `useAnnouncement(NAME, handler)` (`ui/hooks.ts`).

### Add a dialog
Use `Modal` (`ui/Modal.tsx`). Props: `open` (shown with `showModal()`), `onClose`, `closeButton` (round X, top right), `glow` (default `frost`), `glass`, and `boxClassName` (size). Put the content as children. Put a `ConfirmDialog` next to the `Modal`, not inside it.

### Add a frontend API call
Use `api.get|post|put|patch|del` from `api/client.ts`. Add the response type to `api/types.ts`. A failed call throws `ApiError` with the HTTP status. Catch with `errorText(err)` and show it with `ErrorAlert` (`ui/ErrorAlert.tsx`, prop `message`).

## Gotchas (read before changing these areas)
- The default persona id `default` is in two places: `DEFAULT_PERSONA_ID` in `src/frontend/api/constants.ts` and in `src/backend/app/personas.ts`. The dashboard does not import server code, so change both.
- `features/settings/SignInPanel.tsx` uses the native `confirm()` for sign-out and renders its own `alert-error` box instead of `ErrorAlert`. Everywhere else the app uses `ConfirmDialog` and `ErrorAlert`. Use those in new code. A native confirm box can be blocked, and then its button looks dead (`ui/ConfirmDialog.tsx`).
- A Pi run that fails reports the last assistant error when the turn ends with no retry (`agent_end` in `adapters/pi.ts`, when `willRetry` is false). Without that, a failed call looks like an empty reply.
- Pi reports `tools: false, mcp: false`, yet it gets the app's tools as custom tools. The flags are informational.
- Room turns use the bot's persona, the room rules, and `toolGuidesPrompt(BOT_TOOLS)` as their system prompt. They get no memory recall (`recallFor`), no repository note (`repoNote`), and no skill list. Only agent runs (`app/runs.ts`) add those. Bots do have the memory and skill tools.
- A bot's tool calls run with `workspace` set to `""` (`http/mcp.ts`). Its run has no folder.
- `POST /api/memory` answers 200 (`ok`), while other creates answer 201. This is kept for the dashboard.
- Routes match on path segments, so `/api/memory/` (with a trailing slash) matches `/api/memory`. `/api/graph` has its own path, so a note titled `graph` still opens through `/api/memory/graph`.
- Runs left `running` and clones left `cloning` are marked `error` at startup (`storage/db.ts`).
- Bash is not sandboxed. It runs as the server's user, in the agent's workspace folder.
- The status row under the bots transcript (`features/bots/BotsCard.tsx`) must keep `h-5 flex-none`, or the transcript jumps.
- Card entrance timing is drawn per mount in `ui/Card.tsx` (`--enter-duration`, `--enter-delay`). Don't add position-based animation delays. Set those variables on the element.
- The memory card's note count (`MemoryCard.tsx`) counts nodes with `missing: false`. A link to a title with no note is a `missing` node, drawn dashed in `MemoryGraph.tsx`.
- One conversation per room: `postToRoom` (`app/room/room.ts`) answers 409 for a busy room. Other rooms are not held up.
- `git` runs with `GIT_TERMINAL_PROMPT=0` (`app/git.ts`), so a clone that needs a password fails instead of waiting.
- Change times in sync (`app/sync/merge.ts`): `newer()` keeps the record with the later `updatedAt`. This applies to personas and bots (`updated_at`), notes and rooms (`updated_at`), agents (`meta_updated_at` for the record; messages are unioned), Pi credentials and model catalogs, and Slack cache entries. A local write to one of these rows must move its change time, or the other side's copy wins. MCP servers, mail accounts, the Slack app and accounts, Pi files, spending entries, and the mail cache keep GitHub's copy when both sides changed. Spending entries are never edited, so they have no change time.
- Sync's local copies hold secrets in plain text: `sync/base.json` (written with no mode option) and `sync/dotmip/`. Treat them like `data/mail.json`.
- The GitHub token is never stored. Each sync reads it from `gh auth token`, and `authEnv` (`app/sync/github.ts`) passes it to git as an `Authorization` header through `GIT_CONFIG_*` environment variables for that call. Never put it in argv, a config file, or a log.
- Sync refuses these, and changes nothing: a public `dotmip` repo (409 from `ensureRepo`), a database with no rows while the last sync had data (409, "Check MIP_HOME first"), and an unreadable `mcp.json`, `mail.json`, or `slack.json` (409).
- The synced repo's folder is `agents/`. Sync still reads an older repo's `chats/` folder until a sync writes `agents/` (`LEGACY_FOLDERS` in `app/sync/repo.ts`, and `chats` in `snapshotFromSaved` in `app/sync/merge.ts`).
- The `SyncStatus` type in `api/types.ts` must match the `SyncStatus` interface in `app/sync/engine.ts`.
- Tool guidance lives in each tool's `guide`, never in a persona. The built-in persona (`DEFAULT_SYSTEM_PROMPT` in `app/personas.ts`) keeps identity and style. An unedited copy of the previous built-in text is replaced at startup. An edited one is left alone.
- Skills: `create` (`app/skills/create.ts`) refuses a name that is already installed (409). An import (`app/skills/imports.ts`) is copied to `skills/.staging/<id>/` and waits for confirmation. Both check the header rules in `app/skills/format.ts`. Limits: `SKILL.md` 64 KiB, a skill folder 512 KiB, 50 files, names 64 characters, descriptions 1024 characters. Imports refuse symbolic links, scripts, and binaries. Skills are text only.
- A skill is read only through `skill_read` and `skill_file`. Every agent and bot can read every installed skill. mip reads only `MIP_HOME/skills`, never another tool's skill folder.
- Claude runs with `--disable-slash-commands`, and Pi with `noSkills: true`. Skills reach the model only through the app's tools.
- Each run's lists decide what it can call. `/mcp` answers `tools/list` and `tools/call` from the run's `tools`. `tool_call` runs only a tool in the run's `deferred` list.
- MCP: `data/mcp.json` holds tokens and environment values. An OAuth server keeps its sign-in state and tokens in its entry (`oauth`). Sync carries all of it to the dotmip repo. `mcpStatus()` never returns environment values, headers, or tokens. MCP tools are deferred for agents and bots alike.
- Pi's config: credentials and model catalogs are rows in `mip.db`. `settings.json` and `models.json` are in `data/pi/`. Pi never reads `~/.pi`, except for the one-time import of its auth file at startup.
- A rename of a word must skip library class names. daisyUI's chat classes (`chat`, `chat-start`, `chat-end`, `chat-bubble`, `chat-bubble-*`) are used in `features/slack/SlackTranscript.tsx` and `features/bots/RoomTranscript.tsx`. The chat-to-agent rename once broke them. Check the library class names after a rename.
- Expanded cards step their text up one size. `RunScopePills` does it with `btn-sm` when its card is expanded. Put size changes in those classes, not in one-off styles.
- Mail: `data/mail.json` (mode 600) carries the IMAP app passwords through sync, so keep the dotmip repo private. Bodies are fetched with `BODY.PEEK` (`app/mail/imap.ts`), so reading never marks a message as read. A saved account keeps one IMAP connection between reads, closed after 5 minutes without a read (`app/mail/sessions.ts`). A dropped connection is replaced, and the read that failed on it runs once more.
- Slack: `data/slack.json` holds the app's client secret and each user's token, and sync carries them like mail. `slackReply` returns only the client ID, and accounts are shown through `viewOf`, which drops the token. `features/slack/SlackCard.tsx` polls `GET /api/slack` every 3 seconds, and only while a sign-in is waiting. Slack history is read on demand and kept in `slack-cache.json`. The root README gives the reason: Slack limits history reads for apps outside its Marketplace. Sign-in states are used once and expire after 10 minutes.

## Git
- Push every change to `origin main`, as the `gh` account CorneliusTantius. `gh auth status` shows it as the active account.
- No attribution lines: no `Co-Authored-By`, no "Generated with".
- Commit with: `git -c user.name=CorneliusTantius -c user.email=65766122+CorneliusTantius@users.noreply.github.com commit -m "..."`. The user id 65766122 is the account's GitHub id.
- Before a commit, check `git status` for staged leftovers: a plain `git commit` includes anything already staged. Scan the diff for secrets.
- Never force-push. After the push, check that local `HEAD` equals `origin/main`.
