import { useEffect, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { MailMessage } from "../../api/types";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { Modal } from "../../ui/Modal";
import { formatMailDate } from "./mailFormat";

// One message opened in full: its subject, who sent it and who it went to, when, and its text. The server does not mark it read.
export function MailMessageDialog({
  open,
  accountId,
  uid,
  onClose,
}: {
  open: boolean;
  accountId: string | undefined;
  uid: number | undefined;
  onClose: () => void;
}) {
  const [message, setMessage] = useState<MailMessage>();
  const [error, setError] = useState<string>();

  // Loads the message each time a different one is opened, and clears the last one first.
  useEffect(() => {
    setMessage(undefined);
    setError(undefined);
    if (!open || !accountId || uid === undefined) return;
    api
      .get<MailMessage>(`/api/mail/accounts/${encodeURIComponent(accountId)}/messages/${uid}`)
      .then(setMessage)
      .catch((err) => setError(errorText(err)));
  }, [open, accountId, uid]);

  return (
    <Modal open={open} onClose={onClose} closeButton glow="frost">
      <div className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold break-words">{message?.subject || "Message"}</h3>
        {message && (
          <div className="flex flex-col gap-1 text-sm opacity-70">
            <div className="break-all">From {message.from || "unknown"}</div>
            {message.to && <div className="break-all">To {message.to}</div>}
            <div>{formatMailDate(message.date)}</div>
          </div>
        )}
        {!message && !error && <div className="text-sm opacity-60">Loading the message…</div>}
        <ErrorAlert message={error} />
        {message && (
          <>
            <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words rounded-box bg-base-300/40 p-3 text-sm">{message.text || "(no text)"}</div>
            {message.truncated && <div className="text-xs opacity-60">The message is longer. Only its start is shown.</div>}
          </>
        )}
      </div>
    </Modal>
  );
}
