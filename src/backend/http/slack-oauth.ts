import type { ServerResponse } from "node:http";
import { AppError, errorMessage } from "../app/errors.js";
import { completeConnect } from "../app/slack/connect.js";
import { page } from "./page.js";

// The page the browser lands on when Slack sends the user back. It finishes the connection that Settings started and says what happened.
export async function handleSlackCallback(url: URL, res: ServerResponse): Promise<void> {
  const refused = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  try {
    if (refused) throw new AppError(400, `Slack did not allow the connection: ${refused}`);
    if (!state || !code) throw new AppError(400, "Slack's response has no code.");
    const account = await completeConnect(state, code);
    return page(res, 200, "Connected", `${account.userName} is connected to ${account.teamName}. You can close this tab and go back to mip.`);
  } catch (err) {
    return page(res, err instanceof AppError ? err.status : 500, "Connection failed", errorMessage(err));
  }
}
