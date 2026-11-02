import { randomBytes } from "node:crypto";
import { HOST, PORT } from "../config.js";
import { AppError } from "../errors.js";
import { slackCall } from "./api.js";
import { type SlackAccount, readSlackConfig, saveSlackAccount, viewOf, type SlackAccountView } from "./config.js";

// Connecting with the app's OAuth flow. The browser goes to Slack, the user approves, and Slack sends the browser back to the callback
// below with a code. The code is exchanged for the user's token, which acts as that user. Only user scopes are asked for, so nothing
// posts as a bot.

export const SLACK_CALLBACK_PATH = "/api/slack/oauth/callback";

// The user scopes for reading and writing as the user: conversations, history, search, messages, reactions, pins, stars, files, and reminders.
// A connection made before a change here must sign in again to get the new scopes.
export const SLACK_USER_SCOPES = [
  "users:read",
  "users.profile:read",
  "team:read",
  "usergroups:read",
  "channels:read",
  "groups:read",
  "im:read",
  "mpim:read",
  "channels:history",
  "groups:history",
  "im:history",
  "mpim:history",
  "search:read.public",
  "search:read.private",
  "search:read.im",
  "search:read.mpim",
  "search:read.files",
  "search:read.users",
  "chat:write",
  "channels:write",
  "channels:join",
  "groups:write",
  "im:write",
  "mpim:write",
  "reactions:read",
  "reactions:write",
  "pins:read",
  "pins:write",
  "stars:read",
  "stars:write",
  "files:read",
  "files:write",
  "reminders:read",
  "reminders:write",
];

// The address Slack must return to. It goes into the Slack app's Redirect URLs, so it is shown in the Slack card's Accounts dialog.
// Slack's docs ask for HTTPS, so a public HTTPS address (a tunnel or nginx in front) can be set with MIP_SLACK_REDIRECT_URI.
export const slackRedirectUri = process.env.MIP_SLACK_REDIRECT_URI?.trim() || `http://${HOST}:${PORT}${SLACK_CALLBACK_PATH}`;

const STATE_MINUTES = 10;
// Sign-ins that have started and not finished, by their state. A state is used once.
const pending = new Map<string, number>();

// Starts a connection: the Slack page to open, with a state that the callback must return.
export function startConnect(): { url: string } {
  const app = readSlackConfig().app;
  if (!app) throw new AppError(400, "Save the Slack app's client ID and secret first.");
  const now = Date.now();
  for (const [state, expires] of pending) if (expires < now) pending.delete(state);

  const state = randomBytes(16).toString("hex");
  pending.set(state, now + STATE_MINUTES * 60_000);
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", app.clientId);
  url.searchParams.set("user_scope", SLACK_USER_SCOPES.join(","));
  url.searchParams.set("redirect_uri", slackRedirectUri);
  url.searchParams.set("state", state);
  return { url: url.toString() };
}

// Finishes a connection from the callback. The state must be one this app started and not yet used.
export async function completeConnect(state: string, code: string): Promise<SlackAccountView> {
  const expires = pending.get(state);
  pending.delete(state);
  if (expires === undefined || expires < Date.now()) throw new AppError(400, "This sign-in expired or was already used. Start it again from the Slack card.");
  const app = readSlackConfig().app;
  if (!app) throw new AppError(400, "The Slack app's client ID and secret are no longer saved.");

  const reply = await slackCall<{
    authed_user?: { id: string; access_token?: string };
    team?: { id: string; name: string };
  }>("oauth.v2.access", undefined, {
    client_id: app.clientId,
    client_secret: app.clientSecret,
    code,
    redirect_uri: slackRedirectUri,
  });
  const token = reply.authed_user?.access_token;
  if (!token || !reply.authed_user || !reply.team) {
    throw new AppError(502, "Slack did not return a user token. Check the app's user scopes in Slack, then connect again.");
  }
  return save(token, reply.team.id, reply.team.name, reply.authed_user.id);
}

// Connects with a user token pasted from Slack's app page, for when the OAuth flow cannot be used.
export async function connectWithToken(token: string): Promise<SlackAccountView> {
  const trimmed = token.trim();
  if (!trimmed.startsWith("xoxp-")) throw new AppError(400, "Paste a Slack user token, which starts with xoxp-.");
  const who = await slackCall<{ user_id: string; team_id: string; team: string }>("auth.test", trimmed);
  return save(trimmed, who.team_id, who.team, who.user_id);
}

// The display name of a user, as the token's workspace shows it. Falls back to the id, so a name never blocks a connection.
export async function userNameOf(token: string, userId: string): Promise<string> {
  try {
    const reply = await slackCall<{ user: { name?: string; real_name?: string; profile?: { display_name?: string } } }>("users.info", token, {
      user: userId,
    });
    return reply.user.profile?.display_name || reply.user.real_name || reply.user.name || userId;
  } catch {
    return userId;
  }
}

async function save(token: string, teamId: string, teamName: string, userId: string): Promise<SlackAccountView> {
  const account: SlackAccount = {
    id: `${teamId}.${userId}`,
    teamId,
    teamName,
    userId,
    userName: await userNameOf(token, userId),
    token,
  };
  saveSlackAccount(account);
  return viewOf(account);
}
