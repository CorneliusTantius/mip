# Frontend

Preact 11 + daisyUI 5 + Tailwind 4 (`styles.css` imports Tailwind and the Nord theme). Entry `main.tsx` renders `App.tsx`. One page, one scrolling grid.

## Folders
- `api/` — the HTTP boundary and shared vocabulary.
- `ui/` — primitives and hooks used by every feature. No feature imports another feature.
- `features/<name>/` — one folder per card or dialog family. Each folder owns its components, hooks, and pure rules.
- `App.tsx` — the page layout. Imports features and `ui/Starfield` only.

## api/
- `api/client.ts` — `ApiError` (:4, has `status`), `request` (:16, parses JSON, throws `ApiError` with the server's `error`), `api` (:27: `get`, `post`, `put`, `patch`, `del`), `errorText` (:36). The only place that calls `fetch`.
- `api/types.ts` — response shapes: `ProviderInfo`, `SignInTarget`, `Persona`, `Session`, `ChatMessage`, `ChatDetail`, `RunEvent`, `Bot`, `RoomMessage`, `Repo`, `PullResult`, `NoteItem`, `NoteDetail`. Mirrors `src/backend`.
- `api/events.ts` — `CHATS_CHANGED` (:5, `sessions-changed`), `PERSONAS_CHANGED` (:7, `personas-changed`), `announce(name)`, `subscribe(name, handler)`.
- `api/constants.ts` — `DEFAULT_PERSONA_ID` (:4, must equal the server's `app/personas.ts:7`), `DEFAULT_PROVIDER_ID` (:6, `claude-cli`).

## ui/
| file | export (line) | purpose |
| --- | --- | --- |
| `ui/Card.tsx` | `Glow` type (:4), `Card` (:7), `CardBody` (:12) | Dashboard card shell: `section.card glow glow-<color> bg-base-200/80`. `CardBody` = title row (title, optional actions) + content. |
| `ui/Modal.tsx` | `Modal` (:18) | Native `<dialog>` opened and closed by the `open` prop. Props: `onClose`, `closeButton` (round X), `boxClassName`. Closes on unmount. |
| `ui/ConfirmDialog.tsx` | `ConfirmDialog` | Yes/no question with `error` and Cancel/Delete. Built on `Modal`. |
| `ui/ErrorAlert.tsx` | `ErrorAlert` | Red alert for a message. Renders nothing without a message. |
| `ui/Icon.tsx` | `SHAPES` (:4), `Icon`, `IconName` | Named SVG icons: `close`, `menu`, `edit`, `trash`, `chevronDown`, `gear`. |
| `ui/OptionDropdown.tsx` | `OptionDropdown` | Fixed-width dropdown with ellipsis (daisyUI `details`). Used for model, thinking, provider, copy-to-chat. |
| `ui/hooks.ts` | `usePolling` (:5), `useAnnouncement` (:17) | Interval that always runs the latest function; window-event listener. |
| `ui/Starfield.tsx` | `Starfield` | Fixed canvas of twinkling stars (Nord colors). Honors reduced motion. |

## App.tsx
- `App` (:22) owns: settings open, memory open, memory start note, memory version (bumped after a memory save or delete).
- Layout (grid `main`, children in this order):
  1. `div.navbar` — title and gear (opens `SettingsDialog`).
  2. `div` `col-span-12 h-[min(44rem,80vh)] xl:col-span-8` → `ChatCard`.
  3. `div` `col-span-12 h-[min(40rem,80vh)] xl:col-span-4 xl:h-[min(44rem,80vh)]` → `BotsCard`.
  4. `div` `MEDIUM` → `MemoryCard`.
  5. `div` `MEDIUM` → `RepositoriesCard`.
  6. `div` `col-span-12 grid md:grid-cols-2 xl:grid-cols-4` → `EmptyCard` Tasks, `EmptyCard` Activity, `PlaceholderCard` Skills, `PlaceholderCard` MCP.
- Dialogs at the end: `SettingsDialog`, `MemoryDialog`.
- Breakpoints: md 768px, xl 1280px (Tailwind defaults). Desktops side-by-side for chat and bots.
- Gaps between cards: `gap-4` (16px), `xl:gap-5` (20px) on the main grid and the bottom row.

## features/chat/
| file | export (line) | state / job |
| --- | --- | --- |
| `ChatCard.tsx` | `ChatCard` (:18) | Composes the pieces. Opens the newest chat on load (`:24`). `openChat` (:31) selects and loads; phones close the list. `createChat` (:37). `confirmDelete` (:46). Sidebar open state. |
| `useChatSessions.ts` | `useChatSessions` (:10) | Providers, personas, chats, open chat id, new-chat choices. `refresh` (announces `CHATS_CHANGED`), `loadPersonas` (:32, listens `PERSONAS_CHANGED`), `create`, `rename`, `changeSettings`, `remove` (:69). |
| `useTranscript.ts` | `useTranscript` (:11) | Messages, busy, following run. `applyEvent` (:23), `follow` (:31, polls events every 600 ms), `load` (:61), `send` (:70), `clear` (:81). |
| `SessionList.tsx` | `SessionList` (:33) | Sidebar: provider/persona selects, New session, list with inline rename, delete button. Backdrop on phones. |
| `ChatHeader.tsx` | `ChatHeader` (:4) | Title, persona and provider badges, toggle button. |
| `Transcript.tsx` | `Transcript` (:5) | Message bubbles; scrolls to the newest; tool names as badges; dots while the reply is empty. |
| `Composer.tsx` | `Composer` (:17) | Model and thinking dropdowns, message box. Owns the draft. |

## features/bots/
| file | export (line) | state / job |
| --- | --- | --- |
| `BotsCard.tsx` | `BotsCard` (:9) | Room: badges, Manage bots, status line (fixed height `h-5`), form. Owns the draft and the dialog flag. |
| `useRoom.ts` | `useRoom` (:18) | Bots, messages, busy, speaking, error. `loadBots` (:27), `poll` (:32, 1.5 s, only new messages by id), `send` (:49, returns true when accepted). |
| `MentionInput.tsx` | `MentionInput` (:7) | Input with the bot suggestion list. Caret tracking, arrows, Enter/Tab pick, Escape hides. |
| `mentions.ts` | `mentionAt` (:12), `suggestions` (:19), `completeMention` (:27) | Pure rules for `@partial` text. No React. |
| `RoomTranscript.tsx` | `RoomTranscript` (:5) | Bubbles for people and bots, centered lines for system notes. |
| `BotsDialog.tsx` | `BotsDialog` (:10) | Manage bots: list, New, Edit, Delete (confirm). Reloads on open. |
| `BotEditor.tsx` | `BotEditor` (:20) | Bot form: name, provider, model, thinking, persona. Clears model and thinking when provider or model changes. |

## features/memory/
| file | export (line) | state / job |
| --- | --- | --- |
| `MemoryCard.tsx` | `MemoryCard` (:9) | Graph card. Fetches `/api/graph` on `version` change. Counts non-missing nodes as notes. |
| `MemoryGraph.tsx` | `MemoryGraph` (:13) | SVG graph: drag pan, wheel zoom, double-click reset, hover highlights neighbors, click opens note. |
| `graph-layout.ts` | `layoutGraph` (:27) | Fruchterman–Reingold layout, 300 iterations, deterministic from a circle. Types `GraphNode`, `GraphEdge`, `GraphData`. |
| `MemoryDialog.tsx` | `MemoryDialog` (:24) | Memory screen: search (200 ms debounce), open note (`openNote` :58, 404 → "create it"), `startNew` (:74), `startEdit` (:82), `save` (:88), `forget` (:101). |
| `NoteList.tsx` | `NoteList` (:4) | Search box and list, snippets for matches. |
| `NoteView.tsx` | `NoteView` (:4) | One note: text, links, backlinks, tags. Links open notes. |
| `NoteEditor.tsx` | `NoteEditor` (:4) | Title (locked for existing notes) and text. Owns its draft. |

## features/repos/
| file | export (line) | state / job |
| --- | --- | --- |
| `RepositoriesCard.tsx` | `RepositoriesCard` (:16) | Clone form, Pull all, list. Reloads on `CHATS_CHANGED`. Polls 1.5 s while any repo is cloning. `clone` (:44), `copy` (:56), `pullAll` (:67), `remove` (:82). |
| `RepoRow.tsx` | `RepoRow` (:21), local `StatusBadge` | One repo: status, branch, link (credentials hidden), last pull message, copies, copy-to-chat dropdown, Remove. |

## features/settings/
| file | export (line) | state / job |
| --- | --- | --- |
| `SettingsDialog.tsx` | `SettingsDialog` (:7) | Tabs: Provider, Config. |
| `ProviderTab.tsx` | `ProviderTab` (:13) | Provider and service selects, capability badges, sign-in panel, Connected list. Polls 2 s while open (`POLL_MS` :9). |
| `SignInPanel.tsx` | `runSignInAction` (:9), `confirmSignOut` (:14), `SignInPanel` (:19) | Sign-in buttons, output, answer box. Actions: `sign-in`, `answer`, `sign-out`. Uses native `confirm()`. |
| `PersonasTab.tsx` | `PersonasTab` (:12) | Persona select (last option adds one), name, system prompt, Set as default, Delete. Announces `PERSONAS_CHANGED`. Uses native `confirm()`. |

## features/upcoming/
- `EmptyCard.tsx` — `EmptyCard` (:4). Tasks and Activity. No data yet.
- `PlaceholderCard.tsx` — `PlaceholderCard` (:6). Skills and MCP. Open button shows a dialog with the placeholder note.

## Who owns which state
| state | owner |
| --- | --- |
| chats, providers, personas, open chat, new-chat choices | `useChatSessions` |
| messages, busy, following run | `useTranscript` |
| sidebar open, delete confirm | `ChatCard` |
| rename draft, renaming id | `SessionList` |
| composer draft | `Composer` |
| room messages, busy, speaking, bots, error | `useRoom` |
| manage-bots list, bot being edited, delete confirm | `BotsDialog` |
| bot form draft | `BotEditor` |
| memory list, query, note, editor, delete confirm, error | `MemoryDialog` |
| graph data | `MemoryCard` |
| repos, chats, link, pulls, pulling, remove confirm | `RepositoriesCard` |
| providers, selected service | `ProviderTab` |
| answer text | `SignInOutput` (inside `SignInPanel.tsx`) |
| personas, selected persona, name, prompt | `PersonasTab` |
| settings tab | `SettingsDialog` |
| settings open, memory open, memory start note, memory version | `App` |

## Polling and events
- Room: 1.5 s (`useRoom.ts:7`), always while mounted.
- Chat run follow: 600 ms (`useTranscript.ts:6`), only while a run is going.
- Providers in Settings: 2 s (`ProviderTab.tsx:9`), only while Settings is open.
- Repos while cloning: 1.5 s (`RepositoriesCard.tsx:12`).
- Memory search: 200 ms debounce (`MemoryDialog.tsx`, the search effect).
- Window events: `sessions-changed` (chat list changed), `personas-changed` (persona changed). See `api/events.ts`.

## Styling and theme
- `styles.css` — Nord theme tokens in `@plugin "daisyui/theme"` (:95). Dark only.
- Card glow: `.glow` (:132) uses `--glow` for a 0.5px border (55%), the outer glow (45%), and a 5% tint over the card's background. Colors: `.glow-frost` (:138, chat), `.glow-violet` (:141, bots), `.glow-green` (:145, memory), `.glow-orange` (:143, repos), `.glow-yellow` (:144, tasks), `.glow-blue` (:140, activity), `.glow-teal` (:139, skills), `.glow-red` (:142, MCP).
- Card entrances: `ui/Card.tsx` draws a random duration (0.4–1.2 s) and delay (0–0.5 s) for each card on mount, and sets them as `--enter-duration` and `--enter-delay`. `styles.css` `.card` reads them, so the order changes on every page load.
- Native `<dialog>` modals. Focus outlines are off (`styles.css` top).

## Gotchas
- `DEFAULT_PERSONA_ID` is duplicated (`api/constants.ts:4` and `app/personas.ts:7`). Change both.
- Status row under the bots transcript has a fixed height (`BotsCard.tsx`, class `h-5 flex-none`). Without `flex-none`, flex grow makes it fill spare space.
- Tailwind classes must appear as literal strings in source (the class scanner reads source text). Glow classes are plain CSS, so the `glow-${glow}` template is fine.
- Preact `useRef` needs an initial argument: `useRef<T | undefined>(undefined)`.
