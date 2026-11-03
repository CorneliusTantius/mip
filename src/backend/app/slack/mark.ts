import { AppError } from "../errors.js";
import { slackCall } from "./api.js";
import { forgetCache } from "./cache.js";
import { accountOf } from "./read.js";

// Marking a conversation read as the connected user. Slack moves the user's read position to the timestamp, so the messages up to it stop
// showing as unread, in Slack on every device. The unread answers are dropped from the cache, so the next read shows the change.

const CHANNEL_ID = /^[A-Z0-9]{1,32}$/;
const MESSAGE_TS = /^\d+\.\d+$/;

// Marks a conversation read up to a message, or up to its newest message when no timestamp is given. Returns the timestamp it marked, or
// nothing when the conversation has no messages to mark.
export async function markRead(accountId: string, channel: string, ts?: string): Promise<{ ts?: string }> {
  const account = accountOf(accountId);
  if (!CHANNEL_ID.test(channel)) throw new AppError(400, "That is not a conversation id.");
  if (ts !== undefined && !MESSAGE_TS.test(ts)) throw new AppError(400, "That is not a message timestamp.");

  const upTo = ts ?? (await newestTs(account.token, channel));
  if (upTo === undefined) return {};
  await slackCall("conversations.mark", account.token, { channel, ts: upTo });
  forgetCache([`unread-messages:${account.id}`]);
  return { ts: upTo };
}

// The timestamp of the conversation's newest message, or undefined when it has none.
async function newestTs(token: string, channel: string): Promise<string | undefined> {
  const reply = await slackCall<{ messages: { ts: string }[] }>("conversations.history", token, { channel, limit: 1 });
  return reply.messages[0]?.ts;
}
