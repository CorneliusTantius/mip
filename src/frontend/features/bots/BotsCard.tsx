import { useState } from "preact/hooks";
import type { Bot, Room } from "../../api/types";
import { Card, ExpandButton } from "../../ui/Card";
import { BotProfileModal } from "./BotProfileModal";
import { BotsDialog } from "./BotsDialog";
import { MentionInput } from "./MentionInput";
import { RoomDialog } from "./RoomDialog";
import { RoomMembers } from "./RoomMembers";
import { RoomTranscript } from "./RoomTranscript";
import { useRoom } from "./useRoom";
import { useRooms } from "./useRooms";

// The bots' rooms. Each room has its own bots and messages, and a bot answers only in the rooms it is in. Mention a bot with @Name to get its reply first.
export function BotsCard() {
  const rooms = useRooms();
  const active = rooms.active;
  const room = useRoom(active?.id);
  const [draft, setDraft] = useState("");
  const [managing, setManaging] = useState(false);
  // The bot whose profile is open, and the bot the bots dialog opens on when the profile asks to edit it.
  const [profile, setProfile] = useState<Bot>();
  const [editTarget, setEditTarget] = useState<Bot>();
  // The room dialog: closed when undefined, "new" for a new room, or the room whose settings are open.
  const [roomDialog, setRoomDialog] = useState<Room | "new">();

  const members = rooms.bots.filter((bot) => active?.botIds.includes(bot.id));

  async function send(e: Event) {
    e.preventDefault();
    if (await room.send(draft.trim())) setDraft("");
  }

  return (
    <Card glow="violet" className="flex h-full shrink-0">
      <div className="card-body min-h-0 flex-1 gap-3 p-4">
        <div className="flex items-center gap-2">
          <h2 className="card-title mr-auto">Bots</h2>
          <button className="btn btn-sm" onClick={() => setManaging(true)}>
            Manage bots
          </button>
          <ExpandButton />
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {rooms.rooms.map((r) => (
            <button key={r.id} className={`btn btn-xs ${r.id === active?.id ? "btn-active" : "btn-ghost"}`} onClick={() => rooms.setActiveId(r.id)}>
              {r.name}
            </button>
          ))}
          <button className="btn btn-xs btn-ghost" onClick={() => setRoomDialog("new")}>
            + New room
          </button>
        </div>

        {active && (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="flex-none text-xs opacity-70">In {active.name}:</span>
            <RoomMembers bots={members} />
            <button className="btn btn-xs btn-ghost flex-none" onClick={() => setRoomDialog(active)}>
              Room settings
            </button>
          </div>
        )}

        <RoomTranscript
          messages={room.messages}
          bots={rooms.bots}
          masterBotId={active?.masterBotId}
          collapseOthers={active?.collapseOthers}
          onOpenBot={setProfile}
          emptyText={
            !active
              ? "No room yet. Make one with + New room."
              : members.length
                ? "Say something to start. Mention a bot with @Name."
                : "No bots in this room yet. Add some with Room settings."
          }
        />

        {/* A fixed-height line, so showing or hiding the status never moves the transcript. */}
        <p role="status" className="flex h-5 flex-none items-center gap-2 text-xs">
          {room.error ? (
            <span className="truncate text-error">{room.error}</span>
          ) : (
            room.busy && (
              <>
                <span className="loading loading-dots loading-xs opacity-70" />
                <span className="opacity-70">{room.speaking ? `${room.speaking} is writing` : "The bots are talking"}</span>
              </>
            )
          )}
        </p>

        <form className="join relative w-full" onSubmit={send}>
          <MentionInput
            value={draft}
            onInput={setDraft}
            bots={members}
            disabled={room.busy || !active || members.length === 0}
            placeholder={members.length ? "Message the room. @Name asks a bot first." : "Add a bot to this room first"}
          />
          <button className="btn btn-primary join-item" disabled={room.busy || !active || members.length === 0 || !draft.trim()}>
            Send
          </button>
        </form>
      </div>

      <BotProfileModal
        bot={profile}
        onClose={() => setProfile(undefined)}
        onEdit={(bot) => {
          setProfile(undefined);
          setEditTarget(bot);
          setManaging(true);
        }}
      />

      <BotsDialog
        open={managing}
        startWith={editTarget}
        onClose={() => {
          setManaging(false);
          setEditTarget(undefined);
          rooms.reload();
        }}
      />

      <RoomDialog
        open={roomDialog !== undefined}
        room={roomDialog === "new" ? undefined : roomDialog}
        bots={rooms.bots}
        onClose={(changed) => {
          setRoomDialog(undefined);
          if (changed) rooms.reload();
        }}
      />
    </Card>
  );
}
