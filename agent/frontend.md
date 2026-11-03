# Frontend

Preact 11, Vite 8, Tailwind 4 (`@tailwindcss/vite`), daisyUI 5 (`themes: false`, one custom dark theme). `index.html` loads `main.tsx`, which renders `App` into `#app`. `App.tsx` is the whole page: a header and one scrolling grid of cards. Line numbers are in `symbols.md`.

## Folders
- `api/`: the HTTP boundary and the response types. Imports nothing.
- `ui/`: shared primitives and hooks. Imports only `api/` and its own files.
- `features/<name>/`: one folder per card or dialog family. 13 folders: agent, bots, email, mcp, memory, repos, settings, skills, slack, spending, tools, upcoming, whatsapp. Each owns its components, hooks, and pure rules. No feature imports another feature.
- `App.tsx`: the header and the grid. Imports features, `ui/Icon`, and `ui/Starfield`.
- `main.tsx`: imports `styles.css`, renders `App`.
- `styles.css`: Tailwind, the daisyUI theme, motion, glow and bot colors.
- `index.html`: `#app` mount point, title `mip`.
- `vite.config.ts`: root `src/frontend`; build to `dist/frontend` (emptied on build); dev server port 5173 proxies `/api` to `http://127.0.0.1:3000`.
- `tsconfig.json`: strict; `jsxImportSource: preact`; bundler resolution; includes `**/*.ts(x)`.
- Scripts (root `package.json`): `npm run dev:frontend`, `npm run build:frontend`, `npm run typecheck`.
- Tests: `*.test.mjs` beside a pure module. Each imports the sibling `.ts` and runs with `node <file>`. The list is in `conventions.md`.

## api/
- `client.ts`: the only `fetch` call in the frontend.
  - `ApiError extends Error`: `status: number`. Message is the body's `error`, else `request failed with status N`.
  - `api`: `get<T>(path)`, `post<T>(path, body?)`, `put<T>(path, body?)`, `patch<T>(path, body?)`, `del<T>(path)`. Bodies are JSON; `Content-Type` is set only when a body is given.
  - `errorText(err)`: the message of any caught error.
- `types.ts`: hand-written response shapes. No imports from `src/backend`. Groups:
  - agents: `Agent`, `AgentDetail`, `AgentMessage`, `ToolCall`, `RunEvent`, `Ask`, `ModelOption`, `Persona`, `ProviderInfo`, `SignInTarget`, `SignInProgress`, `SignInPrompt`.
  - tools and MCP: `ToolInfo`, `McpServer`, `McpTool`, `NewMcpServer`, `McpStatus`.
  - bots: `Bot`, `BotColor`, `Room`, `RoomMessage`.
  - repos and memory: `Repo`, `RepoCopy`, `PullResult`, `NoteItem`, `NoteDetail`.
  - sync: `SyncRun`, `SyncStatus`.
  - skills: `SkillSummary`, `SkillDetail`, `SkillProblem`, `SkillImport`.
  - mail: `MailPreset`, `MailAccount`, `MailAccountsReply`, `MailHeader`, `MailMessage`, `MailboxReply`.
  - Slack: `SlackAccount`, `SlackState`, `SlackKind`, `SlackConversation`, `SlackMessage`.
  - spending: `SpendingEntry`, `NewSpendingEntry`.
- `events.ts`: `announce(name)` and `subscribe(name, handler)` (returns an unsubscribe). Names: `AGENTS_CHANGED`, `PERSONAS_CHANGED`, `PROVIDERS_CHANGED`. See Polling and events.
- `constants.ts`: `DEFAULT_PERSONA_ID = "default"`, `DEFAULT_PROVIDER_ID = "claude-cli"`. Must match the server (see Gotchas).

## ui/
| file | exports | purpose |
| --- | --- | --- |
| `Card.tsx` | `Card`, `CardBody`, `ExpandButton`, `useCardExpansion`, type `Glow` | Dashboard card shell and expansion. See below. |
| `Modal.tsx` | `Modal` | Native `<dialog>` driven by `open`. See below. |
| `ConfirmDialog.tsx` | `ConfirmDialog` | Yes/no confirm with an `error` line. Built on `Modal`. |
| `ErrorAlert.tsx` | `ErrorAlert` | `div[role=alert].alert.alert-error`. Renders nothing without `message`. |
| `Icon.tsx` | `Icon`, type `IconName` | SVG icons drawn in `currentColor`. Names: `close`, `menu`, `edit`, `trash`, `chevronDown`, `maximize`, `minimize`, `gear`. |
| `OptionDropdown.tsx` | `OptionDropdown`, type `DropdownOption` | Fixed-width dropdown. Its list is `position: fixed`, placed from the button when it opens (above when there is room), so a scrolling card cannot clip it. A scroll outside the list closes it. The `details` must not carry daisyUI's `dropdown` class: with it, opening the list jumps the page to the top. Used by `Composer` (model, thinking), `BotEditor` (provider, model, thinking), `RepoRow` (copy to an agent). |
| `filterOptions.ts` | `filterOptions` | Case-insensitive contains on label or value. Used by `OptionDropdown`. Tested by `filterOptions.test.mjs`. |
| `RunScopePills.tsx` | `RunScopePills`, type `RunScope` | All / Agent / Bot pill (`"all" \| "agent" \| "bot"`). Size `btn-sm` when the card is expanded, else `btn-xs`. Used by `ToolsCard`. |
| `ToolCallsDialog.tsx` | `ToolCallsButton`, `ToolCallsDialog` | "View tool calls (N)" button and its dialog. Used by `Transcript` and `RoomTranscript`. With no `calls` (saved before details were recorded), lists names only. |
| `ToolCallDetails.tsx` | `ToolCallDetails` | One call: `toolLabel(name)`, an `error` badge when `isError`, Input (`prettyJson`), Result. Output `null` shows "No result came back."; empty shows "(empty)". |
| `toolName.ts` | `toolLabel`, `prettyJson` | `toolLabel` drops the `^mcp__.+?__` prefix. `prettyJson` indents JSON, returns other text as is. |
| `hooks.ts` | `usePolling`, `useAnnouncement` | See below. |
| `Markdown.tsx` | `Markdown` | Draws `markdown.ts` output as elements. See below. |
| `markdown.ts` | `parseBlocks`, `parseInline`, types `Block`, `Inline` | Pure Markdown reader. Tested by `markdown.test.mjs`. |
| `links.ts` | `shortLink(href, max = 40)` | Host and path without scheme or trailing slash, cut with `…`. Used by `MailMessageDialog` and `SlackText`. Tested by `links.test.mjs`. |
| `Starfield.tsx` | `Starfield` | Fixed, `-z-10`, `pointer-events-none` canvas behind the page. Star count `min(260, floor(w*h/5000))`. Nord colors. A few stars glint. Reduced motion draws one still frame. |
| `SourceCard.tsx` | `MESSAGING_CARD_HEIGHT` | See its section. |

### ui/Card.tsx
- `Card({ glow, className = "", children })` renders `section.card.glow.glow-<glow>.bg-base-200/80`. `Glow` = `frost | teal | blue | violet | red | orange | yellow | green`.
- Entrance: duration and delay drawn once per mount, 0.4–1.2 s and 0–0.5 s, set as `--enter-duration` and `--enter-delay`.
- Collapsed: `className` applies.
- Expanded: `EXPANDED = "fixed inset-3 z-50 flex flex-col md:inset-8"` replaces `className`. A `fixed inset-0 z-40 bg-black/50` backdrop renders before the section and closes the card on click. The section gets `role="dialog"` and `aria-modal`.
- Zoom: the section animates from its grid box to the panel (260 ms). Close fades the backdrop (`mip-fade-out`, 200 ms), then the section shrinks back. Reduced motion skips the zoom.
- Close: `ExpandButton`, backdrop click, or Escape (window keydown). Escape is ignored while any `dialog[open]` exists in the document.
- `useCardExpansion()` returns `{ expanded, open, toggle }` from context. Content uses it to change its shape or size.
- `ExpandButton()`: `maximize` / `minimize` icon; aria "Expand card" / "Shrink card". Must sit inside a `Card`.
- `CardBody({ title, actions?, className = "gap-3", children })`: `div.card-body` with `h2.card-title`, the actions row, then children.

### ui/Modal.tsx
- `Modal({ open, onClose?, closeButton = false, glow = "frost", glass = false, boxClassName = "", children })`.
- `open` calls `showModal()` in an effect. The effect's cleanup calls `close()`, so unmount or `open=false` closes it.
- `onClose` is the native `close` event: Escape, backdrop click, or a `form[method=dialog]` button.
- `closeButton`: round `close` icon button, top right, aria "Close".
- `glass`: `liquid-dialog` and `liquid-glass` classes. Only `SettingsDialog` uses it. Otherwise the panel is `glow glow-<glow>`.

### ui/hooks.ts
- `usePolling(fn, ms, enabled = true)`: `setInterval` that calls the latest `fn`. Runs only while `enabled`. Does not call `fn` at once: the first call is after `ms`.
- `useAnnouncement(name, handler)`: subscribes to a window event for the component's lifetime. Calls the latest handler.

### ui/Markdown.tsx and ui/markdown.ts
- `markdown.ts` (no DOM). Blocks: `paragraph`, `heading` (level 1–6), `code` (fenced), `list` (`ordered`), `quote`, `rule`. Inline: `code`, `strong` (`**`), `em` (`*`), `link`. Only `https?://` links are links; anything else stays text. A single line break stays inside its paragraph; a blank line ends it.
- `Markdown.tsx`: `Markdown({ text, renderText? })`. Builds elements, never HTML. `renderText(text)` draws each plain run; room replies pass `MessageText` so mentions stay pills. Links open in a new tab (`noopener noreferrer`). Heading sizes: level 1 `text-lg font-bold`, level 2 `text-base font-bold`, others `font-semibold`.

## ui/SourceCard.tsx
- Exports `MESSAGING_CARD_HEIGHT = "h-[30rem]"` (480 px at the default root size).
- Used by `EmailCard` and `SlackCard` (`flex shrink-0 h-[30rem]`) and by `WhatsAppCard` (`h-[30rem]`).
- The file holds only this constant.

## App.tsx
- State: `settingsOpen` (gear opens `SettingsDialog`), `view` (`"dash" | "preview" | "offline"`, `VIEWS`). Only `dash` renders cards; the other two show the header alone.
- Header: `div.navbar`, full row. Title `mip`, a `join` of view buttons (`aria-pressed`), and the gear (aria "Settings").
- Grid: `main` (`grid grid-cols-12 gap-4 xl:gap-5`, `overflow-y-auto`). This element scrolls, not the document. Rows, top to bottom:
  1. `AgentCard` in a wrapper `col-span-12 h-[min(47rem,85vh)] xl:col-span-8`.
  2. `BotsCard` in a wrapper `col-span-12 h-[min(43rem,85vh)] xl:col-span-4 xl:h-[min(47rem,85vh)]`.
  3. Messaging row `col-span-12 grid md:grid-cols-3`: `EmailCard`, `SlackCard`, `WhatsAppCard`. Each is `h-[30rem]`.
  4. `MemoryCard` and `RepositoriesCard`, each in a wrapper `col-span-12 h-[30rem] md:col-span-6`.
  5. Bottom grid `col-span-12 grid md:grid-cols-2 xl:grid-cols-3 [&>*:not(.fixed)]:h-72`: `SpendingCard`, `ToolsCard`, `SkillsCard`, `McpCard`, `PlaceholderCard` "Tasks" (yellow), `PlaceholderCard` "Activity" (blue). Every direct child is 18rem, except a fixed one. The `:not(.fixed)` matters: `[&>*]:h-72` also set the height of an expanded card (`EXPANDED` is fixed, so a fixed height cropped it to 18rem) and of the backdrop behind it (which covered only the top 18rem). Tasks and Activity have no `ExpandButton`, so they only open their placeholder dialog.
- Breakpoints (Tailwind defaults): `md` 768px, `xl` 1280px, `2xl` 1536px. Width: `max-w-5xl` below `xl`, none at `xl`, `max-w-[120rem]` at `2xl`. Gaps: 16px, and 20px at `xl`.

## features/agent/
| file | exports | job |
| --- | --- | --- |
| `AgentCard.tsx` | `AgentCard` | Wires the pieces. Holds the sidebar flag, the delete confirm and its error, and the personas dialog flag. Opens the first agent in the list on first load. On a phone (viewport below 768px) opening an agent closes the list. |
| `useAgents.ts` | `useAgents` | Providers, personas, agents, the open agent (`currentId`), and new-agent provider and persona. `refresh()` announces `AGENTS_CHANGED`. Listens for `PERSONAS_CHANGED` and `PROVIDERS_CHANGED`. |
| `useTranscript.ts` | `useTranscript(onRunSaved)` | Messages, busy, and the followed run. `applyEvent` builds the reply live. Follows runs every 600 ms. |
| `AgentList.tsx` | `AgentList` | Sidebar: provider and persona selects (new-agent choices), `+ New agent`, `Manage personas`, agent rows with rename and delete. |
| `AgentHeader.tsx` | `AgentHeader` | Menu button (aria "Toggle agents"), title, persona and provider badges, trailing controls. |
| `Transcript.tsx` | `Transcript` | Message bubbles. Scrolls to the newest message on change. |
| `AskCard.tsx` | `AskCard` | Controls for an agent's question. |
| `Composer.tsx` | `Composer` | Model and thinking dropdowns, the "Bots may control" toggle, the message box, and the `/` skill list. Owns the draft. |
| `skillCommand.ts` | `skillCommandQuery`, `matchingSkills` | Pure rules for the `/` list. Tested by `skillCommand.test.mjs`. |
| `PersonasDialog.tsx` | `PersonasDialog` | Manage personas. See below. |

- `useAgents` API: `GET /api/providers`, `GET /api/personas`, `GET /api/agents`, `POST /api/agents {providerId, personaId}`, `PATCH /api/agents/:id` with `{title}` (rename) or `{model}` / `{thinking}` / `{openToBots}` (settings), `DELETE /api/agents/:id`.
- `useTranscript` API: `GET /api/agents/:id` (returns `agent`, `messages`, `activeRunId`), `POST /api/run {agentId, prompt}` returns `{runId}`, `GET /api/runs/:runId/events?after=<seq>` returns `{status, events: {seq, event}[]}`. Follow loop ends when `status` is not `running`; then it reloads the agent and calls `onRunSaved` (the agent list refresh).
- `useTranscript` event kinds: `text` (appends), `tool_call` (adds the name and a call with `input` as JSON text), `tool_result` (sets `output` and `isError` on the call with the same `id`), `error` (sets the reply's error). Other kinds are ignored.
- A run keeps going on the server. `load()` follows `activeRunId` when the agent has one. Switching agents clears `following`, which stops the old loop.
- `Transcript`: an assistant message with no text, error, tools, or ask is not drawn, except the last one while busy, which shows loading dots. `ToolCallsButton` appears when `tools` is non-empty. `AskCard` appears when `ask` is set; it is disabled while busy, or once any later user message exists.
- `AskCard` kinds: `choice` (buttons, `Other` opens a text box), `multi` (checkboxes, `Other` checkbox and text, Send joins the picked options in list order with `, `), `text` (form; Enter sends), `slider` (range `min`/`max`/`step`, shows the value, Send sends `String(value)`).
- `AgentList`: a phone shows the list as a card over the agent with a backdrop button (aria "Close agents"). Desktop folds it beside the agent. Rename turns the row into an input: Enter saves a non-empty title, Escape cancels, blur cancels.
- `Composer`: model dropdown is `searchable`, lists the open agent's provider models. Thinking dropdown lists the model's `thinkingLevels`, labels from `THINKING_LABELS`; `""` is "Default thinking". Every change is `PATCH` and applies to the next message. Typing `/` at the start of the draft calls `GET /api/skills`; `skillCommandQuery` returns the text after `/` until a space; `matchingSkills` keeps skills whose name contains the text, names starting with it first; Enter picks the first match and writes `/<name> `.
- `PersonasDialog`: pick one persona (`(default)` marks the default; last option `+ Add new persona`), edit name and system prompt, Create or Save. `Set as default`. `Delete` is hidden for the default persona and for `DEFAULT_PERSONA_ID`, and asks through `ConfirmDialog`. API: `GET /api/personas`, `POST /api/personas`, `PUT /api/personas/:id`, `POST /api/personas/:id/default`, `DELETE /api/personas/:id`. Announces `PERSONAS_CHANGED` after save, default, and delete.

## features/bots/
| file | exports | job |
| --- | --- | --- |
| `BotsCard.tsx` | `BotsCard` | Room tabs, `+ New room`, the room's bot badges, `Room settings`, `Manage bots`, transcript, status row, message form. |
| `useRooms.ts` | `useRooms` | Rooms, bots, and the room on screen. `reload()` reads both. Keeps the current room if it still exists, else the first. |
| `useRoom.ts` | `useRoom(roomId)` | Messages, busy, speaking, error of one room. Polls every 1.5 s, asking only for messages after the last id. `send(text)` posts, polls at once, returns `true` when accepted. |
| `RoomDialog.tsx` | `RoomDialog` | Create or edit a room: name, bots (checkboxes), master (`None` or a checked bot), `collapseOthers`, Delete room through `ConfirmDialog`. `onClose(changed)`. |
| `MentionInput.tsx` | `MentionInput` | Message input with the `@` list. Arrow keys move, Enter or Tab picks, Escape hides. Renders inside a `relative` container. |
| `mentions.ts` | `mentionAt`, `suggestions`, `completeMention`, `splitMentions`, types `Mention`, `Piece` | Pure rules for `@partial` text and for splitting a message into text and mention pieces. Tested by `mentions.test.mjs`. |
| `RoomTranscript.tsx` | `RoomTranscript` | Bubbles for each message kind. See below. |
| `MessageText.tsx` | `MessageText` | Text with each bot mention as a `button.mention.bot-<color>`. Click calls `onOpenBot`. |
| `BotProfileModal.tsx` | `BotProfileModal` | Profile: color dot, provider name, model name or raw id or "Default model", thinking or "Default thinking", persona. `Edit bot` calls `onEdit`. Glow is the bot's color. |
| `botColors.ts` | `BOT_COLORS`, `nextBotColor` | Palette and order. See Gotchas. |
| `BotsDialog.tsx` | `BotsDialog` | List with Edit and Delete (through `ConfirmDialog`), `+ New bot`. `startWith` opens that bot's form on open. Closing reloads rooms in `BotsCard`. |
| `BotEditor.tsx` | `BotEditor` | Bot form. See below. |

- `useRooms` API: `GET /api/rooms` and `GET /api/bots` (together, in `reload`).
- `useRoom` API: `GET /api/room?room=<id>&after=<lastId>` returns `{messages, busy, speaking}`; `POST /api/room/messages {room, text}`.
- `RoomDialog` API: `POST /api/rooms` or `PUT /api/rooms/:id` with `{name, botIds, masterBotId, collapseOthers}` (empty master sent as `null`); `DELETE /api/rooms/:id`.
- `BotEditor` API: `POST /api/bots` or `PUT /api/bots/:id` with `{name, persona, providerId, model, thinking, color}`. A default model or thinking is sent as `""`. Provider, model, and thinking dropdowns: `OptionDropdown`; model is `searchable`.
- `BotsDialog` API: `GET /api/providers` and `GET /api/bots` on open; `DELETE /api/bots/:id`. `BotProfileModal` API: `GET /api/providers` when a bot is shown.
- `RoomTranscript`: `system` messages are centered lines. `user` messages are primary bubbles on the right. `bot` and `agent` replies are `Markdown`, with mentions as pills. A bot's bubble is `bot-bubble` and its name takes the bot color. With `collapseOthers`, a bot reply from a bot that is not `masterBotId` folds into a `details` with one line (80 characters); click opens it. Replies with tool calls get `ToolCallsButton`.
- `BotEditor`: a new bot takes `nextBotColor(usedColors)`, the first color no other bot uses. Changing the provider clears model and thinking. Changing the model clears thinking. Color swatches are the 8 `BOT_COLORS`, with `aria-pressed`.
- `RoomDialog`: removing a bot that is the master also clears the master.
- `useRoom` drops the messages when the room changes, and ignores a response that arrives for a room no longer on screen.
- `BotsCard` owns the room draft, the manage flag, the profile bot, the edit target, and the room dialog state.

## features/email/
| file | exports | job |
| --- | --- | --- |
| `EmailCard.tsx` | `EmailCard` | Card with account pills, rows for the inbox (unread dot, sender, date, subject), Load more, a status row, Refresh, Add account, Remove account. Text is `text-base` when expanded. |
| `useMail.ts` | `useMailAccounts`, `useMailbox` | Accounts: load, add, remove. One account's inbox: re-read every `pollSeconds`, `more()` for another page, `hasMore`. |
| `AddMailAccountDialog.tsx` | `AddMailAccountDialog` | Provider preset (default `gmail`), address, app password, and for `other` the host, port (default 993), and TLS checkbox. The server signs in before saving; a refusal shows its reason. |
| `MailMessageDialog.tsx` | `MailMessageDialog` | One message in full: subject, sender and address, date, `To`, text reflowed into paragraphs, web links, a note when `truncated`. |
| `mailFormat.ts` | `formatMailDate`, `displaySender`, `paragraphsOf`, `linkPieces` | Pure. Date: a time for today, else a short date; a dash for missing or invalid. Sender: the name, else the address. Tested by `mailFormat.test.mjs`. |

- API: `GET /api/mail/accounts` returns `MailAccountsReply` (`accounts`, `presets`, `problems`); `POST /api/mail/accounts` with `{preset, address, password, host, port, secure}`; `DELETE /api/mail/accounts/:id` returns the new `MailAccountsReply`; `GET /api/mail/accounts/:id/messages[?count=N]` returns `MailboxReply` (`messages`, `complete`); `GET /api/mail/accounts/:id/messages/:uid` returns `MailMessage`.
- Inbox: with no `count`, the server returns `max(LIST_LIMIT, cached length)` (`LIST_LIMIT` = 25, `src/backend/app/mail/imap.ts`). `Load more` asks for the shown count plus 25. `checkedAt` is set client-side when a read finishes.
- Poll interval: the account's `watch.pollSeconds` (server default 60). The effect is on only while an account is selected.
- Reading a message never marks it read on the server.
- Remove account: `ConfirmDialog` (`glow="red"`). The message says the mail stays on the server.

## features/slack/
| file | exports | job |
| --- | --- | --- |
| `SlackCard.tsx` | `SlackCard` | Card with unread badge, Accounts button, sign-in prompt, account pills, conversation select with Refresh, transcript, status row, composer, thread dialog. Text is `text-base` when expanded. |
| `SlackTranscript.tsx` | `SlackTranscript` | Chat bubbles in the order given. Own messages (`user === me`) are primary on the right. A message with replies has a reply-count button when `onOpenThread` is given. Used by the card and the thread dialog. |
| `SlackThreadDialog.tsx` | `SlackThreadDialog` | One thread (`useThread`) with a reply box. Reply sends in the thread as the user. |
| `SlackDialog.tsx` | `SlackDialog` | Accounts modal. See below. |
| `useSlack.ts` | `useSlack`, `useUnread`, `useConversations`, `useMessages`, `useThread` | Connection state and actions, unread counts, conversations, messages, thread. See below. |
| `mrkdwn.ts` | `parseBlocks`, `parseInline`, types `Block`, `Inline` | Pure reader for Slack's text format. Tested by `mrkdwn.test.mjs`. |
| `SlackText.tsx` | `SlackText` | Draws `mrkdwn.ts` output as elements. |

- `useSlack` API: `GET /api/slack` returns `SlackState` (`app`, `redirectUri`, `scopes`, `manifest`, `accounts`, `problems`); `PUT /api/slack/app {clientId, clientSecret}`; `POST /api/slack/connect {}` returns `{url}`; `POST /api/slack/token {token}`; `DELETE /api/slack/accounts/:id`.
- `useUnread`: `GET /api/slack/accounts/:id/unread` returns counts by conversation id. `reload` adds `?refresh=1`. Failures give an empty map and no error.
- `useConversations`: `GET /api/slack/accounts/:id/conversations`. `reload` adds `?refresh=1`.
- `useMessages`: `GET .../conversations/:channelId/messages`; `send(text)` posts `{text}` and reloads with `?refresh=1`.
- `useThread`: `GET .../conversations/:channelId/threads/:ts`; `reply(text)` posts `{text, threadTs}`.
- Conversations and messages load when the account or channel changes, and on Refresh or a send. They are not polled. In `useConversations` and `useMessages`, a request that was overtaken by a newer one is ignored.
- `SlackCard` sign-in: no app saved shows a prompt to use Accounts. App saved and no account shows `Sign in with Slack`, which opens `url` in a new tab and re-reads accounts every 3 s for 120 s (`WAIT_MS`, `POLL_MS`).
- `SlackCard` draws messages reversed from the list it holds (`[...list].reverse()`). Send keeps the draft if Slack refuses.
- Conversation labels: `# name` for channels, a lock prefix for private channels, `Group: name` for groups, and the bare name for a direct message. Unread counts are added to the option label.
- `SlackDialog`: shows `state.manifest` with a Copy button (paste it in Slack's "From a manifest"). Saves the client ID and secret (the secret is cleared after a save). `Sign in with Slack` is disabled without a saved app. `Connect with a user token instead` (`xoxp-` token). Lists accounts with Disconnect (`ConfirmDialog`, glow red). Shows `problems` from `slack.json`. `redirectUri` and `scopes` are typed but not drawn.
- `SlackText`: user mentions arrive as `@name` (the server resolves `<@U…>` with `resolveMentions` in `src/backend/app/slack/read.ts`). Remaining angle markup becomes a `span.mention`: `<!here>` shows `@here`; `<#C…|name>` shows `#name` (`#channel` without a label); `<@U…>` shows its label or the raw `@U…`. Links are `a` elements; only http, https, and mailto.

## features/whatsapp/
- `WhatsAppCard.tsx`: `WhatsAppCard`. Glow green, `MESSAGING_CARD_HEIGHT`, `CardBody` "WhatsApp", `ExpandButton`, and the text "WhatsApp is not connected yet." No API calls.

## features/memory/
| file | exports | job |
| --- | --- | --- |
| `MemoryCard.tsx` | `MemoryCard` | Glow green, `h-full`. `MemoryBody` switches between the graph (collapsed) and `MemoryManager` (expanded). |
| `MemoryGraph.tsx` | `MemoryGraph` | SVG graph. See below. |
| `graph-layout.ts` | `layoutGraph`, type `GraphData` | Force layout. See below. |
| `MemoryManager.tsx` | `MemoryManager` | The memory screen: search, open, new, edit, save, forget. |
| `NoteList.tsx`, `NoteView.tsx`, `NoteEditor.tsx` | `NoteList`, `NoteView`, `NoteEditor` | Left list with snippets; one note with its links and tags; the editor. |

- `MemoryBody` owns the graph data (`GET /api/graph` on mount, again after each save or delete) and `startNote` (set by a graph click, cleared when the card collapses). The header shows `N notes`: nodes that are not `missing`.
- Collapsed body: `MemoryGraph` in an `h-72` box, or "No notes yet. ..." when there are no notes.
- `MemoryGraph`: drag pans, wheel zooms (each tick ×1.1 or ÷1.1, view width kept between `box.w / 10` and `2 × box.w`), double-click resets. Hovering lights a node and its neighbours. Click opens the note unless the pointer dragged. Node radius `5 + min(degree, 10) × 1.5`. `missing` nodes are dashed hollow circles. Labels show when there are 30 nodes or fewer, or the node has degree 2 or more, or it is hovered.
- `layoutGraph(nodes, edges, width, height)`: Fruchterman–Reingold, 300 iterations, starts on a circle, gravity 0.1, deterministic. Returns positions in box units. `GraphNode` and `GraphEdge` are not exported.
- `MemoryManager` API: `GET /api/memory?q=<text>` returns `{notes: NoteItem[]}`, requested 200 ms after each keystroke and once on mount; `GET /api/memory/:title` returns `NoteDetail` (404 shows "No note called … yet." with `Create it`); `POST /api/memory {title, body}` saves and opens the note; `DELETE /api/memory/:title` (through `ConfirmDialog`). `onChanged` reloads the graph.
- `MemoryManager` is mounted only while the card is expanded. Its state is lost on collapse.
- `NoteEditor`: the title is locked for an existing note (it is the identity). Save needs a title and a body.

## features/repos/
| file | exports | job |
| --- | --- | --- |
| `RepositoriesCard.tsx` | `RepositoriesCard` | Glow orange, `h-full`. Clone form, `Pull all`, the list of `RepoRow`, Remove through `ConfirmDialog`. |
| `RepoRow.tsx` | `RepoRow` | One repo: status badge (`cloning`, `ready`, or `error` shown as "failed"), branch, link without credentials, error text, last pull result, copies, copy dropdown, Remove. |

- API: `GET /api/repos` returns `{repos}`; `GET /api/agents`; `POST /api/repos {url}`; `POST /api/repos/:id/copies {agentId}`; `POST /api/repos/pull` returns `{results: PullResult[]}`; `DELETE /api/repos/:id`.
- Reloads repos and agents on `AGENTS_CHANGED`. Polls every 1.5 s while any repo is `cloning`.
- `Pull all` is disabled while pulling or with no `ready` repo. Its results replace the per-row pull message until the next pull.
- Copy dropdown appears on `ready` repos only. Options are agents with no copy yet.

## features/spending/
| file | exports | job |
| --- | --- | --- |
| `SpendingCard.tsx` | `SpendingCard` | Glow green. Stats Income, Expense, Balance (income minus expense), then the entries. `Add entry` opens the dialog. Not `h-full`: it sits in the bottom grid. |
| `useSpending.ts` | `useSpending` | `GET /api/spending` returns `{entries}`. `add(input)` posts and reloads. Its failure is thrown to the dialog. |
| `AddSpendingDialog.tsx` | `AddSpendingDialog` | Form: Expense (default) or Income, category (datalist of the existing category names; a new name makes one), amount (`min 0`), description (optional, 200 characters). |

- API: `GET /api/spending`, `POST /api/spending {kind, category, amount, description}`.
- Categories are the distinct names among the loaded entries.

## features/tools/
| file | exports | job |
| --- | --- | --- |
| `ToolsCard.tsx` | `ToolsCard` | Glow orange. Table of the tool registry with the All / Agent / Bot pill. Clicking a row opens a `Modal` with the name, load, access badges, description, guide, and inputs. |

- API: `GET /api/tools` returns `{tools: ToolInfo[]}`, read on mount.
- Collapsed: the first 4 rows (`PREVIEW`) and "N more. Expand to see all.". Expanded: all rows in a scroll area.
- Columns: Tool; Offered (`load`: `basic`, `deferred`, or `search`); Used by (`agent` and `bot` badges, or `unused`).
- Pill filter: `agent` or `bot` flag of each tool. Bot view with no tools shows a note that bot turns have no workspace or run token.

## features/skills/
| file | exports | job |
| --- | --- | --- |
| `SkillsCard.tsx` | `SkillsCard` | Glow teal. Create, Import, and the skill list. Expanded: selected skill's description, body, files, and `Remove skill`. Shows the folders that could not be read. |
| `CreateSkillDialog.tsx` | `CreateSkillDialog` | Name, one-line description, instructions. All required. Name: lowercase letters, digits, hyphens; also the folder name. |
| `ImportSkillDialog.tsx` | `ImportSkillDialog` | Two steps: a folder path, then Review shows name, description, files, `SKILL.md`, and a warning when an installed skill would be replaced. Install confirms. |
| `useSkills.ts` | `useSkills` | `GET /api/skills` returns `{skills, problems}`; `load()` reads again. |

- API: `GET /api/skills/:name` (detail, read when the selection changes); `POST /api/skills {name, description, body}`; `DELETE /api/skills/:name` (through `ConfirmDialog`); `POST /api/skills/imports {path}` returns `SkillImport`; `POST /api/skills/imports/:id/confirm`; `DELETE /api/skills/imports/:id` when a staged import is closed unconfirmed (errors ignored).
- Agents and bots reach installed skills through the backend tools `skill_search` and `skill_read`.

## features/mcp/
| file | exports | job |
| --- | --- | --- |
| `McpCard.tsx` | `McpCard` | Glow red. `McpBody`: summary line, each server (`ServerRow`), problems, Add server, Reload. |
| `useMcpServers.ts` | `useMcpServers` | `GET /api/mcp` on mount; `reload`, `signIn`, `add`, `remove`. |
| `AddMcpDialog.tsx` | `AddMcpDialog` | Add form. See below. |
| `mcpForm.ts` | `parseHeaders`, `parseEnv`, `parseArgs` | Readers for the form's text boxes. Each throws with the bad line. Tested by `mcpForm.test.mjs`. |
| `signInWindow.ts` | `openSignInTab`, `goToSignIn`, `isWebLink` | Sign-in tab handling. Tested by `signInWindow.test.mjs`. |
| `mcpSummary.ts` | `summaryLine` | Summary such as "1 connected, 2 failed, 2 tools"; "need sign-in" for servers waiting. Tested by `mcpSummary.test.mjs`. |

- API: `GET /api/mcp` returns `McpStatus` (`configFile`, `servers`, `problems`); `POST /api/mcp/reload`; `POST /api/mcp/:name/sign-in` (returns `McpStatus`); `POST /api/mcp {name, transport, ...}` with `transport` `oauth`, `http` (`url`, `headers`), or `stdio` (`command`, `args`, `env`); `DELETE /api/mcp/:name`.
- `useMcpServers` re-reads every 1.5 s while any server is `connecting` or `sign-in`. `reload` and sign-in show their failure on the card. `add` and `remove` throw to their caller (the dialog or the confirm box).
- `ServerRow`: badge `OAuth` or the transport; status badge `starting` (connecting), `connected`, `needs sign-in`, `failed` (error). Collapsed: tool names. Expanded: table with Tool, Name on the server, Description. Buttons: `Sign in` link (status `sign-in` with a web link), `Sign in` button (status `error`, or `sign-in` without a link), `New link` (sign-in with a link), `Remove` (through `ConfirmDialog`, which says the entry leaves `mcp.json` with its sign-in and token).
- `AddMcpDialog`: OAuth is the default. Fields: name (the form checks only that it is not empty; the server requires a letter or digit first, then letters, digits, `-`, or `_`, up to 32 characters in all) and server address. The button `Add and sign in` opens the sign-in tab from the click, then posts; the tab goes to the server's `signInUrl`. If the browser blocked the tab, the dialog shows `Open sign-in page`. Manual entry: `Web address` (headers, one `Name: value` per line) or `Local command` (command, arguments one per line, environment `KEY=value` per line; the dialog warns that a command runs on this machine).
- `signInWindow`: `openSignInTab` opens a blank tab with `opener = null` from the click. `goToSignIn(tab, link)` sends it to an http(s) link, or closes it and returns `false`. `isWebLink` accepts only `https?://`.

## features/settings/
| file | exports | job |
| --- | --- | --- |
| `SettingsDialog.tsx` | `SettingsDialog` | `glass` modal with tabs Provider, Sync, Update. Closing announces `PROVIDERS_CHANGED`. Personas are managed from the agent card. |
| `ProviderTab.tsx` | `ProviderTab` | Provider and service selects, capability badges, sign-in panel, connected list. Polls every 2 s while open. |
| `SignInPanel.tsx` | `SignInPanel`, `runSignInAction`, `confirmSignOut` | Sign-in buttons, output, and the answer box. See below. |
| `outputLinks.ts` | `splitLinks`, type `OutputPiece` | Splits one output line into text and links. Tested by `outputLinks.test.mjs`. |
| `SyncTab.tsx` | `SyncTab` | GitHub account (a select when `gh` has several), Sync now, last run with notes. |
| `useSync.ts` | `useSync` | `GET /api/sync` on mount; polls every 1.5 s while running. `run()` posts; `chooseAccount(login)` puts. |
| `UpdateTab.tsx` | `UpdateTab` | Pull latest and Restart. |

- `ProviderTab` API: `GET /api/providers` on open and every 2 s while open. Each provider has `targets`; each target has `auth` (`loggedIn`, `method`) and `progress` (`running`, `output`, `error`, `prompt`).
- `ProviderTab` announces `PROVIDERS_CHANGED` when the sign-in state of any target changes (login or running).
- `SignInPanel` API: `POST /api/providers/:providerId/targets/:targetId/:action`, where `action` is `sign-in` with `{method}`, `answer` with `{answer}`, or `sign-out`. Methods: `subscription` ("Sign in with subscription"), `api_key` ("Use API key"), `cli` ("Sign in"). Failures show in the polled `progress`, not in the button handler.
- Output: a link in an output line becomes an `Open link` button (`window.open(url, "_blank", "noopener,noreferrer")`). The answer form shows while `progress.running`; a `secret` prompt uses a password input.
- `confirmSignOut` uses the browser's `window.confirm`, not `ConfirmDialog`.
- `SyncTab`: text says data goes to a private `dotmip` repo on the account the `gh` CLI is signed in to. `Sync now` is disabled without a login or while running. The last run shows its time, message, and notes. API: `GET /api/sync`, `POST /api/sync/run`, `PUT /api/sync/account {login}`.
- `UpdateTab` API: `POST /api/system/update` returns `{output}` (fast-forward only; empty output shows "Already up to date."); `POST /api/system/restart`. After restart, `GET /api/providers` is retried every 1 s, starting 2 s after the restart, and the page reloads when it answers.

## features/upcoming/
- `PlaceholderCard.tsx`: `PlaceholderCard({ title, summary, glow })`. Used for Tasks and Activity in `App.tsx`. Its `Open` button shows a `Modal` with the summary and "This is a placeholder, so nothing here works yet.". No API calls.

## Who owns which state
| state | owner |
| --- | --- |
| Settings open, page view | `App` |
| settings tab | `SettingsDialog` |
| providers, selected provider and service, sign-in polling | `ProviderTab` |
| sign-in progress, answer draft | `SignInPanel` |
| sync status | `useSync` |
| update output, busy | `UpdateTab` |
| providers, personas, agents, open agent, new-agent provider and persona | `useAgents` (called by `AgentCard`) |
| messages, busy, followed run | `useTranscript` (called by `AgentCard`) |
| sidebar open, delete confirm and error, personas dialog open | `AgentCard` |
| rename draft | `AgentList` |
| message draft, model and thinking dropdowns, `/` skill list | `Composer` |
| persona form (name, prompt, selection) | `PersonasDialog` |
| rooms, bots, room on screen | `useRooms` (called by `BotsCard`) |
| room messages, busy, speaking, error | `useRoom` (called by `BotsCard`) |
| room message draft, profile bot, bot edit target, manage flag, room dialog | `BotsCard` |
| bot list, editing mode, delete target | `BotsDialog` |
| bot form draft | `BotEditor` |
| room form | `RoomDialog` |
| graph data, note a graph click asked for | `MemoryBody` (`MemoryCard.tsx`) |
| notes, search, selected note, editor, errors | `MemoryManager` (mounted only while expanded) |
| repos, agents, clone link, pull results, removing | `RepositoriesCard` |
| mail accounts | `useMailAccounts` |
| one account's inbox, page size | `useMailbox` |
| selected account, open message, pending remove, add dialog | `EmailCard` |
| Slack connection | `useSlack` (called by `SlackCard`) |
| conversations, messages, unread counts, thread | `useConversations`, `useMessages`, `useUnread`, `useThread` |
| selected account and conversation, draft, thread id, waiting for sign-in | `SlackCard` |
| spending entries | `useSpending` |
| add dialog open | `SpendingCard` |
| tool rows, scope pill, selected tool | `ToolsCard` |
| installed skills, folders that could not be read | `useSkills` |
| selected skill and its detail, dialogs, remove | `SkillsCard` |
| MCP status, busy | `useMcpServers` (called by `McpBody`) |
| add dialog open, pending remove | `McpBody` |
| add form | `AddMcpDialog` |
| placeholder dialog open | `PlaceholderCard` |
| expanded, closing, entrance timing | `Card` (context via `useCardExpansion`) |

## Polling and events
| where | interval | runs while |
| --- | --- | --- |
| `features/bots/useRoom.ts` | 1.5 s | always (`BotsCard` mounted); no-op with no room |
| `features/agent/useTranscript.ts` | 600 ms | a run is followed (ends when status is not `running`) |
| `features/settings/ProviderTab.tsx` | 2 s | Settings open |
| `features/settings/useSync.ts` | 1.5 s | a sync is running |
| `features/settings/UpdateTab.tsx` | 2 s, then 1 s retries of `GET /api/providers` | after Restart, until the server answers, then reload |
| `features/repos/RepositoriesCard.tsx` | 1.5 s | any repo is `cloning` |
| `features/mcp/useMcpServers.ts` | 1.5 s | any server is `connecting` or `sign-in` |
| `features/email/useMail.ts` | account `watch.pollSeconds` (server default 60) | an account is selected |
| `features/slack/SlackCard.tsx` | 3 s for 120 s after a sign-in starts | waiting for approval, until an account exists |
| `features/memory/MemoryManager.tsx` | 200 ms debounce | on each search keystroke |
| `ui/Card.tsx` | 260 ms zoom, 200 ms close | expanding or closing |
| `ui/Starfield.tsx` | `requestAnimationFrame` | not with reduced motion |

Window events (`api/events.ts`, `window` `Event`s with no payload):

| name | constant | sent by | listened to by |
| --- | --- | --- | --- |
| `agents-changed` | `AGENTS_CHANGED` | `useAgents.refresh()` (every agent list load or change) | `RepositoriesCard` (reloads agents and repos) |
| `personas-changed` | `PERSONAS_CHANGED` | `PersonasDialog` (save, set default, delete) | `useAgents` (reloads personas) |
| `providers-changed` | `PROVIDERS_CHANGED` | `SettingsDialog` on close; `ProviderTab` when a sign-in state changes | `useAgents` (reloads providers, so model lists follow) |

## Styling and theme
- `styles.css`: `@plugin "daisyui" { themes: false }` and one `@plugin "daisyui/theme"` named `mip-nord-dark`: `default`, `prefersdark`, `color-scheme: dark`. No light theme.
- Tokens: base-100 `#2e3440`, base-200 `#3b4252`, base-300 `#434c5e`, base-content `#eceff4`, primary `#88c0d0`, secondary `#81a1c1`, accent `#8fbcbb`, neutral `#434c5e`, info `#5e81ac`, success `#a3be8c`, warning `#ebcb8b`, error `#bf616a`. Radius: selector and field 0.5rem, box 0.75rem.
- Glow colors (`.glow-<name>` sets `--glow`): frost `#88c0d0`, teal `#8fbcbb`, blue `#81a1c1`, violet `#b48ead`, red `#bf616a`, orange `#d08770`, yellow `#ebcb8b`, green `#a3be8c`. The same names and values are `.bot-<name>` classes.
- Card color: AgentCard frost, EmailCard frost, BotsCard violet, SlackCard violet, WhatsAppCard green, MemoryCard green, SpendingCard green, RepositoriesCard orange, ToolsCard orange, SkillsCard teal, McpCard red, PlaceholderCard yellow (Tasks) and blue (Activity).
- `.glow`: 0.5px border, 16px outer glow, background tinted 5% with the glow color. Expanded cards (`[aria-modal=true]`) and `.modal-box.glow` use a solid tinted background.
- Liquid glass (`Modal glass`): `.liquid-dialog` blurs the backdrop (18px); `.liquid-glass` is a translucent panel with blur 22px and a light rim.
- Motion: `.card` enters with `mip-rise` using `--enter-duration` and `--enter-delay`; `.navbar` `mip-drop`; `.chat` `mip-pop`; `.card li` and `dialog li` `mip-slide` (staggered); `.card p` and `.card .badge` `mip-fade`; `[role=alert]` and open dropdowns `mip-pop`; `.mip-fade` and `.mip-fade-out` for backdrops. `.btn` presses to `scale(0.96)`.
- `prefers-reduced-motion`: CSS sets all animation and transition durations to 0.01 ms. JS checks the same media query in `Card` (skips the zoom) and `Starfield` (one still frame). `MemoryGraph` has no JS check.
- One screen: `html`, `body`, `#app` are `height: 100%; overflow: hidden`. Scrollbars are hidden everywhere.
- Root font size: 110% at ≥2048px, 120% at ≥3000px. Every rem size (card heights, `h-[30rem]`) grows with it.
- Focus rings and box-shadows are removed; inputs keep their resting border color.
- `:is(.overflow-auto, .overflow-y-auto, .overflow-hidden, .modal-box):has(details.dropdown[open])` sets `overflow: visible`, so an open dropdown is not clipped.
- Bot classes: `.bot-dot`, `.bot-bubble` (24% bot color), `.bot-name` (bot color, weight 600), `.mention` (pill; `--bot` as border and fill).
- Expanded cards step text up one size: `text-sm` to `text-base`, `text-xs` to `text-sm`, `btn-xs` to `btn-sm`, `badge-xs` to `badge-sm`. The check is `useCardExpansion()`.

## Gotchas
- `DEFAULT_PERSONA_ID` is duplicated in `api/constants.ts` and `src/backend/app/personas.ts`. `DEFAULT_PROVIDER_ID` (`"claude-cli"`) must match the server's default in `src/backend/app/bots.ts`. Change both sides together.
- Bot colors: `BOT_COLORS` in `features/bots/botColors.ts` must match `src/backend/storage/bot-colors.ts` in names and order (a new bot takes the first unused one). Each name also needs `.bot-<name>` and `.glow-<name>` in `styles.css`, since a bot's color is the glow of its profile modal. The `BotColor` and `Glow` types repeat the names.
- Tailwind classes must be literal strings in source, because the class scanner reads source text. `glow-${glow}` and `bot-${color}` are safe only because those classes are plain CSS in `styles.css`.
- `ui/SourceCard.tsx` keeps `MESSAGING_CARD_HEIGHT` as a literal class string for the same reason.
- `App.tsx` bottom grid: `[&>*]:h-72` applies to every direct child. `EXPANDED` sets no height, so an expanded bottom-row card (and the `fixed inset-0` backdrop rendered beside it) keeps `h-72`. Not checked in a browser.
- `ConfirmDialog` labels its confirm button "Delete" for every caller, including Remove and Disconnect.
- `SignInPanel.confirmSignOut` uses `window.confirm`, the one confirm that is not `ConfirmDialog`. `ui/ConfirmDialog` exists because `confirm()` can be blocked.
- `api/client.ts` parses the body with `res.json()` before checking `res.ok`. A non-JSON error response throws a `SyntaxError`, not an `ApiError`.
- `usePolling` does not call `fn` at once. Callers that need data on mount call it themselves (`useRoom`, `useMailbox`, `useMcpServers`).
- `useAgents.loadPersonas` resets the new-agent persona to the default on every reload, so a persona picked in the sidebar is lost after `PERSONAS_CHANGED`.
- `AgentList` rename: blur cancels the rename without saving.
- `MemoryManager` unmounts when the memory card collapses; its search, open note, and editor are lost. `startNote` is cleared on collapse.
- `useRoom`: changing rooms clears messages and drops late responses for the old room.
- Status rows (`role="status"`) in `BotsCard`, `SlackCard`, and `EmailCard` are `h-5 flex-none`, so showing or hiding text does not move the list above.
- Text in an expanded card body: `McpCard` draws its summary line and hints as `div`s, because daisyUI grows every paragraph in an expanded card body (per the `McpCard` comment). Its server error and problem lines are `p` elements.
- Preact `useRef` needs an initial argument in TypeScript: `useRef<T | undefined>(undefined)`.
- A dialog opened from inside an expanded card closes with Escape first. The card's Escape handler skips while any `dialog[open]` exists.
