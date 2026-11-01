# Frontend

Preact 11 + daisyUI 5 + Tailwind 4 (`styles.css` imports Tailwind and the Nord theme). `main.tsx` renders `App.tsx`. One page, one scrolling grid. Line numbers are in `symbols.md`.

## Folders
- `api/`: the HTTP boundary and the shared vocabulary of response types.
- `ui/`: primitives and hooks used by more than one feature. No feature imports another feature.
- `features/<name>/`: one folder per card or dialog family. Each folder owns its components, hooks, and pure rules.
- `App.tsx`: the page layout. It imports features and `ui/Starfield` only.

## api/
- `client.ts`: the only place that calls `fetch`. `ApiError` (has `status`), `api` (`get`, `post`, `put`, `patch`, `del`), and `errorText`.
- `types.ts`: response shapes that mirror `src/backend`. Agents, messages and their tool calls, runs and run events, personas, bots, room messages, repos, memory notes, providers, skills and skill imports, the tool registry (`ToolInfo`), and the sync status.
- `events.ts`: window events for cross-card changes: `AGENTS_CHANGED` and `PERSONAS_CHANGED`, with `announce` and `subscribe`.
- `constants.ts`: `DEFAULT_PERSONA_ID` (must equal the server's) and `DEFAULT_PROVIDER_ID`.

## ui/
Shared pieces. Each is used by more than one feature.

| file | exports | purpose |
| --- | --- | --- |
| `Card.tsx` | `Card`, `CardBody`, `ExpandButton`, `useCardExpansion`, `Glow` | The dashboard card shell. It owns the expanded state. Expanding zooms the same element from its grid cell into a fixed panel, and the backdrop fades. Closing holds the panel briefly, then shrinks it back. Escape, a backdrop click, or `ExpandButton` closes it. Reduced motion skips the zoom. Content reads the expanded state with `useCardExpansion`. |
| `Modal.tsx` | `Modal` | A native `<dialog>` opened by its `open` prop. Props: `onClose`, `closeButton`, `glow`, `glass` (liquid glass, used by Settings), and `boxClassName`. The panel is the same glowing panel as a card. |
| `ConfirmDialog.tsx` | `ConfirmDialog` | A yes-or-no question, with an `error` line. Built on `Modal`. |
| `ErrorAlert.tsx` | `ErrorAlert` | A red alert for a message. Renders nothing without one. |
| `Icon.tsx` | `Icon`, `IconName` | Named SVG icons. |
| `OptionDropdown.tsx` | `OptionDropdown` | A fixed-width dropdown with ellipsis, for model, thinking, provider, and copy-to-agent. |
| `RunScopePills.tsx` | `RunScopePills`, `RunScope` | The All / Agent / Bot pill that picks a card's view. One size larger when its card is expanded. Used by the Tools and Skills cards. |
| `ToolCallDetails.tsx` | `ToolCallDetails` | One tool call's name, input, and result. Used by the tool-call dialog. |
| `toolName.ts` | `toolLabel`, `prettyJson` | Pure helpers. `toolLabel` drops the `mcp__<server>__` prefix. |
| `hooks.ts` | `usePolling`, `useAnnouncement` | An interval that always runs the latest function, and a window-event listener. |
| `Starfield.tsx` | `Starfield` | A fixed canvas of twinkling stars. Honors reduced motion. |

## App.tsx
- `App` owns: whether Settings is open, whether memory is open, the memory start note, and a memory version that changes after a save or delete.
- Layout, in order, inside the grid:
  1. The navbar: the title and the gear, which opens `SettingsDialog`.
  2. `AgentCard`, two-thirds of the width on desktops.
  3. `BotsCard`, one-third of the width on desktops.
  4. `MemoryCard`.
  5. `RepositoriesCard`.
  6. The bottom row, two columns on tablets and five on desktops: `PlaceholderCard` Tasks, `PlaceholderCard` Activity, `ToolsCard`, `SkillsCard`, and `PlaceholderCard` MCP.
- Breakpoints are the Tailwind defaults: md at 768px, xl at 1280px.
- Gaps: `gap-4` (16px), and `xl:gap-5` (20px) on desktops.

## features/agent/
| file | exports | job |
| --- | --- | --- |
| `AgentCard.tsx` | `AgentCard` | Composes the pieces. Opens the newest agent on load. Its header has a Skills button (opens `AgentSkillsDialog`). Phones close the agent list. |
| `useAgents.ts` | `useAgents` | Providers, personas, agents, the open agent, and new-agent choices. Announces `AGENTS_CHANGED`, and listens for `PERSONAS_CHANGED`. |
| `useTranscript.ts` | `useTranscript` | Messages, busy, and the run being followed. `applyEvent` builds a reply live: text, tool names, each call with its input, and its result matched by id. Polls run events every 600 ms while a run goes. |
| `AgentList.tsx` | `AgentList` | The sidebar: provider and persona selects, New agent, the list with inline rename and delete. |
| `PersonasDialog.tsx` | `PersonasDialog` | Manage personas: pick, edit, set default, and delete with confirmation. |
| `AgentSkillsDialog.tsx` | `AgentSkillsDialog` | Checkboxes for the installed skills this agent may use. Saves with `PUT /api/agents/:id/skills`. |
| `AgentHeader.tsx` | `AgentHeader` | The title, the persona and provider badges, and the header controls. |
| `Transcript.tsx` | `Transcript` | Message bubbles. A reply that used tools has a View tool calls button at its bottom. |
| `ui/ToolCallsDialog.tsx` | `ToolCallsButton`, `ToolCallsDialog` | The button and the dialog listing one reply's tool calls with their inputs and results. Used by agent replies and bot replies in the room. A reply saved before details were recorded lists its names only. |
| `Composer.tsx` | `Composer` | Model and thinking dropdowns, and the message box. Owns the draft. |

## features/bots/
| file | exports | job |
| --- | --- | --- |
| `BotsCard.tsx` | `BotsCard` | The bots' rooms: a tab per room, + New room, Manage bots, the members of the room on screen with Room settings, a status line with a fixed height, and the message form. |
| `useRooms.ts` | `useRooms` | The rooms, the bots, and which room is on screen. The room on screen stays when it still exists. |
| `useRoom.ts` | `useRoom(roomId)` | The messages, busy, speaking, and errors of one room. Polls every 1.5 s for new messages, and drops a room's messages when the page switches to another room. |
| `RoomDialog.tsx` | `RoomDialog` | Makes a room, or edits one: its name, its bots, and Delete room with a confirm. |
| `MentionInput.tsx` | `MentionInput` | The input with the bot suggestion list. |
| `mentions.ts` | `mentionAt`, `suggestions`, `completeMention` | Pure rules for `@partial` text. No React. |
| `RoomTranscript.tsx` | `RoomTranscript` | Bubbles for people and bots, and centered lines for system notes. A bot's bubble takes a light tint of its color, and its name takes the color. A reply that used tools has a View tool calls button at its bottom. |
| `MessageText.tsx` | `MessageText` | A message's text, with each mention of a bot as a pill in that bot's color. A click opens `BotProfileModal`. |
| `BotProfileModal.tsx` | `BotProfileModal` | A bot's profile: color, provider, model, thinking level, and persona. Its Edit button opens the bot's form in `BotsDialog`. |
| `botColors.ts` | `BOT_COLORS`, `nextBotColor` | The palette, in the order a new bot takes its colors. The server has the same list. |
| `BotsDialog.tsx` | `BotsDialog` | Manage bots: list, New, Edit, and Delete with confirmation. |
| `BotEditor.tsx` | `BotEditor` | The bot form, with a color picker of eight swatches and checkboxes for the installed skills the bot may use. A new bot starts on the first color no other bot uses. Clears model and thinking when the provider or model changes. |

## features/memory/
| file | exports | job |
| --- | --- | --- |
| `MemoryCard.tsx` | `MemoryCard` | One card with two bodies. Collapsed: the graph. Expanded: `MemoryManager`. A graph click opens the card on that note. |
| `MemoryGraph.tsx` | `MemoryGraph` | The SVG graph: drag to pan, wheel to zoom, double-click to reset, click to open a note. |
| `graph-layout.ts` | `layoutGraph`, `GraphNode`, `GraphEdge`, `GraphData` | A deterministic force layout. |
| `MemoryManager.tsx` | `MemoryManager` | The memory screen: search with a 200 ms debounce, open, new, edit, save, and forget. |
| `NoteList.tsx`, `NoteView.tsx`, `NoteEditor.tsx` | `NoteList`, `NoteView`, `NoteEditor` | The list with snippets, one note with its links and tags, and the editor. |

## features/repos/
| file | exports | job |
| --- | --- | --- |
| `RepositoriesCard.tsx` | `RepositoriesCard` | Clone form, Pull all, and the list. Reloads on `AGENTS_CHANGED`. Polls every 1.5 s while a clone runs. |
| `RepoRow.tsx` | `RepoRow` | One repo: status, branch, link with credentials hidden, last pull message, copies, copy-to-agent, and Remove. Reads the expanded state, so its text grows with the card. |

## features/skills/
| file | exports | job |
| --- | --- | --- |
| `SkillsCard.tsx` | `SkillsCard` | The installed skills with the All / Agent / Bot pill. All lists skills, with the selected skill's text when expanded. Agent lists each agent (an agent conversation) and its skills. Bot lists each bot and the skills it has enabled. Create, Import, and Remove. |
| `CreateSkillDialog.tsx` | `CreateSkillDialog` | Creates a skill from a form: name, description, instructions. |
| `ImportSkillDialog.tsx` | `ImportSkillDialog` | Two steps: review a folder's files and `SKILL.md`, then install. |
| `useSkills.ts` | `useSkills` | Loads the installed skills and any folders that could not be read. |

## features/tools/
| file | exports | job |
| --- | --- | --- |
| `ToolsCard.tsx` | `ToolsCard` | The tool registry as a table, with the All / Agent / Bot pill. Clicking a row opens that tool's description, guide, and inputs in a `Modal`. |

## features/settings/
| file | exports | job |
| --- | --- | --- |
| `SettingsDialog.tsx` | `SettingsDialog` | Tabs: Provider, Sync, and Update. Personas are managed from the agent card. |
| `ProviderTab.tsx` | `ProviderTab` | Provider and service selects, capability badges, the sign-in panel, and the connected list. Polls every 2 s while open. |
| `SignInPanel.tsx` | `SignInPanel` | Sign-in buttons, output, and the answer box. A link in the output is an Open link button that opens a new tab. |
| `outputLinks.ts` | `splitLinks` | Splits one line of sign-in output into text and links. Tested by `outputLinks.test.mjs`. |
| `SyncTab.tsx` | `SyncTab` | The GitHub account (a dropdown when gh has several), Sync now, and the last run with its notes. |
| `useSync.ts` | `useSync` | The sync status. Polls every 1.5 s while a sync runs. |
| `UpdateTab.tsx` | `UpdateTab` | Pull latest, and Restart. After a restart it waits for the server and reloads the page. |

## features/upcoming/
- `PlaceholderCard.tsx`: `PlaceholderCard`, for Tasks, Activity, and MCP. No data yet. Its Open button shows a dialog with the placeholder note.

## Who owns which state
| state | owner |
| --- | --- |
| agents, providers, personas, the open agent, new-agent choices | `useAgents` |
| messages, busy, the run being followed | `useTranscript` |
| sidebar open, delete confirmation | `AgentCard` |
| rename draft | `AgentList` |
| composer draft | `Composer` |
| room messages, busy, speaking, errors, for the room on screen | `useRoom` |
| rooms, bots, and which room is on screen | `useRooms` |
| memory list, query, note, editor, errors | `MemoryManager` (mounted only while the card is expanded) |
| graph data, and the note a graph click asked for | `MemoryBody` in `MemoryCard.tsx` |
| repos, agents, link, pulls | `RepositoriesCard` |
| installed skills, selected skill, dialogs | `SkillsCard` and `useSkills` |
| scope pill, selected tool | `ToolsCard` and `SkillsCard` |
| sync status | `useSync` |
| providers, selected service | `ProviderTab` |
| settings tab | `SettingsDialog` |
| settings open, memory open, memory start note, memory version | `App` |

## Polling and events
- Room: 1.5 s, while mounted.
- Agent run follow: 600 ms, while a run is going.
- Providers in Settings: 2 s, while Settings is open.
- Repos while cloning: 1.5 s.
- Sync while running: 1.5 s.
- Memory search: 200 ms debounce.
- Window events: `agents-changed` (agent list changed) and `personas-changed` (persona changed). See `api/events.ts`.

## Styling and theme
- `styles.css`: the Nord theme tokens in `@plugin "daisyui/theme"`. Dark only.
- Card glow: `.glow` uses `--glow` for a 0.5px border, an outer glow, and a 5% tint. Each card has a color: agent frost, bots violet, memory green, repositories orange, tasks yellow, activity blue, skills teal, MCP red, and tools orange.
- Card entrances: `ui/Card.tsx` draws a random duration (0.4–1.2 s) and delay (0–0.5 s) on mount, and sets them as `--enter-duration` and `--enter-delay`. The order changes on every page load.
- Expanded cards step their text up one size. Tables, pills, badges, and detail text all follow this rule.
- Dialogs are native `<dialog>` elements. Focus outlines are off.

## Gotchas
- `DEFAULT_PERSONA_ID` is duplicated in `api/constants.ts` and `app/personas.ts`. Change both.
- The status row under the bots transcript has a fixed height (`h-5 flex-none`). Without `flex-none`, flex grow makes it fill spare space.
- Bot colors are `.bot-<name>` classes in `styles.css`, each setting `--bot`. `.bot-bubble`, `.bot-name`, `.bot-dot`, and `.mention` read it. The names must match `storage/bot-colors.ts`.
- Tailwind classes must appear as literal strings in source, because the class scanner reads source text. The glow colors are plain CSS, so the `glow-${glow}` template is fine.
- Preact `useRef` needs an initial argument: `useRef<T | undefined>(undefined)`.
- A dialog opened from inside an expanded card closes with Escape first. The card's Escape handler skips while any dialog is open.
