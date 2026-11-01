import { useState } from "preact/hooks";
import { errorText } from "../../api/client";
import type { MailAccount } from "../../api/types";
import { Card, CardBody, ExpandButton, useCardExpansion } from "../../ui/Card";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { MESSAGING_CARD_HEIGHT } from "../../ui/SourceCard";
import { AddMailAccountDialog } from "./AddMailAccountDialog";
import { MailMessageDialog } from "./MailMessageDialog";
import { displaySender, formatMailDate } from "./mailFormat";
import { useMailAccounts, useMailbox } from "./useMail";

// The email card: the mail accounts mip reads over IMAP. Each account lists the newest messages of its inbox, and a message opens in full.
// Reading never marks a message as read. The list is read again on the account's poll interval while the card is open.
// The card has the height every messaging card shares. Its list fills the space below the header.
export function EmailCard() {
  return (
    <Card glow="frost" className={MESSAGING_CARD_HEIGHT}>
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

  return (
    <>
      <CardBody
        title="Email"
        className="min-h-0 flex-1 gap-3"
        actions={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>
              Add account
            </button>
            {selected && (
              <button className="btn btn-ghost btn-sm" onClick={() => void inbox.reload()}>
                Refresh
              </button>
            )}
            <ExpandButton />
          </>
        }
      >
        <ErrorAlert message={accounts.error} />
        {accounts.reply === undefined && !accounts.error && <div className="text-sm opacity-60">Loading mail accounts…</div>}
        {accounts.reply && list.length === 0 && (
          <div className="py-4 text-center text-sm opacity-60">No mail account yet. Add one with its app password.</div>
        )}

        {list.length > 0 && (
          <>
            <div className="join self-start" role="group" aria-label="Mail account">
              {list.map((account) => (
                <button
                  key={account.id}
                  className={`join-item btn ${expanded ? "btn-sm" : "btn-xs"} ${selected?.id === account.id ? "btn-active" : ""}`}
                  onClick={() => setSelectedId(account.id)}
                >
                  {account.label}
                </button>
              ))}
            </div>

            <ErrorAlert message={inbox.error} />

            <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {messages.map((message) => (
                <li key={message.uid}>
                  <button
                    className={`flex w-full min-w-0 items-start gap-2 rounded-box px-2 py-1.5 text-left hover:bg-base-300/50 ${text}`}
                    onClick={() => setOpenUid(message.uid)}
                  >
                    <span className={`mt-2 size-2 shrink-0 rounded-full ${message.seen ? "" : "bg-primary"}`} aria-label={message.seen ? "Read" : "Unread"} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex min-w-0 justify-between gap-2">
                        <span className={`truncate ${message.seen ? "" : "font-semibold"}`}>{displaySender(message.from) || "Unknown sender"}</span>
                        <span className="shrink-0 text-xs opacity-60">{formatMailDate(message.date)}</span>
                      </span>
                      <span className="truncate opacity-70">{message.subject || "(no subject)"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {inbox.mailbox && messages.length === 0 && <div className="py-4 text-center text-sm opacity-60">The inbox is empty.</div>}

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs opacity-60">
              <span>
                {inbox.mailbox
                  ? `${unread} unread of the newest ${messages.length}, checked ${inbox.mailbox.checkedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : "Reading the inbox…"}
              </span>
              {selected && (
                <button className="btn btn-ghost btn-xs text-error" onClick={() => setPendingRemove(selected)}>
                  Remove account
                </button>
              )}
            </div>
          </>
        )}
      </CardBody>

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
