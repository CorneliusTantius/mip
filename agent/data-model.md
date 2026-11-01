# Data model

SQLite file: `MIP_HOME/data/mip.db`, opened once in `storage/db.ts`. Schema in `db.ts`. Columns added later are migrated in `db.ts` (only when missing). Startup recovery in `db.ts`.

Owner = the storage module that reads and writes the table. Only that module writes it.

| table | columns | primary key / constraints | owner | written by |
| --- | --- | --- | --- | --- |
| `personas` | id, name, system_prompt, is_default (0/1), created_at, updated_at | id | `storage/personas.ts` | `app/personas.ts` |
| `agents` | id, provider_id, provider_session_id (nullable), persona_id (default `'default'`), title, updated_at, meta_updated_at (title and settings), model (nullable), thinking (nullable) | id | `storage/agents.ts` | `app/agents.ts`, `app/runs.ts` |
| `messages` | id (autoincrement), agent_id, role (`user`/`assistant`), text, tools (JSON array of names), calls (JSON array of `{name, input, output, isError}`, default `[]`), error (nullable), created_at | id | `storage/agents.ts` | `app/runs.ts`, `app/agents.ts` (delete) |
| `runs` | id, agent_id, status (`running`/`done`/`error`), started_at | id | `storage/runs.ts` (+ `agents.ts` delete) | `app/runs.ts`, `db.ts` (recovery) |
| `run_events` | run_id, seq, event (JSON `AgentEvent`) | (run_id, seq) | `storage/runs.ts` (+ `agents.ts` delete) | `app/runs.ts` |
| `notes` | id, title (UNIQUE, NOCASE), body, updated_at | id | `storage/notes.ts` | `app/memory.ts` |
| `notes_fts` | title, body, note_id (UNINDEXED) — FTS5 virtual table | — | `storage/notes.ts` | `saveNote`, `deleteNote` |
| `note_links` | from_id, to_title (NOCASE) | (from_id, to_title) | `storage/notes.ts` | `saveNote` |
| `note_tags` | note_id, tag | (note_id, tag) | `storage/notes.ts` | `saveNote` |
| `bots` | id, name (UNIQUE, NOCASE), persona, provider_id, model (nullable), thinking (nullable), color (one of `storage/bot-colors.ts`), created_at, updated_at | id | `storage/bots.ts` | `app/bots.ts` |
| `rooms` | id, name (UNIQUE, NOCASE), created_at, updated_at | id | `storage/rooms.ts` | `app/room/rooms.ts` |
| `room_bots` | room_id, bot_id (the room's members) | (room_id, bot_id) | `storage/rooms.ts` (+ `bots.ts` delete) | `app/room/rooms.ts` |
| `room_messages` | id (autoincrement), room_id, kind (`user`/`bot`/`system`), bot_id (nullable), author_name, text, calls (JSON), created_at | id; index (room_id, id) | `storage/room.ts` | `app/room/room.ts` |
| `repos` | id, name (UNIQUE), url, status (`cloning`/`ready`/`error`), error (nullable), created_at | id | `storage/repos.ts` | `app/repos.ts`, `db.ts` (recovery) |
| `skill_enablements` | agent_id, skill (the skill's name) | (agent_id, skill) | `storage/skills.ts` (+ `agents.ts` delete) | `app/skills/registry.ts` |
| `bot_skill_enablements` | bot_id, skill (the skill's name) | (bot_id, skill) | `storage/skills.ts` (+ `bots.ts` delete) | `app/skills/registry.ts` |

## Invariants
- An agent has at most one `running` run (`app/runs.ts`).
- Deleting an agent deletes its `run_events`, `runs`, `messages`, and `agents` row in one transaction (`storage/agents.ts`). Provider files and the workspace folder are removed separately.
- Note titles are unique ignoring case. `saveNote` keeps the existing id when the title exists, so links to it stay valid.
- A note's links and tags are rebuilt on every save (`storage/notes.ts`).
- Bot names are unique ignoring case. Bot messages in `room_messages` keep `author_name`, so they stay readable after the bot is deleted.
- A bot can be in several rooms (`room_bots`). Deleting a bot takes it out of every room (`storage/bots.ts` `deleteBot`, and the sync's bot removal). A room's messages are kept apart by `room_id`, and a bot answers only in the rooms it is in.
- Room names are unique ignoring case, and the last room cannot be deleted. The room `main` is where the messages from before rooms went. It is made, with every bot that exists, when no rooms exist (`db.ts`). Old room messages have no room id until that migration sets it to `main`.
- A bot's color is one of the Nord accents in `storage/bot-colors.ts`. Bots made before colors got one each in the order they were made, and that change moved their `updated_at` so the colors reach GitHub on the next sync.
- Exactly one persona has `is_default = 1` (`setDefaultPersona`, `storage/personas.ts`). The built-in `default` persona cannot be deleted.
- Repo names are unique. The name is also the folder name in `repos/` and in each workspace.
- GitHub sync merges by change times, so every write sets them: `personas.updated_at`, `bots.updated_at`, `notes.updated_at`, `agents.meta_updated_at` (title and settings), and `created_at` on messages and room messages. A write that skips one is lost in a merge (`app/sync/merge.ts`).

## Files outside SQLite
| path | created by | content |
| --- | --- | --- |
| `MIP_HOME/repos/<name>/` | `app/repos.ts` `addRepo` (`git clone`) | master clone |
| `MIP_HOME/workspaces/<agentId>/` | `app/tools/workspace.ts` `workspaceFor` | agent files and `<name>/` repo copies |
| `MIP_HOME/sessions/claude/` | `adapters/claude-cli.ts` (`CLAUDE_CONFIG_DIR`) | CLI login, transcripts |
| `MIP_HOME/sessions/pi/` | `adapters/pi.ts` | Pi sessions |
| `MIP_HOME/skills/<name>/` | `app/skills/imports.ts` (confirm) | an installed skill: `SKILL.md`, text files, and `.mip-source.json` (source path and hash). `skills/.staging/` holds imports not yet confirmed |
| `MIP_HOME/sync/` | `app/sync/*` | `base.json` (`{repo, snapshot}`: the state at the last sync with that repo), `state.json` (chosen account, last run), `dotmip/` (local clone of the GitHub repo). No token is stored |

## Identifiers
- Agents, personas, bots, notes, repos, runs, rooms: UUID strings (`randomUUID`), except the built-in persona `default` and the room `main`. The room `main` has the same id on every machine, so its messages from before rooms line up when the repo syncs.
- Messages and room messages: autoincrement integers. The room polls by these.
- Run events: `seq` is per run, starting at 1 (`app/runs.ts` `record`).
