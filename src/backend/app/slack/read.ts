import { AppError } from "../errors.js";
import { cached } from "./cache.js";
import { slackCall } from "./api.js";
import { type SlackAccount, readSlackConfig } from "./config.js";

// Reading as a connected user: the conversations the user is in, and the newest messages of one. Answers are cached, so a reload does not call
// Slack again. Force refreshes a read. Names come from one users.list pass per workspace, not a call per person. Slack limits how often
// history can be read for apps outside its Marketplace, so a refused read says so.

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
const MAX_CONVERSATIONS = 200;
const MESSAGES_PER_READ = 30;
// Pages of users.list read for names, 200 people each. Past this, the rest show as ids.
// shortcut: 50 pages of 200 people, so a bigger workspace shows some names as ids; raise it when that matters.
const MAX_USER_PAGES = 50;
const CONVERSATIONS_TTL = 10 * 60_000;
const MESSAGES_TTL = 2 * 60_000;
const NAMES_TTL = 24 * 60 * 60_000;

// The conversations of an account, channels first, then direct messages.
export function listConversations(accountId: string, force = false): Promise<SlackConversation[]> {
  const account = accountOf(accountId);
  return cached(
    `conversations:${account.id}`,
    CONVERSATIONS_TTL,
    async () => {
      const reply = await slackCall<{
        channels: { id: string; name?: string; is_group?: boolean; is_im?: boolean; is_mpim?: boolean; user?: string }[];
      }>("users.conversations", account.token, {
        types: "public_channel,private_channel,mpim,im",
        exclude_archived: true,
        limit: MAX_CONVERSATIONS,
      });
      const names = await namesOf(account);
      const conversations = reply.channels.map((channel): SlackConversation => {
        if (channel.is_im) return { id: channel.id, name: names[channel.user ?? ""] ?? channel.user ?? channel.id, kind: "dm" };
        if (channel.is_mpim) return { id: channel.id, name: channel.name ?? channel.id, kind: "group" };
        return { id: channel.id, name: channel.name ?? channel.id, kind: channel.is_group ? "private" : "channel" };
      });
      return conversations.sort((a, b) => rank(a.kind) - rank(b.kind) || a.name.localeCompare(b.name));
    },
    force,
  );
}

// The newest messages of one conversation, newest first. A message's author is the person's name, or the bot's id for a bot message.
export function listMessages(accountId: string, channel: string, force = false): Promise<SlackMessage[]> {
  const account = accountOf(accountId);
  if (!CHANNEL_ID.test(channel)) throw new AppError(400, "That is not a conversation id.");
  return cached(
    `messages:${account.id}:${channel}`,
    MESSAGES_TTL,
    async () => {
      const reply = await slackCall<{
        messages: { ts: string; user?: string; bot_id?: string; username?: string; text?: string }[];
      }>("conversations.history", account.token, { channel, limit: MESSAGES_PER_READ });
      const names = await namesOf(account);
      return reply.messages.map((message) => ({
        ts: message.ts,
        time: timeOf(message.ts),
        author: message.user ? (names[message.user] ?? message.user) : (message.username ?? message.bot_id ?? "Unknown"),
        text: resolveMentions(message.text ?? "", names),
      }));
    },
    force,
  );
}

// Slack writes a person as <@U123>, which becomes @name. The rest of Slack's markup is read by the client.
export function resolveMentions(text: string, names: Record<string, string>): string {
  return text.replace(/<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/g, (_, id: string) => `@${names[id] ?? id}`);
}

// The display names of a workspace's people, by user id, from users.list. Cached for a day.
function namesOf(account: SlackAccount): Promise<Record<string, string>> {
  return cached(`users:${account.teamId}`, NAMES_TTL, () => allNames(account.token));
}

async function allNames(token: string): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  let cursor: string | undefined;
  for (let page = 0; page < MAX_USER_PAGES; page++) {
    const reply = await slackCall<{
      members: { id: string; name?: string; real_name?: string; profile?: { display_name?: string } }[];
      response_metadata?: { next_cursor?: string };
    }>("users.list", token, { limit: 200, cursor });
    for (const member of reply.members) {
      names[member.id] = member.profile?.display_name || member.real_name || member.name || member.id;
    }
    cursor = reply.response_metadata?.next_cursor || undefined;
    if (!cursor) break;
  }
  return names;
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
