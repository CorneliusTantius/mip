import { useEffect, useState } from "preact/hooks";
import { errorText } from "../../api/client";
import type { SlackConversation } from "../../api/types";
import { Card, ExpandButton, useCardExpansion } from "../../ui/Card";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { usePolling } from "../../ui/hooks";
import { MESSAGING_CARD_HEIGHT } from "../../ui/SourceCard";
import { SlackDialog } from "./SlackDialog";
import { SlackThreadDialog } from "./SlackThreadDialog";
import { SlackTranscript } from "./SlackTranscript";
import { useConversations, useMessages, useSlack, useUnread } from "./useSlack";

// How long, after a sign-in starts, the account list is re-read while the browser finishes the sign-in on Slack's page.
const WAIT_MS = 120_000;
const POLL_MS = 3000;

// The Slack card, laid out like the bots card: a title row, the accounts and conversation, the transcript as chat bubbles, a status line,
// and a composer. It reads and sends as the connected user. Accounts opens the Slack setup. A thread opens in its own dialog.
export function SlackCard() {
  return (
    <Card glow="violet" className={`flex shrink-0 ${MESSAGING_CARD_HEIGHT}`}>
      <SlackBody />
    </Card>
  );
}

// The card's content. It sits inside Card, so it reads the expanded state, and its text steps up one size when the card is expanded.
function SlackBody() {
  const { expanded } = useCardExpansion();
  const slack = useSlack();
  const accounts = slack.state?.accounts ?? [];
  const [selectedId, setSelectedId] = useState<string>();
  const account = accounts.find((candidate) => candidate.id === selectedId) ?? accounts[0];
  const conversations = useConversations(account?.id);
  const [chosenId, setChosenId] = useState<string>();
  const conversation: SlackConversation | undefined = conversations.list.find((candidate) => candidate.id === chosenId) ?? conversations.list[0];
  const messages = useMessages(account?.id, conversation?.id);
  const unread = useUnread(account?.id);
  const unreadTotal = Object.values(unread.counts).reduce((sum, count) => sum + count, 0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const [threadTs, setThreadTs] = useState<string>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [signInError, setSignInError] = useState<string>();

  // While the sign-in is open in another tab, the account list is re-read, so the card fills in without a reload.
  usePolling(() => void slack.reload(), POLL_MS, waiting);
  useEffect(() => {
    if (accounts.length > 0) setWaiting(false);
  }, [accounts.length]);
  // A thread belongs to one conversation, so it closes when another is chosen.
  useEffect(() => setThreadTs(undefined), [conversation?.id]);

  // Opens Slack's sign-in page and waits for the approval. Throws the reason when the sign-in cannot start.
  async function signIn() {
    const url = await slack.startConnect();
    window.open(url, "_blank", "noopener");
    setWaiting(true);
    window.setTimeout(() => setWaiting(false), WAIT_MS);
  }

  async function signInFromCard() {
    setSignInError(undefined);
    try {
      await signIn();
    } catch (err) {
      setSignInError(errorText(err));
    }
  }

  // Sends the draft as the user. The draft stays when Slack refuses, so nothing is lost.
  async function send(e: Event) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    setSendError(undefined);
    try {
      await messages.send(text);
      setDraft("");
    } catch (err) {
      setSendError(errorText(err));
    } finally {
      setSending(false);
    }
  }

  const large = expanded;
  const status = messages.error ?? sendError ?? conversations.error;
  const busy = sending || messages.loading || conversations.loading;

  return (
    <>
      <div className="card-body min-h-0 flex-1 gap-3 p-4">
        <div className="flex items-center gap-2">
          <h2 className="card-title mr-auto">
            Slack
            {unreadTotal > 0 && (
              <span className="badge badge-primary badge-sm" aria-label={`${unreadTotal} unread`}>
                {unreadTotal > 99 ? "99+" : unreadTotal}
              </span>
            )}
          </h2>
          <button className="btn btn-sm" onClick={() => setDialogOpen(true)}>
            Accounts
          </button>
          <ExpandButton />
        </div>

        <ErrorAlert message={slack.error} />
        {slack.state === undefined && !slack.error && <div className="text-sm opacity-60">Loading Slack…</div>}
        {slack.state && !slack.state.app && (
          <div className="py-4 text-center text-sm opacity-60">No Slack app yet. Add its client ID and secret under Accounts.</div>
        )}
        {slack.state?.app && accounts.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-4 text-center text-sm opacity-60">
            <span>No Slack account yet. Sign in to read its conversations.</span>
            <button className="btn btn-primary btn-sm" onClick={() => void signInFromCard()}>
              Sign in with Slack
            </button>
            {waiting && <span className="text-xs">Waiting for the approval in the other tab…</span>}
            <ErrorAlert message={signInError} />
          </div>
        )}

        {accounts.length > 0 && (
          <>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {accounts.map((candidate) => (
                <button
                  key={candidate.id}
                  className={`btn btn-xs ${candidate.id === account?.id ? "btn-active" : "btn-ghost"}`}
                  onClick={() => setSelectedId(candidate.id)}
                >
                  {candidate.userName} · {candidate.teamName}
                </button>
              ))}
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <select
                className="select select-sm min-w-0 flex-1"
                aria-label="Conversation"
                disabled={conversations.list.length === 0}
                value={conversation?.id ?? ""}
                onChange={(e) => setChosenId((e.target as HTMLSelectElement).value)}
              >
                {conversations.list.length === 0 && <option value="">{conversations.loading ? "Loading conversations…" : "No conversations"}</option>}
                {conversations.list.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {label(candidate)}
                    {unread.counts[candidate.id] ? ` (${unread.counts[candidate.id]} unread)` : ""}
                  </option>
                ))}
              </select>
              <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void Promise.all([conversations.reload(), messages.reload(), unread.reload()])}>
                Refresh
              </button>
            </div>

            <SlackTranscript
              messages={[...messages.list].reverse()}
              me={account?.userId}
              large={large}
              emptyText={
                !conversation ? "Choose a conversation." : messages.loading ? "Loading messages…" : "No messages in this conversation yet."
              }
              onOpenThread={setThreadTs}
            />

            {/* A fixed-height line, so showing or hiding the status never moves the transcript. */}
            <p role="status" className="flex h-5 flex-none items-center gap-2 text-xs">
              {status ? (
                <span className="truncate text-error">{status}</span>
              ) : (
                busy && (
                  <>
                    <span className="loading loading-dots loading-xs opacity-70" />
                    <span className="opacity-70">{sending ? "Sending…" : "Loading…"}</span>
                  </>
                )
              )}
            </p>

            <form className="join relative w-full" onSubmit={send}>
              <input
                className="input input-sm join-item w-full"
                placeholder={conversation ? `Message ${label(conversation)}` : "Choose a conversation first"}
                aria-label="Message"
                disabled={!conversation || sending}
                value={draft}
                onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
              />
              <button className="btn btn-primary btn-sm join-item" disabled={!conversation || sending || !draft.trim()}>
                Send
              </button>
            </form>
          </>
        )}
      </div>

      <SlackDialog open={dialogOpen} slack={slack} waiting={waiting} onSignIn={signIn} onClose={() => setDialogOpen(false)} />
      <SlackThreadDialog
        open={threadTs !== undefined}
        accountId={account?.id}
        userId={account?.userId}
        channelId={conversation?.id}
        channelName={conversation?.name}
        threadTs={threadTs}
        onClose={() => setThreadTs(undefined)}
      />
    </>
  );
}

// What a conversation is called in the list: # for a channel, a lock for a private one, and the person's name for a direct message.
function label(conversation: SlackConversation): string {
  if (conversation.kind === "dm") return conversation.name;
  if (conversation.kind === "private") return `🔒 ${conversation.name}`;
  if (conversation.kind === "group") return `Group: ${conversation.name}`;
  return `# ${conversation.name}`;
}
