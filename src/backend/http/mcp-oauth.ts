import type { ServerResponse } from "node:http";
import { AppError, errorMessage } from "../app/errors.js";
import { completeSignIn } from "../app/mcp/manager.js";

// The page the browser lands on when the authorization server sends the user back. It finishes the sign-in that the MCP card started,
// and tells the user the result. It is a page, not JSON, since the user is looking at it.
export async function handleOAuthCallback(url: URL, res: ServerResponse): Promise<void> {
  const refused = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  try {
    if (refused) throw new AppError(400, `The server did not allow the sign-in: ${refused}`);
    if (!state || !code) throw new AppError(400, "The sign-in response has no code.");
    const name = await completeSignIn(state, code, url.searchParams.get("iss") ?? undefined);
    return page(res, 200, "Signed in", `${name} is signed in. You can close this tab and go back to mip.`);
  } catch (err) {
    return page(res, err instanceof AppError ? err.status : 500, "Sign-in failed", errorMessage(err));
  }
}

function page(res: ServerResponse, status: number, title: string, message: string): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title>` +
      `<body style="font-family: system-ui, sans-serif; padding: 2rem"><h1>${escape(title)}</h1><p>${escape(message)}</p></body>`,
  );
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
