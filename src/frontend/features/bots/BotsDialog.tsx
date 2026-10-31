import { useEffect, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { Bot, ProviderInfo } from "../../api/types";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { Modal } from "../../ui/Modal";
import { BotEditor } from "./BotEditor";

// Manage the bots: list them, then create, edit, or delete one.
export function BotsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [bots, setBots] = useState<Bot[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  // The bot being edited, "new" for a new bot, or undefined for the list.
  const [editing, setEditing] = useState<Bot | "new">();
  const [deleting, setDeleting] = useState<Bot>();
  const [error, setError] = useState<string>();

  const load = () => api.get<{ bots: Bot[] }>("/api/bots").then((data) => setBots(data.bots));

  // Each time the dialog opens, show the list with fresh bots and providers.
  useEffect(() => {
    if (!open) return;
    load();
    api.get<{ providers: ProviderInfo[] }>("/api/providers").then((data) => setProviders(data.providers));
    setEditing(undefined);
  }, [open]);

  function startEdit(bot?: Bot) {
    setError(undefined);
    setEditing(bot ?? "new");
  }

  async function remove() {
    const bot = deleting;
    if (!bot) return;
    setDeleting(undefined);
    try {
      await api.del(`/api/bots/${bot.id}`);
    } catch (err) {
      return setError(errorText(err));
    }
    load();
  }

  const providerName = (id: string) => providers.find((p) => p.id === id)?.name ?? id;

  return (
    <>
      <Modal open={open} onClose={onClose} closeButton boxClassName="flex h-[min(36rem,80vh)] max-w-3xl flex-col">
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
            <BotEditor
              key={editing === "new" ? "new" : editing.id}
              bot={editing === "new" ? undefined : editing}
              providers={providers}
              onCancel={() => setEditing(undefined)}
              onSaved={() => {
                setEditing(undefined);
                load();
              }}
            />
          ) : (
            <>
              <ErrorAlert message={error} className="mb-3" />
              <ul className="flex flex-col gap-2">
                {bots.length === 0 && <li className="py-6 text-center text-sm opacity-60">No bots yet.</li>}
                {bots.map((bot) => (
                  <li key={bot.id} className="flex items-center gap-2 rounded-box border border-base-300 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{bot.name}</div>
                      <div className="truncate text-xs opacity-60">{bot.persona}</div>
                    </div>
                    <span className="badge badge-sm badge-outline">{providerName(bot.providerId)}</span>
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
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title="Delete this bot?"
        message={`"${deleting?.name ?? ""}" is removed. Its messages stay in the room.`}
        onConfirm={remove}
        onCancel={() => setDeleting(undefined)}
      />
    </>
  );
}
