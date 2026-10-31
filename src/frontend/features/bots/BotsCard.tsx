import { useState } from "preact/hooks";
import { Card, ExpandButton } from "../../ui/Card";
import { BotsDialog } from "./BotsDialog";
import { MentionInput } from "./MentionInput";
import { RoomTranscript } from "./RoomTranscript";
import { useRoom } from "./useRoom";

// The bots' shared room. Mention a bot with @Name to get its reply first. Bots can mention each other.
export function BotsCard() {
  const room = useRoom();
  const [draft, setDraft] = useState("");
  const [managing, setManaging] = useState(false);

  async function send(e: Event) {
    e.preventDefault();
    if (await room.send(draft.trim())) setDraft("");
  }

  return (
    <Card glow="violet" className="flex h-full shrink-0">
      <div className="card-body min-h-0 flex-1 gap-3 p-4">
        <div className="flex items-center gap-2">
          <h2 className="card-title mr-auto">Bots</h2>
          <div className="flex min-w-0 flex-wrap justify-end gap-1.5">
            {room.bots.map((bot) => (
              <span key={bot.id} className="badge badge-outline">
                {bot.name}
              </span>
            ))}
          </div>
          <button className="btn btn-sm" onClick={() => setManaging(true)}>
            Manage bots
          </button>
          <ExpandButton />
        </div>

        <RoomTranscript
          messages={room.messages}
          emptyText={room.bots.length ? "Say something to start. Mention a bot with @Name." : "No bots yet. Create one with Manage bots."}
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
            bots={room.bots}
            disabled={room.busy || room.bots.length === 0}
            placeholder={room.bots.length ? "Message the room. @Name asks a bot first." : "Create a bot first"}
          />
          <button className="btn btn-primary join-item" disabled={room.busy || room.bots.length === 0 || !draft.trim()}>
            Send
          </button>
        </form>
      </div>

      <BotsDialog
        open={managing}
        onClose={() => {
          setManaging(false);
          room.loadBots();
        }}
      />
    </Card>
  );
}
