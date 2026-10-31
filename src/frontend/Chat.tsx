import { useEffect, useRef, useState } from "preact/hooks";
import { ConfirmDialog } from "./ConfirmDialog";
import { OptionDropdown } from "./OptionDropdown";

// A model the provider lists. An empty id is the provider's default model.
interface ModelOption {
  id: string;
  name: string;
  thinkingLevels: string[];
}

interface ProviderOption {
  id: string;
  name: string;
  models: ModelOption[];
}

interface PersonaOption {
  id: string;
  name: string;
  isDefault: boolean;
}

interface SessionInfo {
  id: string;
  providerId: string;
  personaId: string;
  model: string | null;
  thinking: string | null;
  title: string;
}

const THINKING_LABELS: Record<string, string> = {
  off: "Thinking off",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

interface Message {
  role: "user" | "assistant";
  text: string;
  tools: string[];
  error?: string | null;
}

// One event of a run, as the server saves it. Events the chat doesn't show are ignored.
type RunEvent = { type: "text"; text: string } | { type: "tool_call"; name: string } | { type: "error"; message: string } | { type: "done" } | { type: string };

const JSON_HEADERS = { "Content-Type": "application/json" };
const DEFAULT_PERSONA_ID = "default";

function Icon({ d }: { d: string }) {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// The session list is a card over the chat on a phone, and a column beside the chat on a desktop. It stays mounted,
// so opening and closing both animate: it slides and fades on a phone, and folds its width on a desktop.
const BACKDROP = "absolute inset-0 z-10 cursor-default bg-black/40 transition-[opacity,visibility] duration-300 md:hidden";
const BACKDROP_OPEN = "visible opacity-100";
const BACKDROP_CLOSED = "invisible pointer-events-none opacity-0";
const SESSIONS =
  "absolute inset-y-3 left-3 z-20 flex w-72 max-w-[calc(100%-1.5rem)] flex-col gap-2 overflow-y-auto rounded-box border border-base-300 bg-base-200 p-4 shadow-2xl transition-[translate,opacity,visibility,width,margin,padding,border-color] duration-300 ease-out md:static md:inset-auto md:z-auto md:max-w-none md:shrink-0 md:rounded-none md:bg-transparent md:shadow-none";
const SESSIONS_OPEN = "translate-x-0 opacity-100 visible md:mr-4 md:w-56 md:border-0 md:border-r md:border-base-300 md:p-0 md:pr-4";
const SESSIONS_CLOSED = "-translate-x-[120%] opacity-0 invisible md:translate-x-0 md:mr-0 md:w-0 md:overflow-hidden md:border-0 md:p-0 md:opacity-0 md:invisible";

export function Chat() {
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [currentId, setCurrentId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newProviderId, setNewProviderId] = useState("claude-cli");
  const [newPersonaId, setNewPersonaId] = useState(DEFAULT_PERSONA_ID);
  // The session list takes room, so it starts closed on phones.
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  const [renamingId, setRenamingId] = useState<string | undefined>(undefined);
  const [titleDraft, setTitleDraft] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SessionInfo>();
  const [deleteError, setDeleteError] = useState<string>();
  // The run this chat is following. Set to undefined when the user moves to another chat.
  const following = useRef<string | undefined>(undefined);
  const log = useRef<HTMLDivElement>(null);

  const current = sessions.find((s) => s.id === currentId);
  const currentProvider = providers.find((p) => p.id === current?.providerId);
  const currentModel = currentProvider?.models.find((m) => m.id === (current?.model ?? ""));
  const providerName = (id: string) => providers.find((p) => p.id === id)?.name ?? id;
  const personaName = (id: string) => personas.find((p) => p.id === id)?.name ?? id;

  const loadSessions = () =>
    fetch("/api/sessions")
      .then((res) => res.json())
      .then((data) => {
        setSessions(data.sessions);
        // The repositories card keeps its list of chats in step.
        window.dispatchEvent(new Event("sessions-changed"));
      });

  const loadPersonas = () =>
    fetch("/api/personas")
      .then((res) => res.json())
      .then((data) => {
        setPersonas(data.personas);
        // New chats start with the default persona.
        setNewPersonaId(data.personas.find((p: PersonaOption) => p.isDefault)?.id ?? DEFAULT_PERSONA_ID);
      });

  // Opens a chat: its saved messages, and the run still going in it, if there is one.
  async function openSession(id: string) {
    // On a phone the session list is an overlay, so it closes once a chat is picked.
    if (!window.matchMedia("(min-width: 768px)").matches) setSidebarOpen(false);
    following.current = undefined;
    setBusy(false);
    setCurrentId(id);
    const data = await fetch(`/api/sessions/${id}`).then((res) => res.json());
    setMessages(data.messages);
    if (data.activeRunId) follow(data.activeRunId, id);
  }

  // Changes the last message, which is the assistant reply that is coming in.
  const updateReply = (change: (reply: Message) => Message) =>
    setMessages((list) => [...list.slice(0, -1), change(list[list.length - 1])]);

  function handle(event: RunEvent) {
    if (event.type === "text") updateReply((r) => ({ ...r, text: r.text + (event as { text: string }).text }));
    if (event.type === "tool_call") updateReply((r) => ({ ...r, tools: [...r.tools, (event as { name: string }).name] }));
    if (event.type === "error") updateReply((r) => ({ ...r, error: (event as { message: string }).message }));
  }

  // Follows a run by asking the server for the events it has not shown yet. A run keeps going if this page closes,
  // so reopening the chat picks up from the start of the run.
  function follow(runId: string, sessionId: string) {
    following.current = runId;
    setBusy(true);
    setMessages((list) => [...list, { role: "assistant", text: "", tools: [] }]);

    (async () => {
      let after = 0;
      for (;;) {
        const data = await fetch(`/api/runs/${runId}/events?after=${after}`).then((res) => res.json());
        if (following.current !== runId) return;
        for (const { seq, event } of data.events) {
          after = seq;
          handle(event);
        }
        if (data.status !== "running") break;
        await new Promise((resolve) => setTimeout(resolve, 600));
        if (following.current !== runId) return;
      }
      following.current = undefined;
      setBusy(false);
      // The run is saved now, so show the stored messages instead of the streamed ones.
      await openSession(sessionId);
      loadSessions();
    })().catch((err: unknown) => {
      following.current = undefined;
      setBusy(false);
      updateReply((r) => ({ ...r, error: err instanceof Error ? err.message : String(err) }));
    });
  }

  useEffect(() => {
    fetch("/api/providers")
      .then((res) => res.json())
      .then((data) => setProviders(data.providers));
    loadSessions();
    loadPersonas();
    // Settings fires this after a persona is saved or deleted.
    window.addEventListener("personas-changed", loadPersonas);
    return () => window.removeEventListener("personas-changed", loadPersonas);
  }, []);

  // Open the newest chat on first load.
  useEffect(() => {
    if (!currentId && sessions[0]) openSession(sessions[0].id);
  }, [sessions]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages]);

  function startRename(session: SessionInfo) {
    setTitleDraft(session.title);
    setRenamingId(session.id);
  }

  async function rename(id: string) {
    const title = titleDraft.trim();
    setRenamingId(undefined);
    if (!title) return;
    await fetch(`/api/sessions/${id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ title }) });
    loadSessions();
  }

  function askRemove(session: SessionInfo) {
    setDeleteError(undefined);
    setPendingDelete(session);
  }

  async function remove() {
    const session = pendingDelete;
    if (!session) return;
    try {
      const res = await fetch(`/api/sessions/${session.id}`, { method: "DELETE" });
      if (!res.ok) return setDeleteError((await res.json()).error);
    } catch (err) {
      return setDeleteError(err instanceof Error ? err.message : String(err));
    }
    setPendingDelete(undefined);
    if (session.id === currentId) {
      following.current = undefined;
      setCurrentId(undefined);
      setMessages([]);
      setBusy(false);
    }
    loadSessions();
  }

  // Saves the model or thinking level on this chat. It applies to the next message.
  async function changeSettings(changes: { model?: string; thinking?: string }) {
    if (!currentId) return;
    await fetch(`/api/sessions/${currentId}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(changes) });
    loadSessions();
  }

  async function createSession() {
    const session = await fetch("/api/sessions", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ providerId: newProviderId, personaId: newPersonaId }),
    }).then((res) => res.json());
    await loadSessions();
    openSession(session.id);
  }

  async function send(e: Event) {
    e.preventDefault();
    const prompt = draft.trim();
    if (!prompt || busy || !currentId) return;

    setDraft("");
    try {
      const res = await fetch("/api/run", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ sessionId: currentId, prompt }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessages((list) => [...list, { role: "user", text: prompt, tools: [] }]);
      follow(data.runId, currentId);
    } catch (err) {
      setMessages((list) => [...list, { role: "assistant", text: "", tools: [], error: err instanceof Error ? err.message : String(err) }]);
    }
  }

  return (
    <section className="card card-border flex h-[min(44rem,80vh)] shrink-0 bg-base-200/80">
      <div className="card-body min-h-0 flex-1 gap-3 p-4">
        <div className="flex min-h-0 flex-1">
          {/* On a phone the list is a card over the chat, so the chat keeps its full width. Tapping outside closes it. */}
          <button
            className={`${BACKDROP} ${sidebarOpen ? BACKDROP_OPEN : BACKDROP_CLOSED}`}
            aria-label="Close sessions"
            tabIndex={sidebarOpen ? 0 : -1}
            onClick={() => setSidebarOpen(false)}
          />
          <aside className={`${SESSIONS} ${sidebarOpen ? SESSIONS_OPEN : SESSIONS_CLOSED}`}>
            <select className="select select-sm w-full" value={newProviderId} onChange={(e) => setNewProviderId(e.currentTarget.value)}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select className="select select-sm w-full" value={newPersonaId} onChange={(e) => setNewPersonaId(e.currentTarget.value)}>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button className="btn btn-primary btn-sm" disabled={providers.length === 0} onClick={createSession}>
              + New session
            </button>
            <ul className="flex flex-col gap-1">
              {sessions.map((s) =>
                renamingId === s.id ? (
                  <li key={s.id}>
                    <input
                      className="input input-sm w-full"
                      autoFocus
                      value={titleDraft}
                      onInput={(e) => setTitleDraft(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") rename(s.id);
                        if (e.key === "Escape") setRenamingId(undefined);
                      }}
                      onBlur={() => setRenamingId(undefined)}
                    />
                  </li>
                ) : (
                  <li key={s.id} className="flex items-center">
                    <button className={"btn btn-ghost btn-sm min-w-0 flex-1 justify-start truncate font-normal " + (s.id === currentId ? "btn-active" : "")} onClick={() => openSession(s.id)}>
                      {s.title || "New session"}
                    </button>
                    <button className="btn btn-ghost btn-xs btn-square" aria-label="Rename" onClick={() => startRename(s)}>
                      <Icon d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </button>
                    <button className="btn btn-ghost btn-xs btn-square" aria-label="Delete" onClick={() => askRemove(s)}>
                      <Icon d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                    </button>
                  </li>
                ),
              )}
            </ul>
            </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <div className="flex items-center gap-2">
              <button className="btn btn-ghost btn-sm btn-square" aria-label="Toggle sessions" onClick={() => setSidebarOpen(!sidebarOpen)}>
                <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h2 className="card-title mr-auto truncate text-base">{current?.title || "Chat"}</h2>
              {current && (
                <>
                  <span className="badge badge-outline">{personaName(current.personaId)}</span>
                  <span className="badge badge-outline">{providerName(current.providerId)}</span>
                </>
              )}
            </div>

            <div key={currentId} ref={log} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
              {messages.length === 0 && (
                <p className="m-auto text-sm opacity-60">{currentId ? "Ask something to start." : "Create a session to start."}</p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={"chat " + (m.role === "user" ? "chat-end" : "chat-start")}>
                  <div className={"chat-bubble whitespace-pre-wrap " + (m.error ? "chat-bubble-error" : m.role === "user" ? "chat-bubble-primary" : "")}>
                    {m.tools.map((tool, n) => (
                      <span key={n} className="badge badge-sm badge-outline mr-1">
                        {tool}
                      </span>
                    ))}
                    {m.text || m.error || (busy && i === messages.length - 1 ? <span className="loading loading-dots loading-sm" /> : null)}
                    {m.error && m.text && <p className="mt-1 text-sm">{m.error}</p>}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap gap-2">
                <OptionDropdown
                  label="Model"
                  value={current?.model ?? ""}
                  options={(currentProvider?.models ?? []).map((model) => ({ value: model.id, label: model.name }))}
                  placeholder={current ? "No models available" : "Model"}
                  disabled={!current || !currentProvider?.models.length}
                  onChange={(model) => changeSettings({ model })}
                />
                <OptionDropdown
                  label="Thinking"
                  value={current?.thinking ?? ""}
                  options={[
                    { value: "", label: "Default thinking" },
                    ...(currentModel?.thinkingLevels ?? []).map((level) => ({ value: level, label: THINKING_LABELS[level] ?? level })),
                  ]}
                  placeholder="Default thinking"
                  disabled={!current || !currentModel?.thinkingLevels.length}
                  onChange={(thinking) => changeSettings({ thinking })}
                />
              </div>

              <form className="join w-full" onSubmit={send}>
                <input
                  className="input join-item w-full"
                  placeholder={currentId ? (busy ? "This agent is still working" : "Message mip") : "Create a session first"}
                  value={draft}
                  disabled={busy || !currentId}
                  onInput={(e) => setDraft(e.currentTarget.value)}
                />
                <button className="btn btn-primary join-item" disabled={busy || !currentId || !draft.trim()}>
                  Send
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this chat?"
        message={`"${pendingDelete?.title || "New session"}" and its messages are removed from mip.`}
        error={deleteError}
        onConfirm={remove}
        onCancel={() => setPendingDelete(undefined)}
      />
    </section>
  );
}
