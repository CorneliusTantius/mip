# Conventions and recipes

## Style
- TypeScript strict on both sides. ESM with `.js` import suffixes in the backend (NodeNext). Bundler resolution in the frontend.
- One concern per file. Feature code lives in `features/<name>/`. Shared UI lives in `ui/`. HTTP lives in `api/`.
- Each exported function or component has a comment that says what it is for, not how it works. Keep that density.
- Backend: route handlers only parse input, call one `app/*` function, and return a `Reply`. Validation lives in `app/*`. Client mistakes throw `AppError`.
- Frontend: fetch only through `api/client.ts`. Use `Card`/`CardBody` for every dashboard card, `Modal` for every dialog, `ErrorAlert` for every error box, `Icon` for every icon.
- Frontend: don't import across features. Shared code goes to `ui/` or `api/`.
- Names: components PascalCase (`.tsx`), hooks `useX` (`.ts`), pure rules in plain `.ts` modules (`mentions.ts`, `graph-layout.ts`).

## Verify before committing
    npm run typecheck
    npm run build
    node src/backend/app/room-engine.test.mjs
    node src/backend/app/sync/merge.test.mjs
    node src/backend/app/sync/sync.test.mjs
For behavior: restart the server after `build:backend` (`npm run build:backend`, then stop and start `dist/backend/http/server.js`). Frontend-only changes: `npm run build:frontend` is enough; the server reads `dist/frontend` on each request.
Browser check: open http://127.0.0.1:3000, then the affected card. Check the console for errors.
API regression check (used in the 2026-10-31 refactor): record each route's status and body before and after a change, then diff. The probe list is the route table in `api.md`.

## Recipes

### Add an HTTP route
1. Add a `get|post|put|patch|del(path, handler)` entry to `src/backend/http/routes/<domain>.ts`. Path params use `:name`.
2. If the domain is new, create the file and add its array to the spread in `src/backend/http/routes/index.ts:13`.
3. Handler returns `ok`, `created`, `accepted`, `ack`, or `notFound` from `http/respond.ts`. Throw `AppError(status, message)` for errors.
4. Put the logic in an `app/*` function, and storage access in `storage/*`.
5. Add the route to `agent/api.md`.

### Add a storage table or query
1. Add the table to the schema block in `storage/db.ts:13-92` with `CREATE TABLE IF NOT EXISTS`.
2. For a new column on an existing table, add a `hasColumn` migration (`db.ts:100-111` shows the pattern).
3. Put queries in `storage/<domain>.ts`. Map rows to types with a `toX(row)` function. Use `BEGIN`/`COMMIT`/`ROLLBACK` for multi-statement writes.
4. Update `agent/data-model.md`.

### Add an agent tool
1. Create `src/backend/app/tools/<name>.ts` exporting a `ToolSpec` (`adapters/contract.ts:24`). Return `ok(text)` or `fail(text)` from `tools/result.ts`.
2. Add it to the `TOOLS` array in `src/backend/app/tools/index.ts:21`. Every provider gets it: Claude through `/mcp`, Pi as a custom tool.
3. Paths must go through `inWorkspace` (`tools/workspace.ts:23`).
4. Update `agent/backend.md` and `agent/flows.md` §6.

### Add a provider
1. Implement `AgentProvider` (`adapters/contract.ts:104`) in `src/backend/adapters/<name>.ts`. Map its output to `AgentEvent` (`contract.ts:4`). Always end a run with `done` or `error`.
2. Register it in the array in `src/backend/app/providers.ts:9-12`.
3. Sign-in methods are optional (`startSignIn`, `signInProgress`, `answerSignIn`, `signOut`). Set `capabilities.signIn` to match.

### Add a dashboard card
1. Create `src/frontend/features/<name>/<Name>Card.tsx` with `Card` and `CardBody` from `ui/Card.tsx`. Pick a `glow` color.
2. A new color needs a `.glow-<name>` rule in `styles.css` (see `:132-145`).
3. Put state in a hook next to the card. Fetch only through `api`.
4. Add the card to `App.tsx` in the grid, in the position you want. Entrance timing comes from `Card`, so nothing else is needed.
5. Dialogs: use `Modal` (controlled by `open`). Confirmations: use `ConfirmDialog`.
6. Cross-card changes: call `announce(name)` in `api/events.ts`, and listen with `useAnnouncement`.

### Add a dialog
Use `ui/Modal.tsx`. Pass `open`, `onClose`, `closeButton` (round X, top-right), and `boxClassName` for the size. Put the content as children. Put any nested `ConfirmDialog` next to the `Modal`, not inside it.

### Add a frontend API call
Use `api.get|post|put|patch|del` from `api/client.ts`. Add the response type to `api/types.ts`. Catch with `errorText(err)` and show it with `ErrorAlert`.

## Gotchas (read before changing these areas)
- Two copies of the default persona id: `api/constants.ts:4` and `src/backend/app/personas.ts:7`.
- Native `confirm()` is still used in `SignInPanel.tsx` (sign-out). The rest of the app uses `ConfirmDialog`. Prefer `ConfirmDialog` for new code.
- Pi's `capabilities` says `tools: false, mcp: false` (`adapters/pi.ts:117`). Pi still gets the app tools, because `runs.ts` passes `TOOLS` to every provider and Pi maps them in `run`. The flags are informational; they are not checked before a run.
- Room turns get no memory recall and no repository note. Only runs (`app/runs.ts`) build the system prompt that way.
- `POST /api/memory` answers 200, while other creates answer 201. This is kept for the dashboard.
- Routes match on segments, so `/api/memory/` (trailing slash) is accepted. The old router required an exact match.
- Runs left `running` by a crash are marked `error` on the next start (`storage/db.ts:114`). Clones left `cloning` are marked `error` too.
- Bash tool is not sandboxed. It runs with the user's permissions.
- The status row under the bots transcript must keep `h-5 flex-none` (`BotsCard.tsx`), or the transcript jumps.
- Card entrance timing is random per mount (`ui/Card.tsx`), so the order changes on every page load. Don't add position-based animation delays. Set `--enter-delay` on the element instead.
- The memory graph's degree-based sizing and the note count count only nodes with a note (`MemoryCard.tsx`).
- The room is one conversation at a time (`app/room.ts:14`). A second post while busy gets 409.
- `git` runs with `GIT_TERMINAL_PROMPT=0` (`app/git.ts`). A clone that needs a password fails instead of waiting.
- A write to a synced table must set its change time (`data-model.md` invariants). A write that skips it is lost in a GitHub sync merge.
- mip never stores the GitHub token. Each sync gets it from `gh auth token` (`ghToken`, `app/sync/github.ts`) and passes it to git through `authEnv`, never in argv or a config file. Don't log it or write it anywhere.
- Sync refuses a public `dotmip` repo and an empty database when the last sync had data (`app/sync/engine.ts`).
- The `SyncStatus` type in `api/types.ts` must match `app/sync/engine.ts`.

## Git
- Push every change to `origin main`, as the GitHub account CorneliusTantius. No attribution lines (no Co-Authored-By, no "Generated with").
- Commit with: `git -c user.name=CorneliusTantius -c user.email=65766122+CorneliusTantius@users.noreply.github.com commit -m "..."`.
- Before committing, scan the diff for secrets. Never force-push. Check that local `HEAD` equals `origin/main` after the push.
- Before a commit, check `git status` for staged leftovers. A plain `git commit` includes anything already staged. (This caused one broken push in the 2026-10-31 refactor, fixed by the next commit.)
