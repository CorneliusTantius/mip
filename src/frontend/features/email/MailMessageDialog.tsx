import { useEffect, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { MailMessage } from "../../api/types";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { shortLink } from "../../ui/links";
import { Modal } from "../../ui/Modal";
import { displaySender, formatMailDate, linkPieces, paragraphsOf } from "./mailFormat";

// One message opened in full, read like a mail client: the subject, then the sender and the recipients, then the text in a comfortable
// column. The text is reflowed (wrapped mail lines are joined into paragraphs), and web links are clickable. The server does not mark it read.
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
    <Modal open={open} onClose={onClose} closeButton glow="frost" boxClassName="flex max-h-[85vh] w-[min(46rem,94vw)] max-w-none flex-col">
      <h2 className="pr-10 text-xl font-semibold leading-snug break-words">{message?.subject || "(no subject)"}</h2>
      {message && (
        <div className="mt-3 flex flex-col gap-1 border-b border-base-300/60 pb-3 text-sm">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{displaySender(message.from) || "Unknown sender"}</span>
            {message.from.includes("<") && <span className="min-w-0 break-all text-xs opacity-60">{message.from.replace(/^.*?<|>$/g, "")}</span>}
            <span className="ml-auto shrink-0 text-xs opacity-60">{formatMailDate(message.date)}</span>
          </div>
          {message.to && <div className="break-all text-xs opacity-60">To {message.to}</div>}
        </div>
      )}
      {!message && !error && <div className="mt-4 text-sm opacity-60">Loading the message…</div>}
      <ErrorAlert message={error} />
      {message && (
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-2">
          <article className="flex max-w-prose flex-col gap-4 text-[0.95rem] leading-7 break-words [overflow-wrap:anywhere]">
            {paragraphsOf(message.text).map((lines, p) => (
              <div key={p} className="flex flex-col">
                {lines.map((line, l) => (
                  <p key={l} className={line.match(/^([•·*-]|\d+[.)])\s/) ? "pl-4 -indent-4" : ""}>
                    {linkPieces(line).map((piece, i) =>
                      piece.href ? (
                        <a
                          key={i}
                          className="link max-w-full break-all"
                          href={piece.href}
                          title={piece.href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {shortLink(piece.href)}
                        </a>
                      ) : (
                        <span key={i}>{piece.text}</span>
                      ),
                    )}
                  </p>
                ))}
              </div>
            ))}
            {message.text.trim() === "" && <p className="opacity-60">(no text)</p>}
          </article>
          {message.truncated && <div className="mt-4 text-xs opacity-60">The message is longer. Only its start is shown.</div>}
        </div>
      )}
    </Modal>
  );
}
