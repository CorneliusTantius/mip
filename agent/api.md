# HTTP API

All bodies are JSON. Errors are `{"error": "<message>"}`. Route handlers live in `src/backend/http/routes/<domain>.ts`, listed in `routes/index.ts:13`. Status: `200` ok, `201` created, `202` accepted (work continues in the background).

Common errors: `400` bad input, `404` not found (message `no such …`), `409` conflict (busy, still running, in use, duplicate), `500` unexpected. Unknown path or method: `404 {"error":"not found"}`. Non-API GET: static file from `dist/frontend`, else 404.

Matching: path segments are decoded before matching; a trailing slash is tolerated.

## Sessions (chats) — `routes/sessions.ts`
| method | path | handler | status | body | errors |
| --- | --- | --- | --- | --- | --- |
| GET | /api/sessions | :7 | 200 | `{sessions: Session[]}` | |
| POST | /api/sessions | :8 | 201 | `Session` (body `{providerId, personaId}`) | 400 unknown provider/persona |
| GET | /api/sessions/:sessionId | :12 | 200 | `{session, messages, activeRunId?}` | 404 no such session |
| PATCH | /api/sessions/:sessionId | :13 | 200 | `Session` (body `{title?, model?, thinking?}`; `""` clears model/thinking) | 400 empty title, unknown model, thinking not accepted by model; 404 |
| DELETE | /api/sessions/:sessionId | :14 | 200 | `{ok:true}` | 404; 409 run active |

## Runs — `routes/runs.ts`
| method | path | handler | status | body | errors |
| --- | --- | --- | --- | --- | --- |
| POST | /api/run | :7 | 202 | `{runId}` (body `{sessionId, prompt}`) | 404 no such session; 400 prompt required; 409 chat still running |
| GET | /api/runs/:runId/events?after=N | :11 | 200 | `{status: "running"|"done"|"error", events: [{seq, event}]}` | 404 no such run |

`event` is an `AgentEvent` (`adapters/contract.ts:4`): `text`, `tool_call`, `tool_result`, `error`, `done`.

## Personas — `routes/personas.ts`
| method | path | handler | status | body | errors |
| --- | --- | --- | --- | --- | --- |
| GET | /api/personas | :7 | 200 | `{personas: Persona[]}` | |
| POST | /api/personas | :8 | 201 | `Persona` (body `{name, systemPrompt}`) | 400 name / prompt required |
| PUT | /api/personas/:personaId | :12 | 200 | `Persona` | 400; 404 |
| DELETE | /api/personas/:personaId | :16 | 200 | `{ok:true}` | 400 built-in default or current default; 409 chats use it; 404 |
| POST | /api/personas/:personaId/default | :20 | 200 | `{ok:true}` | 404 |

## Bots — `routes/bots.ts`
| method | path | handler | status | body | errors |
| --- | --- | --- | --- | --- | --- |
| GET | /api/bots | :7 | 200 | `{bots: Bot[]}` | |
| POST | /api/bots | :8 | 201 | `Bot` (body `{name, persona, providerId, model?, thinking?}`) | 400 name rule / persona / provider / model / thinking; 409 name taken |
| PUT | /api/bots/:botId | :9 | 200 | `Bot` | same; 404 |
| DELETE | /api/bots/:botId | :10 | 200 | `{ok:true}` | 404 |

Name rule: starts with a letter, 2–24 letters, digits, `-` or `_`; unique, case-insensitive.

## Room — `routes/room.ts`
| method | path | handler | status | body | errors |
| --- | --- | --- | --- | --- | --- |
| GET | /api/room?after=N | :7 | 200 | `{messages: RoomMessage[], busy, speaking}` | |
| POST | /api/room/messages | :8 | 202 | the saved `RoomMessage` (body `{text}`) | 400 empty or over 4000 characters; 409 room busy |

`RoomMessage`: `{id, kind: "user"|"bot"|"system", botId, authorName, text, createdAt}`. Without `after`, the latest 100 are returned. With `after`, up to 200 newer ones.

## Repositories — `routes/repos.ts`
| method | path | handler | status | body | errors |
| --- | --- | --- | --- | --- | --- |
| GET | /api/repos | :7 | 200 | `{repos: RepoCard[]}` (Repo + `branch`, `copies: [{sessionId,title}]`) | |
| POST | /api/repos | :8 | 202 | `Repo` with `status: "cloning"` (body `{url}`) | 400 not a clone link / bad folder name; 409 name already here |
| POST | /api/repos/pull | :9 | 200 | `{results: [{id,name,ok,message}]}` | |
| DELETE | /api/repos/:repoId | :10 | 200 | `{ok:true}` | 404; 409 still cloning |
| POST | /api/repos/:repoId/copies | :14 | 201 | `{ok:true}` (body `{sessionId}`) | 404 repo or chat; 409 not ready or chat already has it; 500 clone failed |

## Memory — `routes/memory.ts`
| method | path | handler | status | body | errors |
| --- | --- | --- | --- | --- | --- |
| GET | /api/graph | :9 | 200 | `{nodes: [{id,title,missing,degree}], edges: [{source,target}]}` | |
| GET | /api/memory?q= | :10 | 200 | `{notes: NoteItem[]}` (all notes, or search results with `snippet`) | |
| POST | /api/memory | :11 | 200 | `{title, links, tags}` (body `{title, body}`) — note: 200, not 201 | 400 title required |
| GET | /api/memory/:title | :15 | 200 | `{title, body, links, backlinks, tags}` | 404 no such note |
| DELETE | /api/memory/:title | :20 | 200 | `{ok:true}` | 404 no such note |

## Providers — `routes/providers.ts`
| method | path | handler | status | body | errors |
| --- | --- | --- | --- | --- | --- |
| GET | /api/providers | :8 | 200 | `{providers: [{id,name,capabilities,models,targets,error?}]}`; each target has `auth` and `progress` | |
| POST | /api/providers/:providerId/targets/:targetId/sign-in | :10 | 202 | `{started:true}` (body `{method}`) | 404 unknown provider; 500 unknown target or method (adapters throw plain `Error`, so these are not 400) |
| POST | /api/providers/:providerId/targets/:targetId/answer | :10 | 200 | `{ok:true}` (body `{answer}`) | 404 |
| POST | /api/providers/:providerId/targets/:targetId/sign-out | :10 | 200 | `{ok:true}` | 404 |
| POST | /api/providers/:providerId/targets/:targetId/<other> | :10 | 404 | `{error:"not found"}` | |

## System — `routes/system.ts`
Both need `Content-Type: application/json`, or they return 415. A page on another site can't send that without a preflight, which this server doesn't answer.

| method | path | handler | status | body | notes |
| --- | --- | --- | --- | --- | --- |
| POST | /api/system/update | :17 | 200 | `{output}` (git's output, from `app/system.ts` `pullLatest`) | `git pull --ff-only` in the checkout. Non-fast-forward or git errors come back as `error`. |
| POST | /api/system/restart | :22 | 202 | `{restarting: true}` | The server exits about 300 ms later. A detached shell waits, runs `npm install` and `npm run build` (output to `MIP_HOME/restart.log`), then starts the server again. |

## Tool endpoint — `http/server.ts:11` and `http/mcp.ts:7`
| method | path | auth | body | notes |
| --- | --- | --- | --- | --- |
| POST | /mcp | `Authorization: Bearer <run token>` | JSON-RPC 2.0: `initialize`, `tools/list`, `tools/call`, notifications (no id → 202) | 401 without a live token. JSON-RPC errors are returned with HTTP 200. |

## Static
| method | path | notes |
| --- | --- | --- |
| GET | any path not starting with /api/ | file from `dist/frontend` (`/` → `index.html`). Missing → falls through to the router (404). |
