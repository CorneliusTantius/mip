import { useEffect, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { MailMessage } from "../../api/types";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { Modal } from "../../ui/Modal";
import { formatMailDate } from "./mailFormat";

// One message opened in full: its subject, who sent it and who it went to, when, and its text. The server does not mark it read.
// The dialog is as wide as the Slack dialogs. Its text is read as plain text: line breaks are kept, runs of blank lines are cut to one,
// and long links wrap inside the panel.
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
    <Modal open={open} onClose={onClose} closeButton glow="frost" boxClassName="flex max-h-[80vh] w-[min(48rem,92vw)] max-w-none flex-col">
      <h2 className="pr-8 text-lg font-semibold leading-snug break-words">{message?.subject || "Message"}</h2>
      {message && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs opacity-70">
          <dt>From</dt>
          <dd className="break-all">{message.from || "unknown"}</dd>
          {message.to && (
            <>
              <dt>To</dt>
              <dd className="break-all">{message.to}</dd>
            </>
          )}
          <dt>Date</dt>
          <dd>{formatMailDate(message.date)}</dd>
        </dl>
      )}
      {!message && !error && <div className="mt-3 text-sm opacity-60">Loading the message…</div>}
      <ErrorAlert message={error} />
      {message && (
        <>
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto border-t border-base-300/60 pt-3 text-sm leading-relaxed whitespace-pre-line break-words [overflow-wrap:anywhere]">
            {(message.text || "(no text)").replace(/\n{3,}/g, "\n\n")}
          </div>
          {message.truncated && <div className="mt-2 text-xs opacity-60">The message is longer. Only its start is shown.</div>}
        </>
      )}
    </Modal>
  );
}
