import { AppError } from "../errors.js";
import { slackCall } from "./api.js";
import { forgetCache } from "./cache.js";
import { accountOf } from "./read.js";

// Sending as the connected user. Slack posts the message under the user's name, so the caller must have asked for it: the card sends only
// when the user presses Send, and a bot's slack_send only when its guide's condition holds. The answers this changes are dropped from the
// cache, so the next read shows the new message.

const CHANNEL_ID = /^[A-Z0-9]{1,32}$/;
const THREAD_TS = /^\d+\.\d+$/;
// shortcut: 4,000 characters per message, while Slack allows 40,000; raise it if a long message is needed.
const MAX_TEXT = 4000;

export async function sendMessage(accountId: string, channel: string, text: string, threadTs?: string): Promise<{ ts: string }> {
  const account = accountOf(accountId);
  const body = text.trim();
  if (!CHANNEL_ID.test(channel)) throw new AppError(400, "That is not a conversation id.");
  if (!body) throw new AppError(400, "Write a message first.");
  if (body.length > MAX_TEXT) throw new AppError(400, `A message can be ${MAX_TEXT} characters at most.`);
  if (threadTs !== undefined && !THREAD_TS.test(threadTs)) throw new AppError(400, "That is not a thread.");

  const reply = await slackCall<{ ts: string }>("chat.postMessage", account.token, {
    channel,
    text: body,
    thread_ts: threadTs,
  });
  forgetCache([`messages:${account.id}:${channel}`, `replies:${account.id}:${channel}:`]);
  return { ts: reply.ts };
}
