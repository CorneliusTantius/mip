import { useState } from "preact/hooks";
import { errorText } from "../../api/client";
import type { MailAccount } from "../../api/types";
import { Card, ExpandButton, useCardExpansion } from "../../ui/Card";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { MESSAGING_CARD_HEIGHT } from "../../ui/SourceCard";
import { AddMailAccountDialog } from "./AddMailAccountDialog";
import { MailMessageDialog } from "./MailMessageDialog";
import { displaySender, formatMailDate } from "./mailFormat";
import { useMailAccounts, useMailbox } from "./useMail";

// The email card, laid out like the Slack and bots cards: a title row, the account pills, the newest messages of the inbox, a status line,
// and the account's actions. A message opens in full. Reading never marks a message as read. The inbox is read again on the account's poll
// interval while the card is open.
export function EmailCard() {
  return (
    <Card glow="frost" className={`flex shrink-0 ${MESSAGING_CARD_HEIGHT}`}>
      <EmailBody />
    </Card>
  );
}

// The card's content. It sits inside Card, so it reads the expanded state, and its text steps up one size when the card is expanded.
function EmailBody() {
  const { expanded } = useCardExpansion();
  const accounts = useMailAccounts();
  const [selectedId, setSelectedId] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [openUid, setOpenUid] = useState<number>();
  const [pendingRemove, setPendingRemove] = useState<MailAccount>();
  const [removeError, setRemoveError] = useState<string>();

  const list = accounts.reply?.accounts ?? [];
  const selected = list.find((account) => account.id === selectedId) ?? list[0];
  const inbox = useMailbox(selected?.id, selected?.watch.pollSeconds ?? 60);
  const messages = inbox.mailbox?.messages ?? [];
  const unread = messages.filter((message) => !message.seen).length;
  const text = expanded ? "text-base" : "text-sm";

  async function confirmRemove() {
    if (!pendingRemove) return;
    setRemoveError(undefined);
    try {
      await accounts.remove(pendingRemove.id);
      setPendingRemove(undefined);
      setSelectedId(undefined);
    } catch (err) {
      setRemoveError(errorText(err));
    }
  }

  function cancelRemove() {
    setPendingRemove(undefined);
    setRemoveError(undefined);
  }

  // The line under the list. Its height is fixed, so showing or hiding the text never moves the list.
  let status = "";
  if (inbox.mailbox) {
    status = `${unread} unread of the newest ${messages.length}, checked ${inbox.mailbox.checkedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } else if (selected && !inbox.error) {
    status = "Reading the inbox…";
  }

  return (
    <>
      <div className="card-body min-h-0 flex-1 gap-3 p-4">
        <div className="flex items-center gap-2">
          <h2 className="card-title mr-auto">Email</h2>
          <button className="btn btn-sm" onClick={() => setAdding(true)}>
            Add account
          </button>
          {selected && (
            <button className="btn btn-sm btn-ghost" onClick={() => void inbox.reload()}>
              Refresh
            </button>
          )}
          <ExpandButton />
        </div>

        <ErrorAlert message={accounts.error} />
        {accounts.reply === undefined && !accounts.error && <div className="text-sm opacity-60">Loading mail accounts…</div>}
        {accounts.reply && list.length === 0 && (
          <div className="py-4 text-center text-sm opacity-60">No mail account yet. Add one with its app password.</div>
        )}

        {list.length > 0 && (
          <>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5" role="group" aria-label="Mail account">
              {list.map((account) => (
                <button
                  key={account.id}
                  className={`btn btn-xs ${selected?.id === account.id ? "btn-active" : "btn-ghost"}`}
                  onClick={() => setSelectedId(account.id)}
                >
                  {account.label}
                </button>
              ))}
            </div>

            <ErrorAlert message={inbox.error} />

            <ul className="flex min-h-0 flex-1 flex-col divide-y divide-base-300/40 overflow-y-auto">
              {messages.map((message) => (
                <li key={message.uid}>
                  <button
                    className={`flex w-full min-w-0 items-start gap-2 rounded-box px-2 py-2 text-left hover:bg-base-300/50 ${text}`}
                    onClick={() => setOpenUid(message.uid)}
                  >
                    <span className={`mt-2 size-2 shrink-0 rounded-full ${message.seen ? "" : "bg-primary"}`} aria-label={message.seen ? "Read" : "Unread"} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex min-w-0 items-baseline justify-between gap-2">
                        <span className={`truncate ${message.seen ? "" : "font-semibold"}`}>{displaySender(message.from) || "Unknown sender"}</span>
                        <span className="shrink-0 text-xs opacity-60">{formatMailDate(message.date)}</span>
                      </span>
                      <span className={`truncate ${message.seen ? "opacity-70" : ""}`}>{message.subject || "(no subject)"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {inbox.mailbox && messages.length === 0 && <div className="py-4 text-center text-sm opacity-60">The inbox is empty.</div>}

            {/* A fixed-height line: the summary or the error, and the account's remove action. */}
            <div role="status" className="flex h-5 flex-none items-center justify-between gap-2 text-xs">
              <span className={`truncate ${inbox.error ? "text-error" : "opacity-60"}`}>{inbox.error ?? status}</span>
              {selected && (
                <button className="btn btn-ghost btn-xs h-5 min-h-5 text-error" onClick={() => setPendingRemove(selected)}>
                  Remove account
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <AddMailAccountDialog open={adding} presets={accounts.reply?.presets ?? []} onClose={() => setAdding(false)} onAdd={accounts.add} />
      <MailMessageDialog open={openUid !== undefined} accountId={selected?.id} uid={openUid} onClose={() => setOpenUid(undefined)} />
      <ConfirmDialog
        open={!!pendingRemove}
        glow="red"
        title="Remove this account?"
        message={`"${pendingRemove?.label ?? ""}" is taken out of mail.json, with its app password. Its mail stays on the server.`}
        error={removeError}
        onConfirm={confirmRemove}
        onCancel={cancelRemove}
      />
    </>
  );
}
