import type { McpServer } from "../../api/types";
import type { SourceTone } from "../../ui/SourceCard";

// The name the Gmail server has in the MCP card. The email card looks for a server with this name.
export const GMAIL_SERVER = "gmail";

// What the email card shows about Gmail: a badge and a line of detail. The view is what the card has read so far: whether the list
// has loaded, the Gmail server if it is listed, and the reason the list could not be read. Pure, so each state is checked without the page.
export function gmailStatus(view: { loaded: boolean; server?: McpServer; error?: string }): { status: string; tone: SourceTone; detail: string } {
  if (view.error) return { status: "Unavailable", tone: "error", detail: view.error };
  if (!view.loaded) return { status: "Checking", tone: "neutral", detail: "Reading the MCP servers." };
  const { server } = view;
  if (!server) return { status: "Not connected", tone: "neutral", detail: `Add Gmail in the MCP card, as a server named ${GMAIL_SERVER}.` };
  switch (server.status) {
    case "connecting":
      return { status: "Connecting", tone: "warning", detail: "Starting the Gmail server." };
    case "sign-in":
      return { status: "Needs sign-in", tone: "info", detail: "Sign in to Gmail from the MCP card." };
    case "error":
      return { status: "Failed", tone: "error", detail: server.error ?? "The Gmail server did not start." };
    case "connected": {
      const offered = server.tools.filter((tool) => tool.enabled).length;
      return { status: "Connected", tone: "success", detail: `${offered} of ${server.tools.length} tools offered to agents.` };
    }
  }
}
