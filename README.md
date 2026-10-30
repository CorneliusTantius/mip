# mip

An AIOS that routes tasks to model providers. Providers sit behind one interface, so the dashboard, the CLI, and the agent loop don't depend on any one of them.

## Providers

| Provider | How it runs | Sign-in |
| --- | --- | --- |
| `claude-cli` | Runs the official `claude` CLI and streams its output | Your Claude subscription, through `claude auth login` |
| `pi` | Runs Pi's SDK in-process (`@earendil-works/pi-coding-agent`) | Per Pi provider: subscription login where offered, or an API key |

Pi's Anthropic entry offers an API key only. Reported terms restrict using a Claude Pro/Max token inside a third-party tool, so mip doesn't offer that login for Anthropic inside Pi.

## Requirements

- Node.js 20+ (developed on v26 LTS)
- For `claude-cli`: the `claude` CLI, logged in with your subscription

## Setup

```bash
npm install
npm run build
```

## Dashboard

```bash
npm run serve
```

Open http://127.0.0.1:3000. The gear icon opens Settings, which lists each provider with its capabilities and sign-in targets. From there you can sign in, answer a sign-in prompt, or sign out.

Set `CLAUDE_BIN` if the `claude` binary isn't on PATH.

## Command line

```bash
npm start -- "summarize the README in this folder"
npm start -- "continue the last task" --session <id>
npm start -- "explain this error" --provider pi --model <provider>/<model-id>
```

`--provider` defaults to `claude-cli`. Each run prints the answer, then the session id on stderr, so you can resume it with `--session`. `--model` takes `provider/model` for Pi.

## HTTP API

- `GET /api/providers`: providers, capabilities, sign-in targets, and any sign-in in progress
- `POST /api/providers/:provider/targets/:target/sign-in` with `{"method": "..."}`
- `POST /api/providers/:provider/targets/:target/answer` with `{"answer": "..."}`
- `POST /api/providers/:provider/targets/:target/sign-out`
- `POST /api/run` with `{"provider", "prompt", "model?", "sessionId?"}`: streams newline-delimited JSON events

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `CLAUDE_BIN` | `claude` | Path to the claude binary |
| `MIP_PORT` | `3000` | Dashboard port, bound to 127.0.0.1 |
| `MIP_HOME` | `~/.mip` | Where mip keeps all its data (see Storage) |

`ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` are removed from the child process environment for `claude-cli`, so the CLI uses your subscription login. Don't pass `--bare` to the CLI: it ignores subscription login.

Pi keeps its credentials in `~/.pi/agent/auth.json`, the same place the `pi` CLI uses.

## Storage

Everything mip writes lives under `~/.mip` (change it with `MIP_HOME`):

```
~/.mip/
  data/mip.db          SQLite: chat sessions and messages
  sessions/
    claude/            Claude CLI config and chat files (CLAUDE_CONFIG_DIR)
    pi/                Pi session files
```

Claude keeps its login in `~/.mip/sessions/claude` too, so after this change sign in to Claude again from Settings.

## Personas

A persona is a name and a system prompt. The prompt replaces each provider's own default prompt.

- Open Settings, then Config to create, edit, or delete personas. Personas are stored in the `personas` table in `~/.mip/data/mip.db`.
- The built-in `Default` persona is a general assistant that also handles coding work. Its text is in `src/backend/app/personas.ts`. It can be edited, but never deleted. That file's text is written to the database only when the database is created, so an existing install keeps its saved text. Edit it under Settings, then Config.
- One persona is the default. New chats start with it, and the CLI uses it. To change it, pick a persona in Config and click "Set as default". The current default can't be deleted.
- When you create a session, pick a persona. The chat keeps that persona for its whole life. Edits to a persona apply to the next message in every chat that uses it.
- A persona can't be deleted while chats still use it.
- Pi's project context files (`AGENTS.md` and similar) are turned off so each run sees the same prompt. Claude still reads `CLAUDE.md` files in the working folder.
- Claude's replacement drops Claude Code's built-in tool instructions. The Default persona explains the app's tools itself. A custom persona should do the same, or tool use may suffer.

## Model and thinking

Each chat has a model and a thinking level, picked with the two dropdowns above the message box. Both are saved with the chat and apply to the next message. The lists come from the provider, not from the app:

- **Claude:** the CLI reports its own model list, with the thinking levels each model accepts. The app reads it over the CLI's control channel and keeps it for ten minutes. Thinking is the CLI's `--effort` setting. The first entry, "Default", is the model the CLI uses when none is picked.
- **Pi:** the models are the ones of the providers you have signed in to. Each model's thinking levels come from Pi's own rules for that model. The first entry is the model a run uses when none is picked.

A model with no thinking levels shows a disabled thinking dropdown. Changing to a model that doesn't have the chat's thinking level clears that level.

## Memory

Memory is one set of notes that every agent shares. Notes live in SQLite (`notes`, with a full-text index), and their links and tags are kept in their own tables.

- Agents use three tools: `memory_search`, `memory_read`, and `memory_edit`. They can search and read every note, and edit a note that already exists. They can't create or delete notes. The user does that in the memory screen, so the memory doesn't grow on its own.
- `memory_edit` replaces one exact piece of a note's text. It refuses if that text isn't in the note exactly once.
- A note links to another with `[[Title]]` and is tagged with `#tag`. `memory_read` shows what a note links to, what links to it, and its tags. Links to notes that don't exist yet are kept.
- Titles ignore case. Writing a title that already exists replaces that note.
- Before each run, the notes that best match the message are added to the system prompt, so the agent starts with what memory holds.
- The Memory card on the main page draws the notes as a graph, like Obsidian's. Drag to pan, scroll to zoom, double-click to reset, hover a dot to see its links, and click a dot to open its note.
- See more opens the full memory screen, where you can search, read, create, edit, and delete notes. Links and backlinks are clickable, and a link to a note that doesn't exist yet can be created from there.

## Background runs

A message is a run. It keeps going after the browser closes, and each event is saved to SQLite as it arrives. Reopening the chat shows the reply so far, and keeps following it until it finishes. A run cut off by a server restart is marked as failed.

## Chat names

A new chat gets a random name from a bank of names from ancient gods, heroes, philosophers, and more. No two chats share a name at the same time. The bank is in `src/backend/app/names.ts`.

## Tools

The app owns four tools: `read`, `write`, `edit`, and `bash`. They're defined once in `src/backend/app/tools/`, and every provider gets the same four.

- **Pi** gets them as its custom tools. Pi's own copies are turned off.
- **Claude** gets them from the app's MCP endpoint at `/mcp`, which needs a token issued for each run. The token opens only that run's workspace, and it stops working when the run ends. Claude's built-in tools are turned off for these runs, so only these four are allowed.
- Each chat is an agent with its own workspace folder, `~/.mip/workspaces/<chat id>`. Paths outside that folder are refused.
- `bash` is not sandboxed. It runs with your user's access.
- Nothing asks for approval yet. Writes and commands run straight away.

## Layout

Backend (`src/backend/`, Node + TypeScript, built to `dist/backend`):

The backend has three layers. Each one may only import from the layers listed after it:

- **Adapters** (`src/backend/adapters/`): one file per provider, plus the contract they implement. An adapter knows only its provider and the contract. It gets its folder as an option and never reads app config.
  - `contract.ts`: the provider interface and event types
  - `claude-cli.ts`, `pi.ts`: the Claude CLI and Pi adapters
  - `sign-in-session.ts`, `async-queue.ts`: shared helpers
- **App** (`src/backend/app/`): the use cases. Each file exports plain functions.
  - `providers.ts`: which providers exist, where each keeps its files, sign-in actions
  - `sessions.ts`: chat sessions and running a turn (saves both sides to SQLite)
  - `system-prompt.ts`: read and save the system prompt
  - `errors.ts`: `AppError`, which carries the HTTP status
- **Storage** (`src/backend/storage/`): SQLite and folder paths.
  - `store.ts`: sessions, messages, and config tables
  - `paths.ts`: where `~/.mip` lives
- **HTTP** (`src/backend/http/`): routes only. Each route parses the request and calls the app layer.
  - `server.ts`: API routes
  - `static.ts`: serves the dashboard build
- **CLI** (`src/backend/cli/index.ts`): command-line entry point, which calls the app layer.

Frontend (`src/frontend/`, Vite + Preact + daisyUI, built to `dist/frontend`):

- `src/frontend/App.tsx`: the dashboard
- `src/frontend/Chat.tsx`, `Settings.tsx`, `Memory.tsx`: the chat, settings, and memory screen
- `src/frontend/MemoryCard.tsx`, `MemoryGraph.tsx`, `graph-layout.ts`: the memory card, its graph, and the layout that places the dots
- `src/frontend/ConfirmDialog.tsx`: the in-page delete confirmation. The browser's own confirm box can be blocked, which made a delete button look dead.
- `src/frontend/main.tsx`, `src/frontend/index.html`, `src/frontend/styles.css`: entry, page, and the Nord theme
- `npm run dev:frontend` for hot reload; `npm run build` bundles both sides
