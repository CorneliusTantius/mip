import { AppError } from "../errors.js";
import { slackCall } from "./api.js";
import { type SlackAccount, readSlackConfig } from "./config.js";
import { userNameOf } from "./connect.js";

// Reading as a connected user: the conversations the user is in, and the newest messages of one. Names of people are looked up once per
// request. Slack limits how often history can be read for apps outside its Marketplace, so a refused read says so.

export type SlackKind = "channel" | "private" | "group" | "dm";

export interface SlackConversation {
  id: string;
  name: string;
  kind: SlackKind;
}

export interface SlackMessage {
  ts: string;
  time: string;
  author: string;
  text: string;
}

const CHANNEL_ID = /^[A-Z0-9]{1,32}$/;
// The most conversations listed, and the most messages read, per call.
const MAX_CONVERSATIONS = 200;
const MESSAGES_PER_READ = 30;

// The conversations of an account, channels first, then direct messages.
export async function listConversations(accountId: string): Promise<SlackConversation[]> {
  const account = accountOf(accountId);
  const reply = await slackCall<{
    channels: { id: string; name?: string; is_channel?: boolean; is_group?: boolean; is_im?: boolean; is_mpim?: boolean; user?: string }[];
  }>("users.conversations", account.token, {
    types: "public_channel,private_channel,mpim,im",
    exclude_archived: true,
    limit: MAX_CONVERSATIONS,
  });
  const names = new Map<string, string>();
  const conversations: SlackConversation[] = [];
  for (const channel of reply.channels) {
    if (channel.is_im) {
      const user = channel.user ?? channel.id;
      if (!names.has(user)) names.set(user, await userNameOf(account.token, user));
      conversations.push({ id: channel.id, name: names.get(user) ?? user, kind: "dm" });
    } else if (channel.is_mpim) {
      conversations.push({ id: channel.id, name: channel.name ?? channel.id, kind: "group" });
    } else {
      conversations.push({ id: channel.id, name: channel.name ?? channel.id, kind: channel.is_group ? "private" : "channel" });
    }
  }
  return conversations.sort((a, b) => rank(a.kind) - rank(b.kind) || a.name.localeCompare(b.name));
}

// The newest messages of one conversation, newest first. A message's author is the person's name, or the bot's id for a bot message.
export async function listMessages(accountId: string, channel: string): Promise<SlackMessage[]> {
  const account = accountOf(accountId);
  if (!CHANNEL_ID.test(channel)) throw new AppError(400, "That is not a conversation id.");
  const reply = await slackCall<{
    messages: { ts: string; user?: string; bot_id?: string; username?: string; text?: string }[];
  }>("conversations.history", account.token, { channel, limit: MESSAGES_PER_READ });

  const names = new Map<string, string>();
  const messages: SlackMessage[] = [];
  for (const message of reply.messages) {
    let author = message.username ?? message.bot_id ?? "Unknown";
    if (message.user) {
      if (!names.has(message.user)) names.set(message.user, await userNameOf(account.token, message.user));
      author = names.get(message.user) ?? message.user;
    }
    messages.push({ ts: message.ts, time: timeOf(message.ts), author, text: message.text ?? "" });
  }
  return messages;
}

function accountOf(id: string): SlackAccount {
  const account = readSlackConfig().accounts.find((candidate) => candidate.id === id);
  if (!account) throw new AppError(404, `No Slack account called "${id}".`);
  return account;
}

function rank(kind: SlackKind): number {
  return { channel: 0, private: 1, group: 2, dm: 3 }[kind];
}

// Slack's timestamps are seconds since the epoch, with a fraction.
function timeOf(ts: string): string {
  return new Date(Number(ts) * 1000).toISOString();
}
