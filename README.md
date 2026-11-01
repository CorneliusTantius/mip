# mip

For AI agents: start at [agent/README.md](agent/README.md).

A personal AI OS. It runs agents through model providers (the Claude CLI and Pi) behind one interface. Each agent gets its own workspace, the same tools, and shared memory.

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

Open http://127.0.0.1:3000. The gear icon opens Settings, where you sign providers in and out, and update mip (see Updating). Set `CLAUDE_BIN` if `claude` isn't on your PATH.

## Updating

Settings → **Update** has two buttons:

- **Pull latest** fetches the newest commits on this checkout's branch (fast-forward only) and shows git's output.
- **Restart** installs dependencies, builds, and starts the server again. The page reloads when the server answers. Its output goes to `~/.mip/restart.log`. If the build fails, the server still starts on the last good build, and the log shows the error.

Both run git and npm on this machine, so the server accepts them only as JSON requests.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `CLAUDE_BIN` | `claude` | Path to the `claude` binary |
| `MIP_PORT` | `3000` | Dashboard port, on 127.0.0.1 only |
| `MIP_HOME` | `~/.mip` | Where mip keeps its data (see Storage) |

The Claude CLI runs without `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN`, so it uses your subscription login. Don't add `--bare` to the CLI call: it ignores subscription login. Pi keeps its credentials and settings in mip's data folder, `~/.mip/data`: credentials in the database, and `settings.json` and `models.json` in `data/pi/`. On the first start, mip copies the credentials from `~/.pi/agent/auth.json` once, and leaves that file as it is.

## Sync to GitHub

Settings → **Sync** keeps your agents, notes, personas, bots, MCP servers, and Pi's credentials, model catalogs, and settings in a private repo named `dotmip` on your GitHub account. MCP servers and Pi credentials come with their tokens and keys, so keep that repo private. Repository clones, agent files, and provider logins stay on this machine.

1. Sign in to the GitHub CLI once on this machine: `gh auth login`. Sync uses one of the accounts it is signed in to. If there is more than one, pick the account in Settings → Sync. mip never stores a token.
2. Click **Sync now** in Settings → Sync. It creates `dotmip` if it does not exist, pulls changes, merges them with this machine, and pushes the result.

When both machines edited the same note, persona, bot, agent setting, or Pi credential, the newer edit wins. The sync log says so. For an MCP server or a Pi settings file edited on both sides, GitHub's copy is kept. Messages from both sides are kept, and an edit beats a delete. An agent that is running is not deleted by a sync. The clocks on both machines must be right.

An agent synced from another machine shows its history, but the model starts a new conversation there, because provider session files are not synced.

## Agents

Each agent has a name, a persona, a model, a thinking level, and its own workspace. The persona is chosen when the agent is created and stays for the agent's life.

**Personas**

- A persona is a name and a system prompt. The prompt replaces each provider's own default prompt.
- Manage personas from the agent card's **Manage personas** button. Create, edit, and delete them there. They're stored in SQLite.
- The built-in **Default** is a general assistant that also handles coding, and it explains the app's tools. It can be edited but never deleted. Its text in `src/backend/app/personas.ts` is written to the database only when the database is created. Later changes are made in Settings.
- One persona is the default for new agents. Pick one and click "Set as default".
- A persona can't be deleted while agents use it.
- Claude's replacement drops Claude Code's built-in tool instructions, so a custom persona should explain the app's tools too.
- Pi's project files (`AGENTS.md` and similar) are off. Claude still reads `CLAUDE.md` in the working folder.

**Model and thinking**

Two dropdowns above the message box set the agent's model and thinking level. Both are saved with the agent and apply to the next message. Both lists come from the provider:

- **Claude:** the CLI's own model list, with the thinking levels each model accepts. The app caches it for ten minutes. Thinking maps to the CLI's `--effort` setting. "Default" passes no model or effort.
- **Pi:** the models of the providers you're signed in to. Each model's thinking levels come from Pi's rules for that model. Pi lowers a level a model doesn't support.

A model with no thinking levels disables the thinking dropdown. Switching to a model that lacks the agent's level clears that level.

**Background runs**

A message is a run. It keeps going after the browser closes, and each event is saved to SQLite as it arrives. Reopening the agent shows the reply so far and follows it to the end. A run cut off by a server restart is marked as failed.

**Names**

A new agent gets a random name from a bank of Norse names: gods, giants, valkyries, dwarves, heroes, saga figures, and rulers of the Viking Age. No two agents share a name at the same time. The bank is in `src/backend/app/names.ts`.

An agent can ask you a question with buttons, a checklist, a text box, or a slider. A choice and a checklist also have an Other option for your own answer. The controls show under its reply, and your answer is sent as your next message.

## Bots

Bots are named agents, and they talk in rooms. Create them with **Manage bots** on the Bots card. Each bot has a name, a persona, and a provider, with its model and thinking level.

- Make a room with **+ New room**, and pick the bots in it with **Room settings**. A bot can be in several rooms, and each room has its own messages.
- Post in a room. A bot in that room that you mention with `@Name` answers first. Bots can mention each other, so one reply can start another bot's turn.
- If nobody is mentioned, every bot in the room takes a turn in order.
- Each bot has a color, set in its settings. Its messages take a light tint of it, and each `@Name` is a pill in that color. Click a pill to see the bot's profile.
- A bot with nothing to add replies `PASS`.
- One message sets off at most 8 turns. After that the room waits for your next message.
- Each turn sees the last 30 messages of its room. A bot has nine tools: memory search, memory read, memory edit (only for notes that already exist), skill search, skill read, skill file, a search of its room's messages, and tool search and tool call, which reach its MCP tools. Its Claude turns run with the built-in tools turned off.
- Bots only run when you post. Nothing runs on a schedule yet.

A bot can send a task to an agent that you have opened to bots, with the "Bots may ask" switch in the agent's composer. The agent does the task in its own chat, with its own tools, and its reply is posted to the room. A room sends one task at a time.

## Memory

Memory is one set of notes shared by every agent. Notes live in SQLite with a full-text index.

- A note links to another with `[[Title]]` and is tagged with `#tag`. Links to notes that don't exist yet are kept.
- Titles ignore case. Saving a title that already exists replaces that note.
- Before each run, the notes that best match the message are added to the system prompt.
- Agents have three memory tools: `memory_search`, `memory_read`, and `memory_edit`. They can search and read any note, and edit a note that exists. They can't create or delete notes, so memory grows only when you add to it.
- `memory_edit` replaces one exact piece of a note. It refuses if that text isn't in the note exactly once.
- The **Memory card** on the main page draws the notes as a graph. Drag to pan, scroll to zoom, double-click to reset, hover a dot to see its links, and click a dot to open its note.
- Expand the **Memory card** with its expand button to get the memory screen, where you can search, read, create, edit, and delete notes. Links and backlinks are clickable. A click on a dot in the graph expands the card on that note.

## MCP servers

mip can connect to MCP servers and give agents their tools. List them in `~/.mip/data/mcp.json`, in the same shape Claude Code uses:

```json
{
  "mcpServers": {
    "notes": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/you/notes"] },
    "docs": { "type": "http", "url": "https://mcp.example.com/mcp", "headers": { "Authorization": "Bearer <token>" } }
  }
}
```

You can also add a server from the MCP card with **Add server**. OAuth sign-in is the default: give the server's address, then press **Sign in** on its row and sign in on the server's own page. Choose **Manual entry** for a server without OAuth: a web address with headers, or a local command with its arguments and environment. A command runs on this machine. **Remove** takes a server out of the file.

After you edit the file, call `POST /api/mcp/reload` or restart mip. Each tool appears as `mcp_<server>_<tool>`. An agent finds one with `tool_search` and runs it with `tool_call`, the same way as the app's own deferred tools. Bots get them too. The file can hold tokens. Sync carries the servers, tokens included, to your private dotmip repo.

## Skills

A skill is a folder with a `SKILL.md`: a header that gives its name and a one-line description, then its instructions. It can also hold text files that the instructions name. Add one from the **Skills** card in one of two ways. **Create** writes it from a form: a name, a one-line description, and the instructions. **Import** takes a folder: give its full path, review what will be installed, then confirm. Only text files are accepted for imports. Scripts, binaries, and symbolic links are refused, so a skill is instructions and cannot run code by itself.

Every agent and bot can use every installed skill. The model searches for one with `skill_search`, reads it with `skill_read`, and reads its files with `skill_file`. In an agent's message box, typing `/` lists the installed skills, and `/name` with a message asks for that skill for that message. mip reads only its own skills folder (`~/.mip/skills`), never your Claude Code or Pi skill folders.

## Tool calls

Each reply keeps the tool calls it made, with their inputs and results. Click **View tool calls** at the bottom of a reply to read them. The **Tools** card on the dashboard lists every tool the agents can use, and whether agents and bots may use each. Replies from before this was recorded show only the tool names. Tool calls stay on this machine and are not synced to GitHub.

## Tools

Every provider gets the same tools, defined in `src/backend/app/tools/`. Seven are always offered: `bash`, `read`, `edit`, `write`, `skill_search`, `skill_read`, and `ask_user`. Four are deferred: the three memory tools and `skill_file`. The model finds a deferred tool with `tool_search`, then runs it with `tool_call`, so the list of tools stays short. Each tool has a short guide that tells the model when and how to use it. An offered tool's guide goes into the system prompt, and a deferred tool's guide comes back with `tool_search`. The built-in persona keeps only how the assistant works.

- **Pi** gets them as custom tools. Pi's own copies are off.
- **Claude** reaches them through the app's `/mcp` endpoint. Each run gets a token that opens only that run's workspace, and the token stops working when the run ends. Claude's built-in tools are off for these runs.
- Each agent's files live in `~/.mip/workspaces/<agent id>`. The file tools refuse paths outside it.
- `bash` is not sandboxed. It runs with your user's access. Nothing asks for approval, so writes and commands run right away.

## Repositories

The **Repositories** card on the main page clones git repositories, and gives each agent its own copy.

- Paste a clone link: `https://`, `ssh://`, `git@host:path`, or any form git accepts. A link with no scheme, such as `github.com/owner/repo`, is taken as https. mip clones it with your own `git` into `~/.mip/repos/<name>`, so private repositories work when your git can reach them. The folder name comes from the link.
- Each repository shows the branch it has checked out.
- **Pull all** brings every ready repository up to the latest commit on its branch. It only fast-forwards, so it never makes a merge commit. Each row then says whether it was updated, was already up to date, or what stopped the pull. Agents' copies are separate clones, so they aren't pulled.
- The list shows each repository, its status, and the agents that have a copy. Choose an agent under "Copy to an agent" to give it one.
- A copy is a separate clone in that agent's workspace, at `~/.mip/workspaces/<agent id>/<name>`. Its `origin` is the real link, so pushes go to that remote.
- Each run tells the agent which repositories are in its workspace.
- Removing a repository deletes its master clone. Copies in agents stay. Deleting an agent deletes its workspace, copies included.

## HTTP API

All routes are on the dashboard port. Requests and responses are JSON.

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/providers` | Providers, their models, and sign-in state |
| POST | `/api/providers/:id/targets/:target/sign-in` | Start sign-in. Body: `{ method }` |
| POST | `/api/providers/:id/targets/:target/answer` | Answer a sign-in prompt. Body: `{ answer }` |
| POST | `/api/providers/:id/targets/:target/sign-out` | Sign out |
| GET | `/api/agents` | List agents |
| POST | `/api/agents` | Create an agent. Body: `{ providerId, personaId }` |
| GET | `/api/agents/:id` | An agent, its messages, and its active run |
| PATCH | `/api/agents/:id` | Rename, and/or set `model` and `thinking` |
| DELETE | `/api/agents/:id` | Delete an agent. Returns 409 while it runs |
| POST | `/api/run` | Send a message. Body: `{ agentId, prompt }`. Returns `{ runId }` |
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
| GET | `/api/bots` | List bots |
| POST | `/api/bots` | Create a bot. Body: `{ name, persona, providerId, model?, thinking?, color? }` |
| PUT | `/api/bots/:id` | Edit a bot. Same fields as create |
| DELETE | `/api/bots/:id` | Delete a bot. Its messages stay in its rooms, and it leaves every room |
| GET | `/api/rooms` | The rooms, each with its bots |
| POST | `/api/rooms` | Make a room. Body: `{ name, botIds? }` |
| PUT | `/api/rooms/:id` | Rename a room or set its bots. Body: `{ name?, botIds? }` |
| DELETE | `/api/rooms/:id` | Delete a room and its messages. The last room cannot be deleted |
| GET | `/api/room?room=ID&after=N` | A room's messages after message N, and whether that room is busy |
| POST | `/api/room/messages` | Post to a room. Body: `{ room, text }`. Returns 202, and the turns run in the background |
| GET | `/api/repos` | Repositories, with their branch and the agents that have a copy |
| POST | `/api/repos/pull` | Fast-forward every ready repository. Returns one result per repository |
| POST | `/api/repos` | Clone a link. Body: `{ url }`. Returns 202, and the repository shows `cloning` until done |
| DELETE | `/api/repos/:id` | Remove a repository's master clone |
| POST | `/api/repos/:id/copies` | Copy a repository into an agent. Body: `{ agentId }` |
| POST | `/api/system/update` | Pull the latest commits (fast-forward only). JSON request only |
| POST | `/api/system/restart` | Install, build, and restart the server. JSON request only |
| GET | `/api/sync` | GitHub sync status: the gh accounts, the one in use, and the last run |
| PUT | `/api/sync/account` | Choose the gh account sync uses. Body: `{ login }` |
| POST | `/api/sync/run` | Start a sync in the background. Poll `GET /api/sync` for the result |
| GET | `/api/tools` | The tool registry: each tool, and whether agents and bots may use it |
| GET | `/api/skills` | Installed skills, and any folders that could not be read |
| GET | `/api/skills/:name` | One skill with its instructions |
| DELETE | `/api/skills/:name` | Remove a skill from mip |
| POST | `/api/skills` | Create a skill from a form. Body: `{ name, description, body }` |
| POST | `/api/skills/imports` | Stage a skill folder for review. Body: `{ path }` |
| POST | `/api/skills/imports/:id/confirm` | Install a staged skill |
| DELETE | `/api/skills/imports/:id` | Drop a staged skill without installing it |
| GET | `/api/mcp` | Each MCP server's state and tools |
| POST | `/api/mcp/reload` | Reconnect to the servers in `mcp.json` |
| POST | `/api/mcp` | Add a server: OAuth, a web address with headers, or a local command |
| DELETE | `/api/mcp/:name` | Remove a server from `mcp.json` |
| POST | `/api/mcp/:name/sign-in` | Start an OAuth server's sign-in again, with a new link |
| GET | `/api/mcp/oauth/callback` | Where the OAuth sign-in returns to. Finishes the sign-in |
| POST | `/mcp` | Tool endpoint for the Claude CLI. Needs a run's bearer token |

## Storage

Everything mip writes lives under `~/.mip`. Change it with `MIP_HOME`.

```
~/.mip/
  data/mip.db           SQLite: personas, agents, messages, runs, memory, repositories
  data/mcp.json         MCP servers to connect to, tokens included. Sync carries them to the dotmip repo
  repos/<name>/         Master clones from the Repositories card
  sessions/claude/      Claude CLI config, login, and transcripts
  sessions/pi/          Pi session files
  sync/                 GitHub sync: merge base and the local dotmip copy (no token)
  skills/               Installed skills (text only)
  workspaces/<agent id>/ Each agent's files, and its repository copies
```

## Layout

The backend and the frontend are separate. A request flows from `http` to `app`, and `app` calls `adapters` and `storage`. `adapters` know only the contract they implement, and `storage` knows nothing above it. `agent/architecture.md` has the rules.

```
src/backend/
  http/       server.ts (request flow), router.ts, respond.ts, routes/ (one file per domain),
              mcp.ts (the tool endpoint), static.ts (the web build)
  app/        use cases: agents, runs, personas, bots, memory, repos, providers, system;
              folders for room/, tools/, skills/, and sync/
  adapters/   contract.ts (the provider interface), claude-cli.ts, pi.ts
  storage/    db.ts (connection and schema), then one file per domain (agents, runs, notes, ...)

src/frontend/
  api/        the HTTP client, response types, window events, shared ids
  ui/         shared components and hooks: Card, Modal, ConfirmDialog, RunScopePills, hooks, Starfield
  features/   agent, bots, memory, repos, skills, tools, settings, upcoming (one folder per card or dialog family)
  App.tsx     the page layout
  styles.css  the Nord theme and the card glows
```

`agent/` holds reference docs for AI agents: architecture, flows, API routes, data model, and conventions. `agent/symbols.md` and `agent/imports.md` are generated by `node agent/gen-index.mjs`.

`npm run dev:frontend` starts Vite with hot reload. `npm run build` builds both sides into `dist/`.
