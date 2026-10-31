# Data model

SQLite file: `MIP_HOME/data/mip.db`, opened once in `storage/db.ts:8`. Schema in `db.ts:13-92`. Columns added later are migrated in `db.ts:100-111` (only when missing). Startup recovery in `db.ts:114-115`.

Owner = the storage module that reads and writes the table. Only that module writes it.

| table | columns | primary key / constraints | owner | written by |
| --- | --- | --- | --- | --- |
| `personas` | id, name, system_prompt, is_default (0/1), created_at | id | `storage/personas.ts` | `app/personas.ts` |
| `sessions` | id, provider_id, provider_session_id (nullable), persona_id (default `'default'`), title, updated_at, model (nullable), thinking (nullable) | id | `storage/sessions.ts` | `app/sessions.ts`, `app/runs.ts` |
| `messages` | id (autoincrement), session_id, role (`user`/`assistant`), text, tools (JSON array of names), error (nullable), created_at | id | `storage/sessions.ts` | `app/runs.ts`, `app/sessions.ts` (delete) |
| `runs` | id, session_id, status (`running`/`done`/`error`), started_at | id | `storage/runs.ts` (+ `sessions.ts` delete) | `app/runs.ts`, `db.ts` (recovery) |
| `run_events` | run_id, seq, event (JSON `AgentEvent`) | (run_id, seq) | `storage/runs.ts` (+ `sessions.ts` delete) | `app/runs.ts` |
| `notes` | id, title (UNIQUE, NOCASE), body, updated_at | id | `storage/notes.ts` | `app/memory.ts` |
| `notes_fts` | title, body, note_id (UNINDEXED) — FTS5 virtual table | — | `storage/notes.ts` | `saveNote`, `deleteNote` |
| `note_links` | from_id, to_title (NOCASE) | (from_id, to_title) | `storage/notes.ts` | `saveNote` |
| `note_tags` | note_id, tag | (note_id, tag) | `storage/notes.ts` | `saveNote` |
| `bots` | id, name (UNIQUE, NOCASE), persona, provider_id, model (nullable), thinking (nullable), created_at | id | `storage/bots.ts` | `app/bots.ts` |
| `room_messages` | id (autoincrement), kind (`user`/`bot`/`system`), bot_id (nullable), author_name, text, created_at | id | `storage/room.ts` | `app/room.ts` |
| `repos` | id, name (UNIQUE), url, status (`cloning`/`ready`/`error`), error (nullable), created_at | id | `storage/repos.ts` | `app/repos.ts`, `db.ts` (recovery) |

## Invariants
- A chat has at most one `running` run (`app/runs.ts:21`).
- Deleting a chat deletes its `run_events`, `runs`, `messages`, and `sessions` row in one transaction (`storage/sessions.ts:94`). Provider files and the workspace folder are removed separately.
- Note titles are unique ignoring case. `saveNote` keeps the existing id when the title exists, so links to it stay valid.
- A note's links and tags are rebuilt on every save (`storage/notes.ts:16`).
- Bot names are unique ignoring case. Bot messages in `room_messages` keep `author_name`, so they stay readable after the bot is deleted.
- Exactly one persona has `is_default = 1` (`setDefaultPersona`, `storage/personas.ts:35`). The built-in `default` persona cannot be deleted.
- Repo names are unique. The name is also the folder name in `repos/` and in each workspace.

## Files outside SQLite
| path | created by | content |
| --- | --- | --- |
| `MIP_HOME/repos/<name>/` | `app/repos.ts` `addRepo` (`git clone`) | master clone |
| `MIP_HOME/workspaces/<sessionId>/` | `app/tools/workspace.ts` `workspaceFor` | chat files and `<name>/` repo copies |
| `MIP_HOME/sessions/claude/` | `adapters/claude-cli.ts` (`CLAUDE_CONFIG_DIR`) | CLI login, transcripts |
| `MIP_HOME/sessions/pi/` | `adapters/pi.ts` | Pi sessions |

## Identifiers
- Chats, personas, bots, notes, repos, runs: UUID strings (`randomUUID`), except the built-in persona `default`.
- Messages and room messages: autoincrement integers. The room polls by these.
- Run events: `seq` is per run, starting at 1 (`app/runs.ts` `record`).
