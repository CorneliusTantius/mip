import { AppError } from "../errors.js";
import { cached } from "./cache.js";
import { slackCall } from "./api.js";
import { type SlackAccount, readSlackConfig } from "./config.js";

// Reading as a connected user: the conversations the user is in, the newest messages of one, and the replies in a thread. Answers are cached,
// so a reload does not call Slack again. Force refreshes a read. Names come from one users.list pass per workspace, not a call per person.
// Slack limits how often history can be read for apps outside its Marketplace, so a refused read says so.

export type SlackKind = "channel" | "private" | "group" | "dm";

export interface SlackConversation {
  id: string;
  name: string;
  kind: SlackKind;
}

export interface SlackMessage {
  ts: string;
  time: string;
  // The author's Slack user id, or "" for a bot or an app message.
  user: string;
  author: string;
  text: string;
  // How many replies the message has in its thread. A thread reply has 0.
  replies: number;
  // The timestamp of the thread the message belongs to, when it is in one.
  threadTs?: string;
}

interface RawMessage {
  ts: string;
  user?: string;
  bot_id?: string;
  username?: string;
  text?: string;
  reply_count?: number;
  thread_ts?: string;
}

const CHANNEL_ID = /^[A-Z0-9]{1,32}$/;
const THREAD_TS = /^\d+\.\d+$/;
const MAX_CONVERSATIONS = 200;
const MESSAGES_PER_READ = 30;
const REPLIES_PER_READ = 100;
// Pages of users.list read for names, 200 people each. Past this, the rest show as ids.
// shortcut: 50 pages of 200 people, so a bigger workspace shows some names as ids; raise it when that matters.
const MAX_USER_PAGES = 50;
const CONVERSATIONS_TTL = 10 * 60_000;
const MESSAGES_TTL = 2 * 60_000;
const NAMES_TTL = 24 * 60 * 60_000;
const UNREAD_TTL = 2 * 60_000;
const UNREAD_CONVERSATIONS = 40;
const UNREAD_PER_CONVERSATION = 100;
const UNREAD_BATCH = 5;
const UNREPLIED_PER_CONVERSATION = 50;

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

// Unread messages per conversation: the messages after the user's last read, not counting the user's own. Slack has no unread count for a user
// token, so each conversation is checked. Only the most recent conversations are counted, to stay under Slack's rate limits.
// shortcut: 40 conversations, 100 messages each, so a busier inbox shows a low count; raise these when Slack's limits allow.
export function unreadCounts(accountId: string, force = false): Promise<Record<string, number>> {
  const account = accountOf(accountId);
  return cached(
    `unread:${account.id}`,
    UNREAD_TTL,
    async () => {
      const conversations = (await listConversations(accountId, force)).slice(0, UNREAD_CONVERSATIONS);
      const counts: Record<string, number> = {};
      for (let i = 0; i < conversations.length; i += UNREAD_BATCH) {
        await Promise.all(
          conversations.slice(i, i + UNREAD_BATCH).map(async (conversation) => {
            counts[conversation.id] = await unreadIn(account, conversation.id);
          }),
        );
      }
      return counts;
    },
    force,
  );
}

async function unreadIn(account: SlackAccount, channel: string): Promise<number> {
  try {
    const info = await slackCall<{ channel: { last_read?: string } }>("conversations.info", account.token, { channel });
    const reply = await slackCall<{ messages: { user?: string }[] }>("conversations.history", account.token, {
      channel,
      oldest: info.channel.last_read || "0",
      limit: UNREAD_PER_CONVERSATION,
    });
    return reply.messages.filter((message) => message.user !== account.userId).length;
  } catch {
    // A conversation that cannot be read counts as none, so one refused read does not hide the rest.
    return 0;
  }
}

export interface UnrepliedMessage {
  conversation: SlackConversation;
  message: SlackMessage;
}

// The messages from others that the user has not answered, newest first, each with its conversation. A message counts when no message of the
// user comes after it in its conversation, and it is in a direct or group message, or it mentions the user. Bots are left out. Only the most
// recent conversations are read, and thread replies are not, so a reply in a thread can show as unanswered.
// shortcut: 40 conversations, 50 messages each, so an older unanswered message can be missed; raise these when Slack's limits allow.
export function unrepliedMessages(accountId: string, force = false): Promise<UnrepliedMessage[]> {
  const account = accountOf(accountId);
  return cached(
    `unreplied:${account.id}`,
    UNREAD_TTL,
    async () => {
      const conversations = (await listConversations(accountId, force)).slice(0, UNREAD_CONVERSATIONS);
      const names = await namesOf(account);
      const found: UnrepliedMessage[] = [];
      for (let i = 0; i < conversations.length; i += UNREAD_BATCH) {
        const batch = conversations.slice(i, i + UNREAD_BATCH);
        const reads = await Promise.all(batch.map((conversation) => unansweredIn(account, conversation)));
        batch.forEach((conversation, j) => {
          for (const message of reads[j]) found.push({ conversation, message: toMessage(message, names) });
        });
      }
      return found.sort((a, b) => Number(b.message.ts) - Number(a.message.ts));
    },
    force,
  );
}

// The messages in one conversation that the user has not answered. Slack lists the newest first, so the messages above the user's newest one
// are the unanswered ones.
async function unansweredIn(account: SlackAccount, conversation: SlackConversation): Promise<RawMessage[]> {
  try {
    const reply = await slackCall<{ messages: RawMessage[] }>("conversations.history", account.token, {
      channel: conversation.id,
      limit: UNREPLIED_PER_CONVERSATION,
    });
    const newestOwn = reply.messages.findIndex((message) => message.user === account.userId);
    const open = newestOwn === -1 ? reply.messages : reply.messages.slice(0, newestOwn);
    const addressed = conversation.kind === "dm" || conversation.kind === "group";
    const mention = new RegExp(`<@${account.userId}(?:\\|[^>]*)?>`);
    return open.filter((message) => message.user && message.user !== account.userId && (addressed || mention.test(message.text ?? "")));
  } catch {
    // A conversation that cannot be read has none, so one refused read does not hide the rest.
    return [];
  }
}

// The newest messages of one conversation, newest first. Replies inside threads are left out; their parent shows how many there are.
export function listMessages(accountId: string, channel: string, force = false): Promise<SlackMessage[]> {
  const account = accountOf(accountId);
  if (!CHANNEL_ID.test(channel)) throw new AppError(400, "That is not a conversation id.");
  return cached(
    `messages:${account.id}:${channel}`,
    MESSAGES_TTL,
    async () => {
      const reply = await slackCall<{ messages: RawMessage[] }>("conversations.history", account.token, {
        channel,
        limit: MESSAGES_PER_READ,
      });
      const names = await namesOf(account);
      return reply.messages.filter((message) => !message.thread_ts || message.thread_ts === message.ts).map((message) => toMessage(message, names));
    },
    force,
  );
}

// The replies in one thread, oldest first, with the parent message first. The thread is named by its parent's timestamp.
export function listReplies(accountId: string, channel: string, threadTs: string, force = false): Promise<SlackMessage[]> {
  const account = accountOf(accountId);
  if (!CHANNEL_ID.test(channel) || !THREAD_TS.test(threadTs)) throw new AppError(400, "That is not a thread.");
  return cached(
    `replies:${account.id}:${channel}:${threadTs}`,
    MESSAGES_TTL,
    async () => {
      const reply = await slackCall<{ messages: RawMessage[] }>("conversations.replies", account.token, {
        channel,
        ts: threadTs,
        limit: REPLIES_PER_READ,
      });
      const names = await namesOf(account);
      return reply.messages.map((message) => toMessage(message, names));
    },
    force,
  );
}

// Slack writes a person as <@U123>, which becomes @name. The rest of Slack's markup is read by the client.
export function resolveMentions(text: string, names: Record<string, string>): string {
  return text.replace(/<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/g, (_, id: string) => `@${names[id] ?? id}`);
}

function toMessage(message: RawMessage, names: Record<string, string>): SlackMessage {
  const user = message.user ?? "";
  return {
    ts: message.ts,
    time: timeOf(message.ts),
    user,
    author: user ? (names[user] ?? user) : (message.username ?? message.bot_id ?? "Unknown"),
    text: resolveMentions(message.text ?? "", names),
    replies: message.reply_count ?? 0,
    ...(message.thread_ts ? { threadTs: message.thread_ts } : {}),
  };
}

// The display names of a workspace's people, by user id, from users.list. Cached for a day.
export function namesOf(account: SlackAccount): Promise<Record<string, string>> {
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

// The connected account with this id. Other modules use it, so a request with an unknown id is refused in one place.
export function accountOf(id: string): SlackAccount {
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
