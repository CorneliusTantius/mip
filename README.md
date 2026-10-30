# mip

A personal AI OS. It runs chats through model providers (the Claude CLI and Pi) behind one interface. Each chat gets its own workspace, the same tools, and shared memory.

## Providers

| Provider | How it runs | Sign-in |
| --- | --- | --- |
| `claude-cli` | The official `claude` CLI, streamed | Your Claude subscription, through `claude auth login` |
| `pi` | Pi's SDK, in-process (`@earendil-works/pi-coding-agent`) | Per Pi provider: a subscription login where offered, or an API key |

Pi's Anthropic provider is hidden. Its only option is an API key, which bills separately from your Claude subscription.

## Requirements

- Node.js 20 or newer (developed on v26 LTS)
- For `claude-cli`: the `claude` CLI, signed in with your subscription

## Run

```bash
npm install
npm run build
npm run serve
```

Open http://127.0.0.1:3000. The gear icon opens Settings, where you sign providers in and out. Set `CLAUDE_BIN` if `claude` isn't on your PATH.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `CLAUDE_BIN` | `claude` | Path to the `claude` binary |
| `MIP_PORT` | `3000` | Dashboard port, on 127.0.0.1 only |
| `MIP_HOME` | `~/.mip` | Where mip keeps its data (see Storage) |

The Claude CLI runs without `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN`, so it uses your subscription login. Don't add `--bare` to the CLI call: it ignores subscription login. Pi keeps its credentials in `~/.pi/agent/auth.json`.

## Chats

Each chat has a name, a persona, a model, a thinking level, and its own workspace. The persona is chosen when the chat is created and stays for the chat's life.

**Personas**

- A persona is a name and a system prompt. The prompt replaces each provider's own default prompt.
- Create, edit, and delete personas in Settings, under Config. They're stored in SQLite.
- The built-in **Default** is a general assistant that also handles coding, and it explains the app's tools. It can be edited but never deleted. Its text in `src/backend/app/personas.ts` is written to the database only when the database is created. Later changes are made in Settings.
- One persona is the default for new chats. Pick one and click "Set as default".
- A persona can't be deleted while chats use it.
- Claude's replacement drops Claude Code's built-in tool instructions, so a custom persona should explain the app's tools too.
- Pi's project files (`AGENTS.md` and similar) are off. Claude still reads `CLAUDE.md` in the working folder.

**Model and thinking**

Two dropdowns above the message box set the chat's model and thinking level. Both are saved with the chat and apply to the next message. Both lists come from the provider:

- **Claude:** the CLI's own model list, with the thinking levels each model accepts. The app caches it for ten minutes. Thinking maps to the CLI's `--effort` setting. "Default" passes no model or effort.
- **Pi:** the models of the providers you're signed in to. Each model's thinking levels come from Pi's rules for that model. Pi lowers a level a model doesn't support.

A model with no thinking levels disables the thinking dropdown. Switching to a model that lacks the chat's level clears that level.

**Background runs**

A message is a run. It keeps going after the browser closes, and each event is saved to SQLite as it arrives. Reopening the chat shows the reply so far and follows it to the end. A run cut off by a server restart is marked as failed.

**Names**

A new chat gets a random name from a bank of Norse names: gods, giants, valkyries, dwarves, heroes, saga figures, and rulers of the Viking Age. No two chats share a name at the same time. The bank is in `src/backend/app/names.ts`.

## Memory

Memory is one set of notes shared by every chat. Notes live in SQLite with a full-text index.

- A note links to another with `[[Title]]` and is tagged with `#tag`. Links to notes that don't exist yet are kept.
- Titles ignore case. Saving a title that already exists replaces that note.
- Before each run, the notes that best match the message are added to the system prompt.
- Agents have three memory tools: `memory_search`, `memory_read`, and `memory_edit`. They can search and read any note, and edit a note that exists. They can't create or delete notes, so memory grows only when you add to it.
- `memory_edit` replaces one exact piece of a note. It refuses if that text isn't in the note exactly once.
- The **Memory card** on the main page draws the notes as a graph. Drag to pan, scroll to zoom, double-click to reset, hover a dot to see its links, and click a dot to open its note.
- **See more** opens the memory screen, where you can search, read, create, edit, and delete notes. Links and backlinks are clickable.

## Tools

Every provider gets the same seven tools, defined in `src/backend/app/tools/`: `read`, `write`, `edit`, `bash`, and the three memory tools.

- **Pi** gets them as custom tools. Pi's own copies are off.
- **Claude** reaches them through the app's `/mcp` endpoint. Each run gets a token that opens only that run's workspace, and the token stops working when the run ends. Claude's built-in tools are off for these runs.
- Each chat's files live in `~/.mip/workspaces/<chat id>`. The file tools refuse paths outside it.
- `bash` is not sandboxed. It runs with your user's access. Nothing asks for approval, so writes and commands run right away.

## Repositories

The **Repositories** card on the main page clones git repositories, and gives each chat its own copy.

- Paste a clone link: `https://`, `ssh://`, `git@host:path`, or any form git accepts. mip clones it with your own `git` into `~/.mip/repos/<name>`, so private repositories work when your git can reach them. The folder name comes from the link.
- The list shows each repository, its status, and the chats that have a copy. Choose a chat under "Copy to a chat" to give it one.
- A copy is a separate clone in that chat's workspace, at `~/.mip/workspaces/<chat id>/<name>`. Its `origin` is the real link, so pushes go to that remote.
- Each run tells the agent which repositories are in its workspace.
- Removing a repository deletes its master clone. Copies in chats stay. Deleting a chat deletes its workspace, copies included.

## HTTP API

All routes are on the dashboard port. Requests and responses are JSON.

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/providers` | Providers, their models, and sign-in state |
| POST | `/api/providers/:id/targets/:target/sign-in` | Start sign-in. Body: `{ method }` |
| POST | `/api/providers/:id/targets/:target/answer` | Answer a sign-in prompt. Body: `{ answer }` |
| POST | `/api/providers/:id/targets/:target/sign-out` | Sign out |
| GET | `/api/sessions` | List chats |
| POST | `/api/sessions` | Create a chat. Body: `{ providerId, personaId }` |
| GET | `/api/sessions/:id` | A chat, its messages, and its active run |
| PATCH | `/api/sessions/:id` | Rename, and/or set `model` and `thinking` |
| DELETE | `/api/sessions/:id` | Delete a chat. Returns 409 while it runs |
| POST | `/api/run` | Send a message. Body: `{ sessionId, prompt }`. Returns `{ runId }` |
| GET | `/api/runs/:id/events?after=N` | Events after sequence N, and the run's status |
| GET | `/api/personas` | List personas |
| POST | `/api/personas` | Create. Body: `{ name, systemPrompt }` |
| PUT | `/api/personas/:id` | Edit. Body: `{ name, systemPrompt }` |
| DELETE | `/api/personas/:id` | Delete |
| POST | `/api/personas/:id/default` | Make it the default |
| GET | `/api/memory?q=` | List notes, or search them with `q` |
| POST | `/api/memory` | Create or replace a note. Body: `{ title, body }` |
| GET | `/api/memory/:title` | Read a note |
| DELETE | `/api/memory/:title` | Delete a note |
| GET | `/api/graph` | Notes and links, for the memory card |
| GET | `/api/repos` | Repositories, with the chats that have a copy |
| POST | `/api/repos` | Clone a link. Body: `{ url }`. Returns 202, and the repository shows `cloning` until done |
| DELETE | `/api/repos/:id` | Remove a repository's master clone |
| POST | `/api/repos/:id/copies` | Copy a repository into a chat. Body: `{ sessionId }` |
| POST | `/mcp` | Tool endpoint for the Claude CLI. Needs a run's bearer token |

## Storage

Everything mip writes lives under `~/.mip`. Change it with `MIP_HOME`.

```
~/.mip/
  data/mip.db           SQLite: personas, chats, messages, runs, memory, repositories
  repos/<name>/         Master clones from the Repositories card
  sessions/claude/      Claude CLI config, login, and chat files
  sessions/pi/          Pi session files
  workspaces/<chat id>/ Each chat's files, and its repository copies
```

## Layout

The backend and the frontend are separate. A request flows from `http` to `app`, and `app` calls `adapters` and `storage`. `adapters` know only the contract they implement, and `storage` knows nothing above it.

```
src/backend/
  http/       routes (server.ts) and the /mcp tool endpoint (mcp.ts)
  app/        use cases: providers, chats, runs, personas, memory, repositories, tools, git
  adapters/   one file per provider, plus contract.ts, the interface they implement
  storage/    SQLite (store.ts) and folder paths (paths.ts)

src/frontend/ the dashboard, in Preact with daisyUI, built by Vite
  App.tsx, Chat.tsx, Settings.tsx    the page, the chat room, and settings
  Memory*.tsx, graph-layout.ts       the memory card, graph, and memory screen
  RepositoriesCard.tsx               the repositories card
  ConfirmDialog.tsx, OptionDropdown.tsx  shared controls
  styles.css                         the Nord theme
```

`npm run dev:frontend` starts Vite with hot reload. `npm run build` builds both sides into `dist/`.
