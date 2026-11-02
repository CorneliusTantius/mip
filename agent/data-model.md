# Data model

Two stores: the SQLite file `MIP_HOME/data/mip.db`, and plain files under `MIP_HOME`. `MIP_HOME` is the env var `MIP_HOME` (default `~/.mip`), set in `storage/paths.ts`. Process and folder layout: `architecture.md`. The sync run: `flows.md`.

"Owner" = the storage module whose functions hold the SQL for a table. Other modules write a table only through those functions, except where the summary says otherwise: `storage/db.ts` and `storage/sync.ts` (and `app/sync/snapshot.ts`) write several tables.

"default" in a mode column = no mode passed to the write, so the umask applies.

## SQLite

- File: `MIP_HOME/data/mip.db`, opened once in `storage/db.ts` with `DatabaseSync` (`node:sqlite`). `chmodSync(..., 0o600)` runs right after open, so a new file is briefly created with the umask mode.
- No `PRAGMA` is set. Journal is SQLite's default rollback journal (`mip.db-journal` exists only during a write).
- No `FOREIGN KEY`, `REFERENCES`, `ON DELETE`, or `CHECK` anywhere. Every link between tables (`messages.agent_id`, `runs.agent_id`, `room_bots`, `rooms.master_bot_id`, `room_messages.bot_id`, ...) is enforced in app code or not at all.
- Explicit index: only `room_messages_room (room_id, id)`. Other indexes are the implicit ones of `PRIMARY KEY` and `UNIQUE`. `messages` and `runs` have no index on `agent_id`.
- Timestamps: `INTEGER` milliseconds from `Date.now()`.
- JSON is stored in `TEXT` columns: `tools`, `calls`, `ask`, `event`, `credential`, `entry`. Each storage module parses it on read.
- Booleans are `INTEGER` 0 or 1.
- Schema: one `db.exec` of `CREATE TABLE IF NOT EXISTS` in `storage/db.ts`. Columns added later are `ALTER TABLE ... ADD COLUMN`, run only when `hasColumn` is false. See Migrations.

## SQLite tables

"sync" in the table below means the row functions in `storage/sync.ts`, called from `app/sync/snapshot.ts`.

| table | owner | written by | synced |
| --- | --- | --- | --- |
| `personas` | `storage/personas.ts` | `app/personas.ts`; sync (`writePersonaRow`, `removePersonaRow`) | yes, except `is_default` |
| `agents` | `storage/agents.ts` | `app/agents.ts` (`insertAgent`, `renameAgent`, `setAgentSettings`, `setAgentOpenToBots`, `deleteAgent`); `app/runs.ts` (`saveProviderSession`); sync (`writeAgentRow`, `removeAgentRow`) | yes, except `provider_session_id` and `updated_at` |
| `messages` | `storage/agents.ts` | `app/runs.ts` (`addMessage`, at run start and end); sync (`insertMessageRow`); `deleteAgent` | yes, except `id` and `calls` |
| `runs` | `storage/runs.ts` | `app/runs.ts` (`createRun`, `setRunStatus`); `deleteAgent`; `db.ts` (startup recovery) | no |
| `run_events` | `storage/runs.ts` | `app/runs.ts` (`appendRunEvent`); `deleteAgent` | no |
| `notes` | `storage/notes.ts` | `app/memory.ts` (`writeNote`, `forgetNote`); `app/tools/memory.ts` (via `writeNote`); sync (`writeNoteRow`, `removeNoteRow`) | yes, with `note_links` and `note_tags` |
| `notes_fts` | `storage/notes.ts` | `saveNote`, `deleteNote` | no (derived) |
| `note_links` | `storage/notes.ts` | `saveNote`, `deleteNote` | yes, inside the note |
| `note_tags` | `storage/notes.ts` | `saveNote`, `deleteNote` | yes, inside the note |
| `bots` | `storage/bots.ts` | `app/bots.ts` (`createBot`, `editBot`, `removeBot`); sync (`writeBotRow`, `removeBotRow`); `db.ts` (color migration) | yes, matched by name |
| `rooms` | `storage/rooms.ts` | `app/room/rooms.ts` (`createRoom`, `editRoom`, `removeRoom`); sync (`writeRoomRow`, `removeRoomRow`); `db.ts` (creates `main`) | yes |
| `room_bots` | `storage/rooms.ts` | `insertRoom`, `updateRoom`, `deleteRoom` (`setRoomBots`); `storage/bots.ts` (`deleteBot`); `app/sync/snapshot.ts` | yes, inside the room as `bots` |
| `room_messages` | `storage/room.ts` | `app/room/room.ts` (`addRoomMessage`); `app/tools/index.ts` (agent replies, kind `agent`); sync (`insertRoomMessageRow`); `deleteRoom`; `db.ts` (`room_id`) | yes, except `id`, `calls`; `bot_id` is relinked by name |
| `repos` | `storage/repos.ts` | `app/repos.ts` (`insertRepo`, `setRepoStatus`, `deleteRepo`); `db.ts` (startup recovery) | no |
| `pi_credentials` | `storage/pi.ts` | `app/pi/store.ts` (`DbCredentialStore`); `app/sync/snapshot.ts` | yes |
| `pi_models` | `storage/pi.ts` | `app/pi/store.ts` (`DbModelsStore`); `app/sync/snapshot.ts` | yes |
| `pi_state` | `storage/pi.ts` | `app/pi/store.ts` (`importLegacyPiAuth`) | no |
| `spending_entries` | `storage/spending.ts` | `app/spending.ts` (`saveSpendingEntry`); `app/sync/snapshot.ts` (`insertSpendingEntry`, `removeSpendingEntry`) | yes |

### `personas`
| column | type | constraints | notes |
| --- | --- | --- | --- |
| `id` | TEXT | PRIMARY KEY | UUID; `default` for the built-in persona |
| `name` | TEXT | NOT NULL | |
| `system_prompt` | TEXT | NOT NULL | |
| `is_default` | INTEGER | NOT NULL DEFAULT 0 | 1 on at most one row. Local only |
| `created_at` | INTEGER | NOT NULL | list order |
| `updated_at` | INTEGER | NOT NULL DEFAULT 0 | change time. Migration backfills it from `created_at` |

### `agents`
| column | type | constraints | notes |
| --- | --- | --- | --- |
| `id` | TEXT | PRIMARY KEY | UUID |
| `provider_id` | TEXT | NOT NULL | `claude-cli` or `pi` |
| `provider_session_id` | TEXT | | NULL until a run ends with one. Not synced |
| `persona_id` | TEXT | NOT NULL DEFAULT 'default' | fixed for the agent's life |
| `title` | TEXT | NOT NULL DEFAULT '' | the agent's name |
| `updated_at` | INTEGER | NOT NULL | activity time: set at insert and at each run end. Orders `listAgents`. Not synced |
| `model` | TEXT | | NULL = provider default |
| `thinking` | TEXT | | NULL = provider default |
| `meta_updated_at` | INTEGER | NOT NULL DEFAULT 0 | change time of `title`, `model`, `thinking`, `open_to_bots`. Migration backfills it from `updated_at` |
| `open_to_bots` | INTEGER | NOT NULL DEFAULT 0 | 1 for agents created after bots could send tasks; `insertAgent` sets 1 |

### `messages`
| column | type | constraints | notes |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | local only; not synced |
| `agent_id` | TEXT | NOT NULL | renamed from `session_id` |
| `role` | TEXT | NOT NULL | `user` or `assistant` |
| `text` | TEXT | NOT NULL | |
| `tools` | TEXT | NOT NULL DEFAULT '[]' | JSON array of tool names |
| `calls` | TEXT | NOT NULL DEFAULT '[]' | JSON `ToolCall[]`. Not synced |
| `error` | TEXT | | NULL = no error |
| `ask` | TEXT | | JSON `Ask`, NULL when the reply asks nothing |
| `created_at` | INTEGER | NOT NULL | sent time. Sets the order and the sync identity. Set once, at insert |

### `runs`
| column | type | constraints | notes |
| --- | --- | --- | --- |
| `id` | TEXT | PRIMARY KEY | UUID |
| `agent_id` | TEXT | NOT NULL | renamed from `session_id` |
| `status` | TEXT | NOT NULL | `running`, `done`, or `error` |
| `started_at` | INTEGER | NOT NULL | |

### `run_events`
| column | type | constraints | notes |
| --- | --- | --- | --- |
| `run_id` | TEXT | NOT NULL, PK part 1 | |
| `seq` | INTEGER | NOT NULL, PK part 2 | per run, from 1 |
| `event` | TEXT | NOT NULL | JSON `AgentEvent` |

### `notes`
| column | type | constraints | notes |
| --- | --- | --- | --- |
| `id` | TEXT | PRIMARY KEY | UUID |
| `title` | TEXT | NOT NULL UNIQUE COLLATE NOCASE | |
| `body` | TEXT | NOT NULL | |
| `updated_at` | INTEGER | NOT NULL | change time |

### `notes_fts`
FTS5 virtual table: `title`, `body` (indexed), `note_id` (UNINDEXED). One row per note. Written only by `saveNote` and `deleteNote`.

### `note_links`
| column | type | constraints | notes |
| --- | --- | --- | --- |
| `from_id` | TEXT | NOT NULL, PK part 1 | note id |
| `to_title` | TEXT | NOT NULL COLLATE NOCASE, PK part 2 | target title. The note need not exist |

### `note_tags`
| column | type | constraints | notes |
| --- | --- | --- | --- |
| `note_id` | TEXT | NOT NULL, PK part 1 | |
| `tag` | TEXT | NOT NULL, PK part 2 | lowercase (`app/memory.ts` `parseTags`) |

### `bots`
| column | type | constraints | notes |
| --- | --- | --- | --- |
| `id` | TEXT | PRIMARY KEY | UUID. Local only; sync keys bots by name |
| `name` | TEXT | NOT NULL UNIQUE COLLATE NOCASE | |
| `persona` | TEXT | NOT NULL | the bot's system prompt text, up to 4000 characters. Not a persona id |
| `provider_id` | TEXT | NOT NULL | `claude-cli` by default (`app/bots.ts`) |
| `model` | TEXT | | NULL = provider default |
| `thinking` | TEXT | | NULL = provider default |
| `created_at` | INTEGER | NOT NULL | not synced |
| `updated_at` | INTEGER | NOT NULL DEFAULT 0 | change time. Migration backfills it from `created_at` |
| `color` | TEXT | | one of `BOT_COLORS` (`storage/bot-colors.ts`). NULL is possible from a synced record with no color; `toBot` then returns `BOT_COLORS[0]` |

### `rooms`
| column | type | constraints | notes |
| --- | --- | --- | --- |
| `id` | TEXT | PRIMARY KEY | UUID, or `main` |
| `name` | TEXT | NOT NULL UNIQUE COLLATE NOCASE | |
| `created_at` | INTEGER | NOT NULL | not synced |
| `updated_at` | INTEGER | NOT NULL | change time of name, members, master, `collapse_others` |
| `master_bot_id` | TEXT | | bot id, NULL = none. No FK. Not cleared by `deleteBot` |
| `collapse_others` | INTEGER | NOT NULL DEFAULT 0 | |

### `room_bots`
| column | type | constraints | notes |
| --- | --- | --- | --- |
| `room_id` | TEXT | NOT NULL, PK part 1 | |
| `bot_id` | TEXT | NOT NULL, PK part 2 | |

### `room_messages`
| column | type | constraints | notes |
| --- | --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | local only; the room polls by it |
| `room_id` | TEXT | | NULL only on rows from before rooms. `db.ts` sets NULL to `main` on every start |
| `kind` | TEXT | NOT NULL | `user`, `bot`, `agent`, or `system` |
| `bot_id` | TEXT | | set for `bot` messages. Not synced; relinked by name on sync |
| `author_name` | TEXT | NOT NULL | kept after the bot is deleted |
| `text` | TEXT | NOT NULL | |
| `calls` | TEXT | NOT NULL DEFAULT '[]' | JSON `ToolCall[]`. Not synced |
| `created_at` | INTEGER | NOT NULL | identity for sync; set once |

Index: `room_messages_room (room_id, id)`.

### `repos`
| column | type | constraints | notes |
| --- | --- | --- | --- |
| `id` | TEXT | PRIMARY KEY | UUID |
| `name` | TEXT | NOT NULL UNIQUE | folder name in `repos/` and in each workspace |
| `url` | TEXT | NOT NULL | the clone link as given |
| `status` | TEXT | NOT NULL | `cloning`, `ready`, or `error` |
| `error` | TEXT | | NULL unless `error` |
| `created_at` | INTEGER | NOT NULL | |

### `pi_credentials`
| column | type | constraints | notes |
| --- | --- | --- | --- |
| `provider_id` | TEXT | PRIMARY KEY | |
| `credential` | TEXT | NOT NULL | JSON Pi `Credential` (`api_key` or `oauth`) |
| `updated_at` | INTEGER | NOT NULL | change time |

### `pi_models`
| column | type | constraints | notes |
| --- | --- | --- | --- |
| `provider_id` | TEXT | PRIMARY KEY | |
| `entry` | TEXT | NOT NULL | JSON Pi `ModelsStoreEntry` |
| `updated_at` | INTEGER | NOT NULL | change time |

### `pi_state`
| column | type | constraints | notes |
| --- | --- | --- | --- |
| `key` | TEXT | PRIMARY KEY | `pi-auth-imported` is the only key in use: the time the legacy Pi auth file was imported |
| `value` | TEXT | NOT NULL | |

### `spending_entries`
| column | type | constraints | notes |
| --- | --- | --- | --- |
| `id` | TEXT | PRIMARY KEY | UUID, or a caller-chosen string up to 64 characters |
| `kind` | TEXT | NOT NULL | `income` or `expense` |
| `category` | TEXT | NOT NULL | up to 40 characters. Matched to an existing name ignoring case |
| `amount` | REAL | NOT NULL | above 0 |
| `description` | TEXT | NOT NULL DEFAULT '' | up to 200 characters |
| `created_at` | INTEGER | NOT NULL | kept when the entry is edited. No change-time column |

## Migrations and startup (`storage/db.ts`)

Runs in this order on every start:

1. `sessions` is renamed to `agents`, only when `sessions` exists and `agents` does not.
2. `messages.session_id` and `runs.session_id` are renamed to `agent_id`, when present.
3. `CREATE TABLE IF NOT EXISTS` for every table and the FTS table. Then `CREATE INDEX IF NOT EXISTS room_messages_room`.
4. `DROP TABLE IF EXISTS skill_enablements` and `bot_skill_enablements`.
5. Added only when missing: `rooms.master_bot_id`, `rooms.collapse_others`, `spending_entries.description`, `agents.persona_id`, `personas.is_default`, `agents.model`, `agents.thinking`.
6. `personas.updated_at` and `bots.updated_at`, added when missing, backfilled from `created_at`.
7. `bots.color`, added when missing. Each existing bot gets `BOT_COLORS[i % 8]` in `created_at, id` order, and `updated_at` moves to now.
8. `agents.meta_updated_at`, added when missing, backfilled from `updated_at`.
9. Added only when missing: `messages.calls`, `messages.ask`, `agents.open_to_bots` (default 0), `room_messages.calls`, `room_messages.room_id`.
10. If `rooms` is empty: insert room `main` named `Main`, with every bot in `room_bots`. Then `room_messages.room_id = 'main'` where it is NULL.
11. Startup recovery: `runs.status = 'running'` becomes `error`. `repos.status = 'cloning'` becomes `error` with `error = 'interrupted by a server restart'`. No `run_events` row is written for the runs.

Outside `db.ts`: `app/personas.ts` inserts the built-in `default` persona when missing, replaces its prompt only when the stored prompt's sha256 equals the previous built-in hash, and sets `is_default` on `default` when no persona has it.

## Synced data (dotmip repo)

`app/sync/snapshot.ts` reads and applies these parts. `app/sync/repo.ts` maps them to files in `MIP_HOME/sync/dotmip/`. `app/sync/merge.ts` merges them. Run steps: `flows.md`.

| part | source | dotmip path | change time | both sides edited |
| --- | --- | --- | --- | --- |
| personas | `personas` (not `is_default`) | `personas/<id>.json` | `updated_at` | newer wins |
| bots | `bots` (key: lowercase name) | `bots/<name>.json` | `updated_at` | newer wins |
| notes | `notes` + `note_links` + `note_tags` (key: lowercase title) | `notes/<title>.json` | `updated_at` | newer wins |
| agents | `agents` settings + `messages` inside the record | `agents/<id>.json` | `meta_updated_at` (settings) | settings: newer wins; messages: both kept |
| rooms | `rooms` with members, master, and `collapse_others` as bot names | `rooms.json` (one list) | `updated_at` | newer wins |
| room | `room_messages` (`room_id`, kind, author, text, `created_at`) | `room.json` (one list) | none; `created_at` is the identity | both kept; a removed room takes its messages |
| mcp | `mcp.json` servers | `mcp/<name>.json` | none | GitHub's copy |
| mail | `mail.json` accounts | `mail/<id>.json` | none | GitHub's copy |
| slackApp | `slack.json` `app` | `slack-app/app.json` | none | GitHub's copy |
| slack | `slack.json` `accounts` | `slack/<id>.json` | none | GitHub's copy |
| piCredentials | `pi_credentials` | `pi-credentials/<providerId>.json` | `updated_at` | newer wins |
| piModels | `pi_models` | `pi-models/<providerId>.json` | `updated_at` | newer wins |
| piFiles | `data/pi/settings.json`, `data/pi/models.json` | `pi-files/settings.json.json`, `pi-files/models.json.json` | none | GitHub's copy |
| mailCache | `mail-cache.json` | `mail-cache/<accountId>.json` | none | GitHub's copy |
| slackCache | `slack-cache.json` | `slack-cache/<encoded key>.json` | `at` (time fetched) | newer read wins |
| spending | `spending_entries` | `spending/<id>.json` | none; `created_at` kept | GitHub's copy |

Merge rules (`app/sync/merge.ts`):

- The base is `sync/base.json`: the snapshot both sides last agreed on, for this repo. A record that changed on one side only takes that side's version. A removal against an edit keeps the edit.
- A removal the database refuses leaves the record in place: `removePersonaRow` (the `is_default` persona, or one an agent uses), `removeAgentRow` (an agent with a running run), `removeRoomRow` (the last room). Other removals always apply.
- Messages and room messages are only added by sync. They leave the database only with their agent or room.
- `syncWith` refuses to run when the local database is empty and the base has data (wrong `MIP_HOME`).
- Not synced: `runs`, `run_events`, `repos`, `pi_state`, `personas.is_default`, `agents.provider_session_id`, `agents.updated_at`, `messages.id`, `messages.calls`, `room_messages.id`, `room_messages.calls`, `bots.id`, `notes.id`, `runs.id`, and the `created_at` columns of personas, bots, and rooms. Also skills, workspaces, `sessions/`, and `device-id`.
- A synced agent has no `provider_session_id` on the other machine, so its provider starts a new conversation there.
- `messages` identity: `created_at:role:sha1(text)[0:12]`. `room_messages` identity: `room:created_at:kind:authorName:digest`. Two copies match only when `created_at` is equal, so a synced copy keeps the original `created_at`.

## Invariants

- Change-time rule: every write to a column in the table above with a change time sets it. App writes use `Date.now()`. Sync writes use the time carried in the record.
- Known gap: `deleteBot` (`storage/bots.ts`) and `removeBotRow` (`storage/sync.ts`) remove the bot from `room_bots` without moving `rooms.updated_at`. A removal from a room is merged by content, not by time. `deleteBot` also leaves `rooms.master_bot_id` pointing at the deleted id. `room.ts` then finds no master, and sync reads it as NULL.
- At most one run per agent is `running`. `startRun` (`app/runs.ts`) refuses with 409 `this agent is still running`. There is no DB constraint.
- If saving a run's reply throws (`addMessage`, `saveProviderSession`, or `setRunStatus` in `app/runs.ts` `execute`), the run stays `running` until the next start. The agent refuses new runs in that time.
- `deleteAgent` (`storage/agents.ts`) deletes `run_events`, `runs`, `messages`, and the `agents` row in one transaction. It does not remove `sessions/claude/` or `sessions/pi/`. The workspace folder is removed by `removeAgent` (`app/agents.ts`), not by sync. `removeAgent` refuses while a run is active.
- Note titles are unique ignoring case. `writeNote` (`app/memory.ts`) and `writeNoteRow` (`storage/sync.ts`) look the title up first and reuse its id. `saveNote` does not: a new id with a taken title fails on the UNIQUE constraint.
- `saveNote` rebuilds the note's `notes_fts` row, `note_links`, and `note_tags` on every save. `deleteNote` keeps other notes' links to the deleted title, as in Obsidian.
- Bot names are unique ignoring case. A bot name matches `^[A-Za-z][A-Za-z0-9_-]{1,23}$` (`app/bots.ts`). `room_messages.author_name` keeps a deleted bot's name for its old messages.
- A bot is in any number of rooms through `room_bots`. `room.ts` lets a bot answer only in rooms whose `botIds` contain it.
- Room names are unique ignoring case. The last room is never deleted: `removeRoom` (`app/room/rooms.ts`) returns 409 `keep at least one room`.
- Room `main` (id `main`, name `Main`) is the room of messages from before rooms existed. It is created with every bot only when `rooms` is empty (`db.ts`).
- Bot colors are one of `BOT_COLORS`. A new bot takes the first color no bot uses (`nextBotColor`, `app/bots.ts`).
- At most one persona has `is_default = 1`. `setDefaultPersona` clears the others. The flag never syncs.
- The built-in persona (id `default`) is refused by `removePersona` (`app/personas.ts`). `removePersonaRow` (sync) refuses only a row with `is_default = 1` or one an agent uses. It does not check the id, so a synced removal can delete `default` on a machine where it is not the default.
- Repo names are unique (`repos.name`), and each repo's folder is `repos/<name>/` and `workspaces/<agentId>/<name>/`. `addRepo` refuses a name that has a row or a folder (409).
- `spending_entries` has no change time. When both sides edit an entry, GitHub's copy wins.
- Mail accounts, MCP servers, the Slack app and accounts, Pi config files, and the mail cache have no change time. When both sides edit one, GitHub's copy wins. The Slack cache uses its `at` time instead (newer read wins).

## Files outside SQLite

| path | format | mode | written by | synced |
| --- | --- | --- | --- | --- |
| `MIP_HOME/data/mail.json` | JSON `{accounts: {<id>: {label, host, port, secure, user, password, mailbox, watch, maxBytes}}}` | 600 (`writeFileSync` + `chmodSync`) | `app/mail/accounts.ts` (`saveMailAccount`, `removeMailAccount`, `writeMailAccounts`) | yes: `mail/<id>.json`, password included |
| `MIP_HOME/data/mail-cache.json` | JSON `{<accountId>: {uidValidity, messages}}`, headers only | 600 on create, no later chmod | `app/mail/cache.ts` (`saveMailbox`, `dropMailbox`); called from `app/mail/mail.ts` and `app/sync/snapshot.ts` | yes: `mail-cache/<accountId>.json` |
| `MIP_HOME/data/slack.json` | JSON `{app?: {clientId, clientSecret}, accounts: {<teamId.userId>: {teamId, teamName, userId, userName, token}}}` | 600 (+ chmod) | `app/slack/config.ts` (`saveSlackApp`, `saveSlackAccount`, `removeSlackAccount`, `writeSlackState`) | yes: `slack-app/app.json`, `slack/<id>.json` |
| `MIP_HOME/data/slack-cache.json` | JSON `{<key>: {at, value}}`. Keys: `conversations:<acct>`, `unread:<acct>`, `messages:<acct>:<channel>`, `replies:<acct>:<channel>:<thread>`, `users:<teamId>` | 600 on create | `app/slack/cache.ts` (`cached`, `setSlackEntry`, `dropSlackEntry`, `forgetCache`) | yes: `slack-cache/<encoded key>.json` |
| `MIP_HOME/data/mcp.json` | JSON `{mcpServers: {<name>: {type: "stdio", command, args, env} or {type: "http", url, headers, oauth?}}}` | 600 (+ chmod) | `app/mcp/config.ts` (`editMcpFile`, `writeMcpConfigText`); `app/mcp/servers.ts`; `app/mcp/manager.ts` (`saveSignIn`); `app/sync/snapshot.ts` | yes: `mcp/<name>.json`, env, headers, and OAuth tokens included |
| `MIP_HOME/data/device-id` | text: one UUID and a newline | default | `app/installation.ts` `installationId` (made on first use; replaced when the saved text is not a UUID) | no |
| `MIP_HOME/data/pi/` | Pi's agent folder (`PI_AGENT_DIR`, set as `PI_CODING_AGENT_DIR` in `adapters/pi.ts`): `settings.json`, `models.json` | default | Pi; `storage/pi.ts` `writePiConfigFile`, `removePiConfigFile` when sync applies them | yes: `pi-files/` |
| `MIP_HOME/data/mip.db-journal` | SQLite rollback journal | SQLite's | SQLite, during a write transaction only | no |
| `MIP_HOME/sessions/claude/` | Claude CLI config folder (`CLAUDE_CONFIG_DIR`): login and CLI state | default | the CLI; `adapters/claude-cli.ts` `cliEnv` sets the variable from `configDir` (`app/providers.ts`) | no |
| `MIP_HOME/sessions/pi/` | Pi session files | default | Pi, through `SessionManager` in `adapters/pi.ts` (`sessionDir` from `app/providers.ts`) | no |
| `MIP_HOME/repos/<name>/` | git master clone | default | `app/repos.ts` (`addRepo` clones; `removeRepo` deletes; `pullAllRepos` pulls) | no |
| `MIP_HOME/workspaces/<agentId>/` | an agent's files, and `<name>/` repo copies whose origin is the real link | default | agent file tools (`app/tools/files.ts`, inside `inWorkspace`); `copyRepoToAgent` (`app/repos.ts`). Created by `workspaceFor`, deleted by `removeWorkspace` (`app/tools/workspace.ts`) | no |
| `MIP_HOME/skills/<name>/` | installed skill: `SKILL.md`, text files, and `.mip-source.json` for imports only (`{source, sha256, stagedAt}`) | default | `app/skills/imports.ts` `confirmImport` (renames the staged folder); `app/skills/create.ts` `createSkill` (writes `SKILL.md` only). Removed by `removeSkill` (`app/skills/registry.ts`) | no |
| `MIP_HOME/skills/.staging/<uuid>/` | an import not yet confirmed | default | `app/skills/imports.ts` `stageImport`. Removed by `discardImport`, or by `clearStale` after 24 hours | no |
| `MIP_HOME/sync/base.json` | JSON `{repo, snapshot}`: the last agreed snapshot. It holds every synced record, secrets included | default | `app/sync/engine.ts` `writeBase` | no |
| `MIP_HOME/sync/state.json` | JSON `{account, lastSync}`: the chosen gh login and the last run | default | `app/sync/engine.ts` `writeState` | no |
| `MIP_HOME/sync/dotmip/` | git clone of `<login>/dotmip`, a private GitHub repo: one JSON file per record, plus `rooms.json`, `room.json`, `README.md` | default | `app/sync/repo.ts` `writeTree`, `commitAndPush`. Remote URL has no token: `authEnv` passes it per git call | the synced copy, with secrets in plain JSON |
| `MIP_HOME/restart.log` | output of the restart shell: install, build, then the server | default | the detached shell built in `app/system.ts` `restartMip` (`>>` redirects) | no |
| `~/.pi/agent/auth.json` (outside `MIP_HOME`) | Pi's old credentials file | never written by mip | read once by `app/pi/store.ts` `importLegacyPiAuth` into `pi_credentials` | no |

`storage/paths.ts` defines the constants for `DATA_DIR`, `DEVICE_ID_FILE`, `MCP_CONFIG_FILE`, `MAIL_CONFIG_FILE`, `MAIL_CACHE_FILE`, `SLACK_CONFIG_FILE`, `SLACK_CACHE_FILE`, `SESSIONS_DIR`, `REPOS_DIR`, `SYNC_DIR`, `SKILLS_DIR`, and `PI_AGENT_DIR`. `ensureMipDirs` creates `data/`, `repos/`, `data/pi/`, `sessions/claude/`, and `sessions/pi/`. `workspaces/` and `restart.log` are not in `paths.ts`.

## Identifiers

- Random UUIDs (`randomUUID`): `agents.id`, `personas.id`, `bots.id`, `notes.id`, `rooms.id`, `runs.id`, `repos.id`, and `spending_entries.id` by default.
- Fixed ids, the same on every machine: persona `default` (name `Default`) and room `main` (name `Main`).
- Caller-chosen id: `spending_entries.id`, up to 64 characters (`saveSpendingEntry`).
- Autoincrement integers: `messages.id`, `room_messages.id`. Local only. The room polls by `room_messages.id` (`roomMessagesAfter`).
- `run_events.seq`: per run, starting at 1 (`app/runs.ts` `record`).
- Sync keys (`keyOf` in `app/sync/merge.ts`): persona by `id`; bot by lowercase name; note by lowercase title; agent by `id`; message by `created_at:role:digest`; room by `id`; room message by `room:created_at:kind:authorName:digest`; mcp by name; mail by `id`; slack app by `app`; slack by `id`; Pi credential and model by `providerId`; Pi file by name; mail cache by `accountId`; Slack cache by `key`; spending by `id`.
- Name rules: mail account `id` and MCP server name match `^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$`. Repo folder name matches `^[A-Za-z0-9][A-Za-z0-9._-]*$` (`app/repos.ts`).
