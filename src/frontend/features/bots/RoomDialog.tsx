import { useEffect, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { Bot, Room } from "../../api/types";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { Modal } from "../../ui/Modal";

// Makes a room, or edits one: its name, and which bots are in it. A room can also be deleted, with its messages.
// onClose says whether anything was saved, so the caller reloads the rooms.
export function RoomDialog({ open, room, bots, onClose }: { open: boolean; room?: Room; bots: Bot[]; onClose: (changed: boolean) => void }) {
  const [name, setName] = useState("");
  const [botIds, setBotIds] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [deleting, setDeleting] = useState(false);

  // Each time the dialog opens, it shows the room's current name and bots, or an empty new room.
  useEffect(() => {
    if (!open) return;
    setName(room?.name ?? "");
    setBotIds(room?.botIds ?? []);
    setError(undefined);
  }, [open, room?.id]);

  function toggle(botId: string) {
    setBotIds((ids) => (ids.includes(botId) ? ids.filter((id) => id !== botId) : [...ids, botId]));
  }

  async function save(e: Event) {
    e.preventDefault();
    setError(undefined);
    try {
      if (room) await api.put(`/api/rooms/${room.id}`, { name, botIds });
      else await api.post("/api/rooms", { name, botIds });
    } catch (err) {
      return setError(errorText(err));
    }
    onClose(true);
  }

  async function remove() {
    setDeleting(false);
    if (!room) return;
    try {
      await api.del(`/api/rooms/${room.id}`);
    } catch (err) {
      return setError(errorText(err));
    }
    onClose(true);
  }

  return (
    <>
      <Modal open={open} onClose={() => onClose(false)} glow="violet">
        <form className="flex flex-col gap-3" onSubmit={save}>
          <h3 className="text-lg font-semibold">{room ? "Room settings" : "New room"}</h3>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Name</legend>
            <input className="input w-full" placeholder="For example: Lounge" value={name} onInput={(e) => setName(e.currentTarget.value)} />
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend">Bots in this room</legend>
            {bots.length === 0 ? (
              <p className="text-sm opacity-70">No bots yet. Create one with Manage bots.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {bots.map((bot) => (
                  <label key={bot.id} className="label cursor-pointer gap-3 text-base-content">
                    <input type="checkbox" className="checkbox checkbox-sm" checked={botIds.includes(bot.id)} onChange={() => toggle(bot.id)} />
                    <span className={`bot-dot size-2 bot-${bot.color}`} />
                    {bot.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <ErrorAlert message={error} />

          <div className="flex items-center justify-between gap-2">
            {room ? (
              <button type="button" className="btn btn-ghost text-error" onClick={() => setDeleting(true)}>
                Delete room
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => onClose(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={!name.trim()}>
                {room ? "Save" : "Create"}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting}
        title="Delete room"
        message={`Delete ${room?.name ?? "this room"}? Its messages are deleted too. Bots stay as they are.`}
        error={error}
        glow="violet"
        onConfirm={remove}
        onCancel={() => setDeleting(false)}
      />
    </>
  );
}
