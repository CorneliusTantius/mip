# Conventions and recipes

## Where new code goes
Backend:
- A route: `http/routes/<domain>.ts`, added to `http/routes/index.ts`. The handler parses input, calls one `app/*` function, and returns a `Reply`.
- Business logic: `app/<domain>.ts`. If the domain has more than one file, it gets a folder: `app/<domain>/`. Validation and client-error rules live here.
- SQL: `storage/<domain>.ts`, one file per domain. The schema and migrations live in `storage/db.ts`.
- A provider: `adapters/<name>.ts`, registered in `app/providers.ts`.
- A tool: a module in `app/tools/`, listed in the registry in `app/tools/index.ts`.
- A skill rule: `app/skills/`. A sync rule: `app/sync/`.
- Tests: next to the module they test, and added to the list under "Verify before committing".

Frontend:
- A card or dialog family: `features/<name>/`. Its hooks and pure rules live beside it.
- Code that two or more features use: `ui/` for components, hooks, and helpers, or `api/` for HTTP and shared types.
- The page layout: `App.tsx`. No feature imports another feature.

Docs:
- Name files and functions, never line numbers. `symbols.md` carries the lines.
- When you add or move a module, update `backend.md` or `frontend.md`, and run `node agent/gen-index.mjs`.

## Style
- TypeScript strict on both sides. ESM with `.js` import suffixes in the backend (NodeNext). Bundler resolution in the frontend.
- One concern per file. Each exported function or component has a comment that says what it is for, not how it works.
- Backend: route handlers only parse input, call one `app/*` function, and return a `Reply`. Client mistakes throw `AppError`.
- Frontend: fetch only through `api/client.ts`. Use `Card` and `CardBody` for every dashboard card, `Modal` for every dialog, `ErrorAlert` for every error box, and `Icon` for every icon.
- Names: components are PascalCase in `.tsx`, hooks are `useX` in `.ts`, and pure rules live in plain `.ts` modules.

## Verify before committing
    npm run typecheck
    npm run build
    node src/backend/app/room/engine.test.mjs
    node src/backend/app/room/rooms.test.mjs
    node src/backend/app/tools/tool-search.test.mjs
    node src/backend/app/tools/guides.test.mjs
    node src/backend/app/tools/room-search.test.mjs
    node src/backend/app/tools/calls.test.mjs
    node src/backend/app/skills/format.test.mjs
    node src/backend/app/skills/skills.test.mjs
    node src/backend/app/mcp/mcp.test.mjs
    node src/backend/app/sync/github.test.mjs
    node src/backend/app/sync/merge.test.mjs
    node src/backend/app/sync/sync.test.mjs
    node src/backend/storage/db.test.mjs
    node src/backend/app/bots.test.mjs
    node src/backend/app/installation.test.mjs
    node src/backend/adapters/pi-signin.test.mjs
    node src/frontend/features/bots/mentions.test.mjs
    node src/frontend/features/settings/outputLinks.test.mjs
    node src/frontend/ui/filterOptions.test.mjs

The backend tests need `npm run build:backend` first. The skill, tool, and sync tests use a temporary `MIP_HOME`.

For behavior, restart the server after `npm run build:backend`. Frontend-only changes need only `npm run build:frontend`, because the server reads `dist/frontend` on each request.

Browser check: open http://127.0.0.1:3000 and the affected card, and check the console for errors.

API regression check (used in the 2026-10-31 refactor): record each route's status and body before and after a change, then diff. The route list is in `api.md`.

## Recipes

### Add an HTTP route
1. Add a `get|post|put|patch|del(path, handler)` entry to `src/backend/http/routes/<domain>.ts`. Path parameters use `:name`.
2. For a new domain, create the file and add its array to the spread in `src/backend/http/routes/index.ts`.
3. The handler returns `ok`, `created`, `accepted`, `ack`, or `notFound`. Writes that act on this machine call `requireJson` first. Throw `AppError(status, message)` for client errors.
4. Put the logic in an `app/*` function, and the storage access in `storage/*`.
5. Add the route to `agent/api.md`.

### Add a storage table or query
1. Add the table to the schema block in `storage/db.ts`, with `CREATE TABLE IF NOT EXISTS`.
2. For a new column on an existing table, add a `hasColumn` migration. The existing ones show the pattern. A migration only adds.
3. Put the queries in `storage/<domain>.ts`. Map rows to types with a `toX(row)` function. Use `BEGIN`, `COMMIT`, and `ROLLBACK` for writes that touch several statements.
4. Update `agent/data-model.md`.

### Add an agent tool
1. Create a module in `src/backend/app/tools/`, exporting a `ToolSpec`. Give it a `description` (one line, for search), a `guide` (one paragraph on when and how to use it), and an `inputSchema`. Return `ok(text)` or `fail(text)` from `tools/result.ts`.
2. List it in `app/tools/index.ts`: in `BASIC_TOOLS` if every run should have it, or in `DEFERRED_TOOLS` if the model should find it with `tool_search`.
3. Agents get it through `AGENT_TOOLS` or `AGENT_DEFERRED`. Bots get it through `BOT_TOOLS` or `BOT_DEFERRED`. A bot's turn has its own run token and no workspace, so a bot tool must not need a folder. A bot's tool guides go into its system prompt, the same as an agent's.
4. Paths go through `inWorkspace` (`tools/workspace.ts`).
5. Each provider gets the tools through its own adapter: Claude through `/mcp`, Pi as a custom tool.
6. Update `agent/backend.md` and the tool section of `agent/architecture.md`.

### Add a provider
1. Implement `AgentProvider` (`adapters/contract.ts`) in `src/backend/adapters/<name>.ts`. Map its output to `AgentEvent`. Always end a run with `done` or `error`.
2. Register it in the array in `src/backend/app/providers.ts`.
3. Sign-in methods are optional (`startSignIn`, `signInProgress`, `answerSignIn`, `signOut`). Set `capabilities.signIn` to match.

### Add a dashboard card
1. Create `src/frontend/features/<name>/<Name>Card.tsx` with `Card` and `CardBody` from `ui/Card.tsx`. Pick a `glow` color, and add a `.glow-<name>` rule in `styles.css` if the color is new.
2. A card whose content changes when expanded reads the state with `useCardExpansion()`, inside the card.
3. Put state in a hook next to the card. Fetch only through `api`.
4. Add the card to `App.tsx` in the grid, where you want it.
5. A small list with a view choice uses `RunScopePills` from `ui/`, so every card's pill looks and grows the same way.
6. Dialogs: use `Modal` (controlled by `open`). Confirmations: use `ConfirmDialog`.
7. Cross-card changes: call `announce(name)` in `api/events.ts`, and listen with `useAnnouncement`.

### Add a dialog
Use `ui/Modal.tsx`. Pass `open`, `onClose`, `closeButton` (round X, top right), and `boxClassName` for the size. Put the content as children. Put a nested `ConfirmDialog` beside the `Modal`, not inside it.

### Add a frontend API call
Use `api.get|post|put|patch|del` from `api/client.ts`. Add the response type to `api/types.ts`. Catch with `errorText(err)` and show it with `ErrorAlert`.

## Gotchas (read before changing these areas)
- Two copies of the default persona id: `api/constants.ts` and `src/backend/app/personas.ts`.
- Native `confirm()` is still used in `SignInPanel.tsx` (sign-out). The rest of the app uses `ConfirmDialog`. Prefer `ConfirmDialog` for new code.
- A Pi run that fails reports the last assistant error when the turn ends without a retry (`agent_end` in `adapters/pi.ts`). Before this, a failed call looked like an empty reply.
- Pi's `capabilities` says `tools: false, mcp: false`. Pi still gets the app's tools, because the run passes them to every provider. The flags are informational.
- Room turns get no memory recall, no repository note, and no skills. Only agent runs (`app/runs.ts`) build the system prompt that way.
- `POST /api/memory` answers 200, while other creates answer 201. This is kept for the dashboard.
- Routes match on segments, so `/api/memory/` (with a trailing slash) is accepted.
- Runs left `running` by a crash are marked `error` on the next start. Clones left `cloning` are marked `error` too.
- Bash is not sandboxed. It runs with the user's permissions.
- The status row under the bots transcript must keep `h-5 flex-none`, or the transcript jumps.
- Card entrance timing is random per mount. Don't add position-based animation delays. Set `--enter-delay` on the element instead.
- The memory graph's sizing and note count only count nodes that have a note.
- Each room is one conversation at a time. A second post to a busy room gets 409. Other rooms are not held up.
- `git` runs with `GIT_TERMINAL_PROMPT=0`. A clone that needs a password fails instead of waiting.
- A write to a synced table must set its change time (see `data-model.md`). A write that skips it is lost in a GitHub sync merge.
- mip never stores the GitHub token. Each sync gets it from `gh auth token` and passes it to git through `authEnv`, never in argv or a config file. Don't log it or write it anywhere.
- Bot colors live in three places that must match: `storage/bot-colors.ts`, `features/bots/botColors.ts`, and a `.bot-<name>` class per color in `styles.css`. `app/bots.test.mjs` checks the lists against each other and against the stylesheet.
- Sync refuses a public `dotmip` repo, and it refuses an empty database when the last sync had data.
- The synced repo's folder is `agents/`. A repo or saved `base.json` from before the rename keeps its agents under `chats`, and sync still reads it. A machine on an older version that syncs after the change sees its chats missing and deletes them, so upgrade every machine before syncing. Bot records carry a color too, which an older version drops when it writes a bot. Rooms are a part of their own (`rooms.json`), and room messages carry their room id. An older version knows neither, so it puts every message it syncs into `main`, and its writes drop the rooms. Upgrade every machine before syncing.
- The `SyncStatus` type in `api/types.ts` must match `app/sync/engine.ts`.
- Tool guidance lives in each tool's `guide`, never in a persona. The built-in persona keeps identity and style only. An unedited copy of the old built-in persona is updated at startup; an edited one is left alone.
- A skill can be created from a form or imported from a folder. Both paths check the same header rules. Create never replaces an installed skill, and import asks for review first.
- Skills are text only. Imports refuse scripts, binaries, symbolic links, and oversized folders. A skill is read only through `skill_read` and `skill_file`. Every agent and bot can read every installed skill.
- Claude runs with `--disable-slash-commands`, and Pi with `noSkills: true`. Skills reach the model only through the app's tools.
- Each kind of run has its own tool lists. A tool is offered to a run only when that run's list includes it, and the MCP endpoint checks the same list.
- MCP servers: `data/mcp.json` can hold tokens, so it never syncs. The status API never returns environment values or headers. An MCP tool is deferred for agents, and no bot gets one yet.
- A rename of a word must skip the names of libraries. daisyUI's chat bubbles use the classes `chat`, `chat-start`, `chat-end`, `chat-header`, `chat-bubble`, and `chat-bubble-*`. The chat-to-agent rename once broke them, so the bubbles rendered as plain text. Check the class names of the library after a rename.
- Expanded cards step their text up one size. Put that in `RunScopePills` and the card's own classes, not in one-off styles.

## Git
- Push every change to `origin main`, as the GitHub account CorneliusTantius. No attribution lines (no Co-Authored-By, no "Generated with").
- Commit with: `git -c user.name=CorneliusTantius -c user.email=65766122+CorneliusTantius@users.noreply.github.com commit -m "..."`.
- Before committing, scan the diff for secrets. Never force-push. Check that local `HEAD` equals `origin/main` after the push.
- Before a commit, check `git status` for staged leftovers. A plain `git commit` includes anything already staged.
