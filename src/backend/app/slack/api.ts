import { AppError, errorMessage } from "../errors.js";

// Slack's Web API. Each call is one HTTPS request made with the token of one connected user, so it reads and writes as that user. A call
// Slack refuses, or rate-limits, becomes an AppError with the reason in words. Slack's error codes are listed at docs.slack.dev.

const API = "https://slack.com/api/";

export type SlackParams = Record<string, string | number | boolean | undefined>;

export async function slackCall<T>(method: string, token: string | undefined, params: SlackParams = {}): Promise<T> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) body.set(key, String(value));
  }
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(API + method, { method: "POST", headers, body });
  } catch (err) {
    throw new AppError(502, `Could not reach Slack: ${errorMessage(err)}`);
  }
  if (res.status === 429) {
    const wait = Number(res.headers.get("retry-after") ?? 60);
    throw new AppError(429, `Slack is limiting requests. Try again in ${wait} seconds.`);
  }
  const data = (await res.json().catch(() => ({ ok: false, error: "invalid_response" }))) as { ok: boolean; error?: string } & T;
  if (!data.ok) throw slackError(data.error);
  return data;
}

// The reason for a Slack error code, in words. A connection Slack no longer accepts is a 401, so the card asks to connect again.
function slackError(code: string | undefined): AppError {
  switch (code) {
    case "invalid_auth":
    case "not_authed":
    case "token_revoked":
    case "token_expired":
    case "account_inactive":
      return new AppError(401, "Slack no longer accepts this connection. Connect the account again in Settings → Slack.");
    case "missing_scope":
      return new AppError(403, "This connection lacks a Slack permission this needs. Connect the account again to grant it.");
    case "not_in_channel":
    case "channel_not_found":
      return new AppError(404, "This account cannot read that conversation.");
    case "ratelimited":
      return new AppError(429, "Slack is limiting requests. Try again shortly.");
    default:
      return new AppError(502, `Slack refused the request: ${code ?? "unknown error"}.`);
  }
}
