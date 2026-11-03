import type { ToolSpec } from "../../adapters/contract.js";
import { type MailAccount, readMailAccounts } from "../mail/accounts.js";
import { listMailMessages, openMailMessage } from "../mail/mail.js";
import { slackCall } from "../slack/api.js";
import { type SlackAccount, readSlackConfig } from "../slack/config.js";
import { listConversations, listMessages, listReplies, namesOf, resolveMentions, unrepliedMessages } from "../slack/read.js";
import { ok } from "./result.js";

// Read-only tools for bots over the connected mail and Slack accounts. They never send, mark mail read, or change anything. What they read
// goes to the model, so a bot sees the mail or messages it asks for. Sending is a separate, approved step and is not offered here.

const MAX_MAIL = 25;
const MAX_SEARCH = 20;
const MAX_READ = 30;
const MAX_UNREPLIED = 30;
const MAX_SNIPPET = 400;

// The mail account a tool names: its id, its address, or its label. With one account connected, it can be left out.
function mailAccountFor(name: unknown): MailAccount {
  const accounts = readMailAccounts().accounts;
  const wanted = String(name ?? "").trim().toLowerCase();
  if (!wanted && accounts.length === 1) return accounts[0];
  const found = accounts.find((account) => account.id === wanted || account.label.toLowerCase() === wanted || account.user.toLowerCase() === wanted);
  if (!found) throw new Error(`Name the mail account. Connected: ${accounts.map((account) => account.label).join(", ") || "none"}.`);
  return found;
}

// The Slack account a tool names: its id, its name, or its workspace. With one account connected, it can be left out.
function slackAccountFor(name: unknown): SlackAccount {
  const accounts = readSlackConfig().accounts;
  const wanted = String(name ?? "").trim().toLowerCase();
  if (!wanted && accounts.length === 1) return accounts[0];
  const found = accounts.find(
    (account) => account.id.toLowerCase() === wanted || account.userName.toLowerCase() === wanted || account.teamName.toLowerCase() === wanted,
  );
  if (!found) throw new Error(`Name the Slack account. Connected: ${accounts.map((account) => account.userName).join(", ") || "none"}.`);
  return found;
}

// A text on one line, cut when it is long.
function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_SNIPPET ? `${flat.slice(0, MAX_SNIPPET)}…` : flat;
}

function clampCount(value: unknown, fallback: number, max: number): number {
  const count = Math.floor(Number(value));
  return Number.isFinite(count) && count >= 1 ? Math.min(count, max) : fallback;
}

export const mailListTool: ToolSpec = {
  name: "mail_list",
  guide: "Lists the newest mail of a connected mail account: its UID, date, sender, and subject, newest first. Read it to find a message, then open one with mail_read. Use it when the user asks what mail came in, or about a sender or subject. It does not mark anything read.",
  description: "List the newest mail of a connected account: UID, date, sender, subject. Read-only.",
  inputSchema: {
    type: "object",
    properties: {
      account: { type: "string", description: "The mail account's label or address. Can be left out when only one account is connected" },
      count: { type: "number", description: `How many messages, newest first. At most ${MAX_MAIL}. Default 10` },
    },
  },
  async run({ account, count }) {
    const found = mailAccountFor(account);
    const listed = await listMailMessages(found.id, clampCount(count, 10, MAX_MAIL));
    if (listed.messages.length === 0) return ok(`${found.label} has no mail.`);
    return ok(
      listed.messages
        .map((m) => `${m.uid} | ${m.date ? m.date.slice(0, 16).replace("T", " ") : "no date"} | ${m.seen ? "" : "unread "}| ${m.from || "unknown"} | ${m.subject || "(no subject)"}`)
        .join("\n"),
    );
  },
};

export const mailReadTool: ToolSpec = {
  name: "mail_read",
  guide: "Reads one mail message by its UID from mail_list: its sender, recipients, date, and text. The text may be cut; the result says so. Reading does not mark the message read.",
  description: "Read one mail message by UID, as sender, recipients, date, and text. Read-only.",
  inputSchema: {
    type: "object",
    properties: {
      account: { type: "string", description: "The mail account's label or address. Can be left out when only one account is connected" },
      uid: { type: "number", description: "The message's UID, from mail_list" },
    },
    required: ["uid"],
  },
  async run({ account, uid }) {
    const found = mailAccountFor(account);
    const message = await openMailMessage(found.id, String(uid));
    const head = `From: ${message.from || "unknown"}\nTo: ${message.to || "unknown"}\nDate: ${message.date ?? "unknown"}\nSubject: ${message.subject || "(no subject)"}`;
    const cut = message.truncated ? "\n\n[The message is longer; only its start is shown.]" : "";
    return ok(`${head}\n\n${message.text || "(no text)"}${cut}`);
  },
};

export const slackSearchTool: ToolSpec = {
  name: "slack_search",
  guide: "Searches the Slack messages the connected account can see, with Slack's search words (such as in:#channel or from:@name). Each result shows its channel and author. Use it to find a message by its words; read the conversation with slack_read.",
  description: "Search Slack messages the connected account can see. Read-only.",
  inputSchema: {
    type: "object",
    properties: {
      account: { type: "string", description: "The Slack account's name or workspace. Can be left out when only one account is connected" },
      query: { type: "string", description: "The words to search for" },
      count: { type: "number", description: `How many results. At most ${MAX_SEARCH}. Default 10` },
    },
    required: ["query"],
  },
  async run({ account, query, count }) {
    const found = slackAccountFor(account);
    const text = String(query ?? "").trim();
    if (!text) throw new Error("query is required");
    const reply = await slackCall<{
      messages: { matches: { ts: string; user?: string; username?: string; text?: string; channel: { id: string; name?: string } }[] };
    }>("search.messages", found.token, { query: text, count: clampCount(count, 10, MAX_SEARCH), sort: "timestamp", sort_dir: "desc" });
    const matches = reply.messages.matches;
    if (matches.length === 0) return ok("No message matches.");
    const names = await namesOf(found);
    return ok(
      matches
        .map((m) => {
          const author = m.user ? (names[m.user] ?? m.user) : (m.username ?? "unknown");
          return `#${m.channel.name ?? m.channel.id} (${m.channel.id}) ${author}: ${oneLine(resolveMentions(m.text ?? "", names))}`;
        })
        .join("\n"),
    );
  },
};

export const slackReadTool: ToolSpec = {
  name: "slack_read",
  guide: "Reads the newest messages of one Slack conversation, oldest first, or the replies of a thread when thread_ts is given. The conversation is a channel id, or a channel's name such as general. Use it after slack_search, or when the user names a channel.",
  description: "Read the newest messages of a Slack conversation, or the replies of a thread. Read-only.",
  inputSchema: {
    type: "object",
    properties: {
      account: { type: "string", description: "The Slack account's name or workspace. Can be left out when only one account is connected" },
      channel: { type: "string", description: "The conversation: its id (C…), or its name such as general" },
      thread_ts: { type: "string", description: "The parent message's timestamp, to read that thread" },
    },
    required: ["channel"],
  },
  async run({ account, channel, thread_ts }) {
    const found = slackAccountFor(account);
    let channelId = String(channel ?? "").trim();
    if (!/^[A-Z0-9]{1,32}$/.test(channelId)) {
      const name = channelId.replace(/^#/, "").toLowerCase();
      const match = (await listConversations(found.id)).find((conversation) => conversation.name.toLowerCase() === name);
      if (!match) throw new Error(`No conversation called "${channel}" for this account.`);
      channelId = match.id;
    }
    const messages = thread_ts
      ? (await listReplies(found.id, channelId, String(thread_ts))).slice(-MAX_READ)
      : (await listMessages(found.id, channelId)).slice(0, MAX_READ).reverse();
    if (messages.length === 0) return ok("No messages.");
    return ok(messages.map((m) => `${m.time.slice(0, 16).replace("T", " ")} ${m.author}: ${oneLine(m.text)}`).join("\n"));
  },
};

export const slackUnrepliedTool: ToolSpec = {
  name: "slack_unreplied",
  guide: "Lists the Slack messages from others that the connected account has not answered yet, newest first, with the conversation each one is in. Direct and group messages count, and so do channel messages that mention the account. Give query to keep only the messages that contain those words. Use it when the user asks what they still need to answer on Slack. It covers the 40 most recent conversations, and it does not send or mark anything.",
  description: "List Slack messages from others that the account has not answered, newest first, with their conversation. Can keep only those that contain some words. Read-only.",
  inputSchema: {
    type: "object",
    properties: {
      account: { type: "string", description: "The Slack account's name or workspace. Can be left out when only one account is connected" },
      query: { type: "string", description: "Keep only the unreplied messages that contain these words. Can be left out" },
      count: { type: "number", description: `How many messages, newest first. At most ${MAX_UNREPLIED}. Default 10` },
    },
  },
  async run({ account, query, count }) {
    const found = slackAccountFor(account);
    const text = String(query ?? "").trim();
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    const open = (await unrepliedMessages(found.id)).filter(({ message }) => {
      const body = message.text.toLowerCase();
      return words.every((word) => body.includes(word));
    });
    if (open.length === 0) return ok(words.length > 0 ? `No unreplied message contains "${text}".` : "No unreplied messages.");
    const shown = open.slice(0, clampCount(count, 10, MAX_UNREPLIED));
    const conversations = new Set(open.map(({ conversation }) => conversation.id)).size;
    const header = `${open.length} unreplied message(s) in ${conversations} conversation(s).${shown.length < open.length ? ` Showing the newest ${shown.length}.` : ""}`;
    const lines = shown.map(({ conversation, message }) => {
      const where = conversation.kind === "channel" || conversation.kind === "private" ? `#${conversation.name}` : conversation.name;
      return `${message.time.slice(0, 16).replace("T", " ")} ${where} (${conversation.id}) ${message.author}: ${oneLine(message.text)}`;
    });
    return ok([header, ...lines].join("\n"));
  },
};

// The read tools for bots. They are deferred: a bot finds them with tool_search and runs them with tool_call.
export const SOCIAL_TOOLS: ToolSpec[] = [mailListTool, mailReadTool, slackSearchTool, slackReadTool, slackUnrepliedTool];
