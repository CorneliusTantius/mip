import { useEffect, useRef, useState } from "preact/hooks";
import { ConfirmDialog } from "./ConfirmDialog";
import { OptionDropdown } from "./OptionDropdown";

export interface BotInfo {
  id: string;
  name: string;
  persona: string;
  providerId: string;
  model: string | null;
  thinking: string | null;
}

interface ProviderInfo {
  id: string;
  name: string;
  models: { id: string; name: string; thinkingLevels: string[] }[];
}

interface Draft {
  name: string;
  persona: string;
  providerId: string;
  model: string;
  thinking: string;
}

const JSON_HEADERS = { "Content-Type": "application/json" };
const EMPTY: Draft = { name: "", persona: "", providerId: "claude-cli", model: "", thinking: "" };

// Create, edit, and delete bots. A bot has a name to mention, a persona, and a provider with its model and thinking level.
export function BotsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  // The bot being edited, "new" for a new bot, or undefined for the list.
  const [editing, setEditing] = useState<BotInfo | "new">();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [deleting, setDeleting] = useState<BotInfo>();
  const [error, setError] = useState<string>();

  const load = () =>
    fetch("/api/bots")
      .then((res) => res.json())
      .then((data) => setBots(data.bots));

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    load();
    fetch("/api/providers")
      .then((res) => res.json())
      .then((data) => setProviders(data.providers));
    setEditing(undefined);
    return () => dialog.current?.close();
  }, [open]);

  function startEdit(bot?: BotInfo) {
    setError(undefined);
    setEditing(bot ?? "new");
    setDraft(bot ? { name: bot.name, persona: bot.persona, providerId: bot.providerId, model: bot.model ?? "", thinking: bot.thinking ?? "" } : EMPTY);
  }

  const provider = providers.find((p) => p.id === draft.providerId);
  const model = provider?.models.find((m) => m.id === draft.model);
  const levels = model?.thinkingLevels ?? [];

  async function save(e: Event) {
    e.preventDefault();
    setError(undefined);
    const isNew = editing === "new";
    const url = typeof editing === "object" ? `/api/bots/${editing.id}` : "/api/bots";
    const res = await fetch(url, { method: isNew ? "POST" : "PUT", headers: JSON_HEADERS, body: JSON.stringify(draft) });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setEditing(undefined);
    load();
  }

  async function remove() {
    if (!deleting) return;
    const res = await fetch(`/api/bots/${deleting.id}`, { method: "DELETE" });
    setDeleting(undefined);
    if (!res.ok) return setError((await res.json()).error);
    load();
  }

  return (
    <dialog ref={dialog} className="modal" onClose={onClose}>
      <div className="modal-box relative flex h-[min(36rem,80vh)] max-w-3xl flex-col">
        <form method="dialog">
          <button className="btn btn-sm btn-circle btn-ghost absolute right-3 top-3" aria-label="Close">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </form>
        <div className="mb-4 flex items-center gap-2 pr-10">
          <h2 className="mr-auto text-lg font-semibold">{editing === undefined ? "Bots" : editing === "new" ? "New bot" : `Edit ${editing.name}`}</h2>
          {editing === undefined && (
            <button className="btn btn-primary btn-sm" onClick={() => startEdit()}>
              + New bot
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {editing !== undefined ? (
            <form className="flex flex-col gap-3" onSubmit={save}>
              <fieldset className="fieldset">
                <legend className="fieldset-legend">Name</legend>
                <input
                  className="input w-full"
                  placeholder="For example: Thorin"
                  value={draft.name}
                  onInput={(e) => setDraft({ ...draft, name: e.currentTarget.value })}
                />
              </fieldset>
              <div className="flex flex-wrap gap-2">
                <OptionDropdown
                  label="Provider"
                  value={draft.providerId}
                  options={providers.map((p) => ({ value: p.id, label: p.name }))}
                  placeholder="Provider"
                  onChange={(providerId) => setDraft({ ...draft, providerId, model: "", thinking: "" })}
                />
                <OptionDropdown
                  label="Model"
                  value={draft.model}
                  options={(provider?.models ?? []).map((m) => ({ value: m.id, label: m.name }))}
                  placeholder="Default model"
                  disabled={!provider?.models.length}
                  onChange={(modelId) => setDraft({ ...draft, model: modelId, thinking: "" })}
                />
                <OptionDropdown
                  label="Thinking"
                  value={draft.thinking}
                  options={[{ value: "", label: "Default thinking" }, ...levels.map((level) => ({ value: level, label: level }))]}
                  placeholder="Default thinking"
                  disabled={levels.length === 0}
                  onChange={(thinking) => setDraft({ ...draft, thinking })}
                />
              </div>
              <fieldset className="fieldset">
                <legend className="fieldset-legend">Persona</legend>
                <textarea
                  className="textarea h-40 w-full"
                  placeholder="Who this bot is and what it cares about in the room."
                  value={draft.persona}
                  onInput={(e) => setDraft({ ...draft, persona: e.currentTarget.value })}
                />
              </fieldset>
              {error && (
                <div role="alert" className="alert alert-error">
                  <span>{error}</span>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(undefined)}>
                  Cancel
                </button>
                <button className="btn btn-primary" disabled={!draft.name.trim() || !draft.persona.trim()}>
                  {editing === "new" ? "Create" : "Save"}
                </button>
              </div>
            </form>
          ) : (
            <>
              {error && (
                <div role="alert" className="alert alert-error mb-3">
                  <span>{error}</span>
                </div>
              )}
              <ul className="flex flex-col gap-2">
                {bots.length === 0 && <li className="py-6 text-center text-sm opacity-60">No bots yet.</li>}
                {bots.map((bot) => (
                  <li key={bot.id} className="flex items-center gap-2 rounded-box border border-base-300 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{bot.name}</div>
                      <div className="truncate text-xs opacity-60">{bot.persona}</div>
                    </div>
                    <span className="badge badge-sm badge-outline">{providers.find((p) => p.id === bot.providerId)?.name ?? bot.providerId}</span>
                    <button className="btn btn-ghost btn-xs" onClick={() => startEdit(bot)}>
                      Edit
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => setDeleting(bot)}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>

      <ConfirmDialog
        open={!!deleting}
        title="Delete this bot?"
        message={`"${deleting?.name ?? ""}" is removed. Its messages stay in the room.`}
        onConfirm={remove}
        onCancel={() => setDeleting(undefined)}
      />
    </dialog>
  );
}
