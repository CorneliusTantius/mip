import { useEffect, useState } from "preact/hooks";
import { errorText } from "../../api/client";
import type { SlackConversation } from "../../api/types";
import { Card, CardBody, ExpandButton, useCardExpansion } from "../../ui/Card";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { MESSAGING_CARD_HEIGHT } from "../../ui/SourceCard";
import { usePolling } from "../../ui/hooks";
import { useConversations, useMessages, useSlack } from "./useSlack";

// How long, after "Sign in with Slack", the account list is re-read while the browser finishes the sign-in on Slack's page.
const WAIT_MS = 120_000;
const POLL_MS = 3000;

// The Slack card: the conversations of a connected Slack account, and the newest messages of the one chosen. It reads as the connected user,
// so the messages are the ones that user can see. Signing in is a button on the card. The Slack app's client ID and secret are set in
// Settings → Slack, once.
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
  const [waiting, setWaiting] = useState(false);
  const [signInError, setSignInError] = useState<string>();

  // While the sign-in is open in another tab, the account list is re-read, so the card fills in without a reload.
  usePolling(() => void slack.reload(), POLL_MS, waiting);
  useEffect(() => {
    if (accounts.length > 0) setWaiting(false);
  }, [accounts.length]);

  async function signIn() {
    setSignInError(undefined);
    try {
      const url = await slack.startConnect();
      window.open(url, "_blank", "noopener");
      setWaiting(true);
      window.setTimeout(() => setWaiting(false), WAIT_MS);
    } catch (err) {
      setSignInError(errorText(err));
    }
  }

  return (
    <CardBody
      title="Slack"
      className="min-h-0 flex-1 gap-3"
      actions={
        <>
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
        <div className="py-4 text-center text-sm opacity-60">Set up the Slack app in Settings → Slack.</div>
      )}
      {slack.state?.app && accounts.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className={`opacity-70 ${text}`}>Sign in with your Slack account to read its conversations.</p>
          <button className="btn btn-primary btn-sm" onClick={() => void signIn()}>
            Sign in with Slack
          </button>
          {waiting && <span className="text-xs opacity-60">Waiting for the approval in the other tab…</span>}
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
