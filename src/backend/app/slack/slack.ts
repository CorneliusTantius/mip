import { AppError } from "../errors.js";
import { forgetCache } from "./cache.js";
import { type SlackAccountView, type SlackConfigProblem, readSlackConfig, removeSlackAccount, saveSlackApp, viewOf } from "./config.js";
import { SLACK_USER_SCOPES, slackRedirectUri } from "./connect.js";

// The Slack connection as the card and its dialog use it: the app's client ID (never its secret), the connected accounts, and any part of
// slack.json that could not be read.

export interface SlackReply {
  app: { clientId: string } | null;
  redirectUri: string;
  // The user scopes the Slack app must list under User Token Scopes, so the sign-in is allowed.
  scopes: string[];
  // An app manifest for Slack's "From a manifest" page, with the same redirect address and scopes.
  manifest: string;
  accounts: SlackAccountView[];
  problems: SlackConfigProblem[];
}

export function slackReply(): SlackReply {
  const config = readSlackConfig();
  return {
    app: config.app ? { clientId: config.app.clientId } : null,
    redirectUri: slackRedirectUri,
    scopes: SLACK_USER_SCOPES,
    manifest: slackManifest(),
    accounts: config.accounts.map(viewOf),
    problems: config.problems,
  };
}

// The manifest a new Slack app is created from. Socket Mode is on, and the user events are the message events a socket will receive.
function slackManifest(): string {
  return JSON.stringify(
    {
      display_information: { name: "mip" },
      features: {},
      oauth_config: { redirect_urls: [slackRedirectUri], scopes: { user: SLACK_USER_SCOPES } },
      settings: {
        event_subscriptions: { user_events: ["message.channels", "message.groups", "message.im", "message.mpim"] },
        socket_mode_enabled: true,
        org_deploy_enabled: false,
        token_rotation_enabled: false,
      },
    },
    null,
    2,
  );
}

// Saves the app's client ID and secret. A client ID is digits and a dot, and both values are required.
export function saveSlackAppInput(input: unknown): SlackReply {
  const body = isRecord(input) ? input : {};
  const clientId = String(body.clientId ?? "").trim();
  const clientSecret = String(body.clientSecret ?? "").trim();
  if (!/^\d+\.\d+$/.test(clientId)) throw new AppError(400, "The client ID looks like 1234567890.1234567890. Copy it from the Slack app's Basic Information page.");
  if (!clientSecret) throw new AppError(400, "Enter the client secret from the same page.");
  saveSlackApp({ clientId, clientSecret });
  return slackReply();
}

// Disconnects an account. Its token is removed from slack.json; nothing is revoked in Slack.
export function deleteSlackAccount(id: string): SlackReply {
  removeSlackAccount(id);
  forgetCache([`conversations:${id}`, `messages:${id}:`, `replies:${id}:`, `unread:${id}`, `unread-messages:${id}`]);
  return slackReply();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
