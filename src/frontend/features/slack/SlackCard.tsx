import { useEffect, useState } from "preact/hooks";
import { errorText } from "../../api/client";
import type { SlackConversation } from "../../api/types";
import { Card, CardBody, ExpandButton, useCardExpansion } from "../../ui/Card";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { usePolling } from "../../ui/hooks";
import { MESSAGING_CARD_HEIGHT } from "../../ui/SourceCard";
import { SlackDialog } from "./SlackDialog";
import { useConversations, useMessages, useSlack } from "./useSlack";

// How long, after a sign-in starts, the account list is re-read while the browser finishes the sign-in on Slack's page.
const WAIT_MS = 120_000;
const POLL_MS = 3000;

// The Slack card: the conversations of a connected Slack account, and the newest messages of the one chosen. It reads as the connected user,
// so the messages are the ones that user can see. The Accounts button opens the Slack setup and the connected accounts, as the mail card does.
export function SlackCard() {
  return (
    <Card glow="violet" className={MESSAGING_CARD_HEIGHT}>
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
  const conversation = conversations.list.find((candidate) => candidate.id === chosenId) ?? conversations.list[0];
  const messages = useMessages(account?.id, conversation?.id);
  const text = expanded ? "text-base" : "text-sm";
  const [dialogOpen, setDialogOpen] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [signInError, setSignInError] = useState<string>();

  // While the sign-in is open in another tab, the account list is re-read, so the card fills in without a reload.
  usePolling(() => void slack.reload(), POLL_MS, waiting);
  useEffect(() => {
    if (accounts.length > 0) setWaiting(false);
  }, [accounts.length]);

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

  return (
    <>
      <CardBody
        title="Slack"
        className="min-h-0 flex-1 gap-3"
        actions={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setDialogOpen(true)}>
              Accounts
            </button>
            {conversation && (
              <button className="btn btn-ghost btn-sm" onClick={() => void messages.reload()}>
                Refresh
              </button>
            )}
            <ExpandButton />
          </>
        }
      >
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
            <div className="join self-start" role="group" aria-label="Slack account">
              {accounts.map((candidate) => (
                <button
                  key={candidate.id}
                  className={`join-item btn ${expanded ? "btn-sm" : "btn-xs"} ${account?.id === candidate.id ? "btn-active" : ""}`}
                  onClick={() => setSelectedId(candidate.id)}
                >
                  {candidate.userName} · {candidate.teamName}
                </button>
              ))}
            </div>

            <ErrorAlert message={conversations.error} />
            {conversations.list.length > 0 && (
              <select
                className={`select w-full ${expanded ? "select-sm" : "select-xs"}`}
                aria-label="Conversation"
                value={conversation?.id ?? ""}
                onChange={(e) => setChosenId((e.target as HTMLSelectElement).value)}
              >
                {conversations.list.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {label(candidate)}
                  </option>
                ))}
              </select>
            )}

            <ErrorAlert message={messages.error} />
            <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {messages.list.map((message) => (
                <li key={message.ts} className={`flex flex-col px-2 py-1.5 ${text}`}>
                  <span className="flex min-w-0 justify-between gap-2">
                    <span className="truncate font-semibold">{message.author}</span>
                    <span className="shrink-0 text-xs opacity-60">{formatTime(message.time)}</span>
                  </span>
                  <span className="whitespace-pre-wrap break-words opacity-80">{message.text || "(no text)"}</span>
                </li>
              ))}
            </ul>

            {conversation && messages.list.length === 0 && !messages.error && (
              <div className="py-4 text-center text-sm opacity-60">No messages in this conversation.</div>
            )}
            <div className="text-xs opacity-60">
              {messages.checkedAt ? `Read at ${formatTime(messages.checkedAt.toISOString())}` : "Reading…"}
            </div>
          </>
        )}
      </CardBody>

      <SlackDialog
        open={dialogOpen}
        slack={slack}
        waiting={waiting}
        onSignIn={signIn}
        onClose={() => setDialogOpen(false)}
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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
