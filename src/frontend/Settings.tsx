import { useEffect, useRef, useState } from "preact/hooks";

// Shape of GET /api/providers.
interface Target {
  id: string;
  name: string;
  methods: string[];
  auth: { loggedIn: boolean; method?: string };
  progress: { running: boolean; output: string[]; error?: string; prompt?: { message: string; placeholder?: string; type?: string } };
}
interface Provider {
  id: string;
  name: string;
  capabilities: Record<string, boolean>;
  targets: Target[];
  error?: string;
}
interface Persona {
  id: string;
  name: string;
  systemPrompt: string;
  isDefault: boolean;
}

const CAPABILITIES: Record<string, string> = { streaming: "Streaming", tools: "Tools", mcp: "MCP", sessions: "Sessions", signIn: "Sign-in" };
const METHODS: Record<string, string> = { subscription: "Sign in with subscription", api_key: "Use API key", cli: "Sign in" };
const JSON_HEADERS = { "Content-Type": "application/json" };
const DEFAULT_PERSONA_ID = "default";

// Calls a sign-in endpoint for one target. The provider tab polls, so the screen updates on its own.
function act(provider: Provider, target: Target, action: string, body = {}) {
  return fetch(`/api/providers/${provider.id}/targets/${target.id}/${action}`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
}

function signOut(provider: Provider, target: Target) {
  if (confirm(`Sign out of ${target.name}?`)) act(provider, target, "sign-out");
}

export function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<"provider" | "config">("provider");

  // The native dialog handles Escape and focus.
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, [open]);

  return (
    <dialog ref={dialog} className="modal" onClose={onClose}>
      <div className="modal-box relative max-w-4xl">
        <form method="dialog">
          <button className="btn btn-sm btn-circle btn-ghost absolute right-3 top-3" aria-label="Close">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </form>
        <h2 className="mb-4 text-lg font-semibold">Settings</h2>
        <div className="flex gap-4">
          <ul className="menu w-36 shrink-0 gap-1 border-r border-base-300 p-0 pr-3">
            <li>
              <button className={tab === "provider" ? "menu-active" : ""} onClick={() => setTab("provider")}>Provider</button>
            </li>
            <li>
              <button className={tab === "config" ? "menu-active" : ""} onClick={() => setTab("config")}>Config</button>
            </li>
          </ul>
          <div className="min-w-0 flex-1">{tab === "provider" ? <ProviderTab open={open} /> : <ConfigTab />}</div>
        </div>
      </div>

      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
}

function ProviderTab({ open }: { open: boolean }) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerId, setProviderId] = useState("");
  const [targetId, setTargetId] = useState("");

  const refresh = () => fetch("/api/providers").then((res) => res.json()).then((data) => setProviders(data.providers));

  // Poll while the dialog is open so sign-in progress and prompts stay current.
  useEffect(() => {
    if (!open) return;
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [open]);

  const provider = providers.find((p) => p.id === providerId) ?? providers[0];
  const target = provider?.targets.find((t) => t.id === targetId) ?? provider?.targets[0];
  const connected = providers.flatMap((p) => p.targets.filter((t) => t.auth.loggedIn).map((t) => ({ provider: p, target: t })));

  return (
    <>
      {provider && (
        <>
          <fieldset className="fieldset">
            <legend className="fieldset-legend">Provider</legend>
            <select className="select w-full" value={provider.id} onChange={(e) => (setProviderId(e.currentTarget.value), setTargetId(""))}>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </fieldset>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(provider.capabilities).filter(([, on]) => on).map(([key]) => (
              <span key={key} className="badge badge-outline">{CAPABILITIES[key] ?? key}</span>
            ))}
          </div>

          {provider.error && <div role="alert" className="alert alert-error mt-4"><span>{provider.error}</span></div>}

          {target && (
            <>
              <div className="mt-4 flex items-end gap-2">
                <fieldset className="fieldset min-w-0 flex-1">
                  <legend className="fieldset-legend">Service</legend>
                  <select className="select w-full" value={target.id} onChange={(e) => setTargetId(e.currentTarget.value)}>
                    {provider.targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </fieldset>
                <TargetButtons provider={provider} target={target} />
              </div>
              <TargetProgress key={provider.id + target.id} provider={provider} target={target} />
            </>
          )}
        </>
      )}

      <div className="divider">Connected</div>
      {connected.length === 0 && <p className="text-sm opacity-60">Nothing connected yet.</p>}
      <ul className="list">
        {connected.map(({ provider: p, target: t }) => (
          <li key={p.id + t.id} className="list-row items-center">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{t.name}</div>
              <div className="text-xs opacity-70">{p.name}{t.auth.method ? " · " + t.auth.method : ""}</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => signOut(p, t)}>Sign out</button>
          </li>
        ))}
      </ul>
    </>
  );
}

// Status and the sign-in buttons for the selected service. Sits next to the Service select.
function TargetButtons({ provider, target }: { provider: Provider; target: Target }) {
  const { auth, progress } = target;
  const status = auth.loggedIn ? "Signed in" + (auth.method ? " · " + auth.method : "") : "Not signed in";

  return (
    <div className="flex shrink-0 items-center gap-2 pb-0.5">
      <span className={"badge " + (auth.loggedIn ? "badge-success" : "badge-ghost")}>{status}</span>
      {auth.loggedIn ? (
        <button className="btn btn-sm" disabled={progress.running} onClick={() => signOut(provider, target)}>
          Sign out
        </button>
      ) : (
        target.methods.map((method) => (
          <button key={method} className="btn btn-primary btn-sm" disabled={progress.running} onClick={() => act(provider, target, "sign-in", { method })}>
            {METHODS[method] ?? method}
          </button>
        ))
      )}
    </div>
  );
}

// Output, errors, and the answer box while a sign-in is running.
function TargetProgress({ provider, target }: { provider: Provider; target: Target }) {
  const { progress } = target;
  const [answer, setAnswer] = useState("");
  // Preact's input types can't take "text" or "password" from one expression, so widen the type.
  const inputType = (progress.prompt?.type === "secret" ? "password" : "text") as "text";

  if (!progress.running && progress.output.length === 0 && !progress.error) return null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      {progress.output.length > 0 && (
        <div className="mockup-code text-sm">
          <pre><code>{progress.output.join("\n")}</code></pre>
        </div>
      )}
      {progress.error && <div role="alert" className="alert alert-error"><span>{progress.error}</span></div>}

      {progress.running && (
        <form
          className="flex flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await act(provider, target, "answer", { answer });
            setAnswer("");
          }}
        >
          {progress.prompt && <p className="text-sm">{progress.prompt.message}</p>}
          <div className="join w-full">
            <input
              className="input join-item w-full"
              type={inputType}
              placeholder={progress.prompt?.placeholder ?? "Paste code or answer"}
              value={answer}
              onInput={(e) => setAnswer(e.currentTarget.value)}
            />
            <button className="btn btn-primary join-item">Send</button>
          </div>
        </form>
      )}
    </div>
  );
}

// Personas: pick one from the dropdown to inspect or edit it. The last option adds a new one.
const ADD_NEW = "add-new";

function ConfigTab() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selected, setSelected] = useState(ADD_NEW);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string>();
  const isNew = selected === ADD_NEW;
  const current = personas.find((p) => p.id === selected);

  const load = () =>
    fetch("/api/personas")
      .then((res) => res.json())
      .then((data) => {
        setPersonas(data.personas);
        return data.personas as Persona[];
      });

  function pick(id: string, list = personas) {
    const persona = list.find((p) => p.id === id);
    setSelected(id);
    setName(persona?.name ?? "");
    setPrompt(persona?.systemPrompt ?? "");
    setError(undefined);
  }

  // Show the first persona on load.
  useEffect(() => {
    load().then((list) => pick(list[0]?.id ?? ADD_NEW, list));
  }, []);

  // Chats list the personas too, so tell them when one changes.
  const announce = () => window.dispatchEvent(new Event("personas-changed"));

  async function save() {
    const res = await fetch(isNew ? "/api/personas" : `/api/personas/${selected}`, {
      method: isNew ? "POST" : "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name, systemPrompt: prompt }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    await load();
    pick(data.id);
    announce();
  }

  async function makeDefault() {
    await fetch(`/api/personas/${selected}/default`, { method: "POST" });
    await load();
    announce();
  }

  async function remove() {
    if (!confirm(`Delete the persona "${name}"?`)) return;
    const res = await fetch(`/api/personas/${selected}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    await load().then((list) => pick(list[0]?.id ?? ADD_NEW, list));
    announce();
  }

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="fieldset">
        <legend className="fieldset-legend">Persona</legend>
        <select className="select w-full" value={selected} onChange={(e) => pick(e.currentTarget.value)}>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.isDefault ? " (default)" : ""}
            </option>
          ))}
          <option value={ADD_NEW}>+ Add new persona</option>
        </select>
      </fieldset>

      <fieldset className="fieldset">
        <legend className="fieldset-legend">Name</legend>
        <input className="input w-full" placeholder="For example: Code reviewer" value={name} onInput={(e) => setName(e.currentTarget.value)} />
      </fieldset>
      <fieldset className="fieldset">
        <legend className="fieldset-legend">System prompt</legend>
        <textarea className="textarea h-56 w-full font-mono text-sm" value={prompt} onInput={(e) => setPrompt(e.currentTarget.value)} />
      </fieldset>
      {error && <div role="alert" className="alert alert-error"><span>{error}</span></div>}
      <p className="text-sm opacity-70">A chat keeps the persona it was started with. Changes apply to its next message.</p>
      <div className="flex justify-end gap-2">
        {current?.isDefault && <span className="badge badge-success mr-auto">Default for new chats</span>}
        {!isNew && !current?.isDefault && (
          <button className="btn btn-ghost" onClick={makeDefault}>
            Set as default
          </button>
        )}
        {!isNew && !current?.isDefault && selected !== DEFAULT_PERSONA_ID && (
          <button className="btn btn-ghost" onClick={remove}>
            Delete
          </button>
        )}
        <button className="btn btn-primary" disabled={!name.trim() || !prompt.trim()} onClick={save}>
          {isNew ? "Create" : "Save"}
        </button>
      </div>
    </div>
  );
}
