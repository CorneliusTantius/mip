import { useState } from "preact/hooks";
import { errorText } from "../../api/client";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { Modal } from "../../ui/Modal";
import { SlackTranscript } from "./SlackTranscript";
import { useThread } from "./useSlack";

// One thread in a Slack conversation: the parent message and its replies. Replies are sent as the connected user, from the box at the bottom.
export function SlackThreadDialog({
  open,
  accountId,
  userId,
  channelId,
  channelName,
  threadTs,
  onClose,
}: {
  open: boolean;
  accountId: string | undefined;
  userId: string | undefined;
  channelId: string | undefined;
  channelName: string | undefined;
  threadTs: string | undefined;
  onClose: () => void;
}) {
  const thread = useThread(accountId, channelId, threadTs);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string>();

  async function reply(e: Event) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    setSendError(undefined);
    try {
      await thread.reply(text);
      setDraft("");
    } catch (err) {
      setSendError(errorText(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} closeButton glow="violet" boxClassName="flex h-[min(40rem,80vh)] w-[min(36rem,92vw)] max-w-none flex-col">
      <h2 className="mb-3 text-lg font-semibold">Thread in {channelName ? `#${channelName}` : "this conversation"}</h2>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <SlackTranscript
          messages={thread.list}
          me={userId}
          emptyText={thread.loading ? "Loading the thread…" : "No replies yet."}
          large={false}
        />
        <ErrorAlert message={thread.error} />
        <ErrorAlert message={sendError} />
        <form className="join w-full" onSubmit={reply}>
          <input
            className="input input-sm join-item w-full"
            placeholder="Reply in the thread"
            aria-label="Reply in the thread"
            value={draft}
            onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
          />
          <button className="btn btn-primary btn-sm join-item" disabled={sending || !draft.trim()}>
            Reply
          </button>
        </form>
      </div>
    </Modal>
  );
}
