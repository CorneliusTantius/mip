import { useEffect, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { McpServer, McpStatus } from "../../api/types";
import { usePolling } from "../../ui/hooks";
import { GMAIL_SERVER } from "./gmailStatus";

// How often the card re-reads the list while the Gmail server is starting, or waiting for the user to sign in.
const WAITING_POLL_MS = 1500;

// The Gmail server from the MCP list, and why the list could not be read. The card re-reads the list while the server is starting or
// waiting for sign-in, so its badge follows the start.
export function useGmailServer() {
  const [loaded, setLoaded] = useState(false);
  const [server, setServer] = useState<McpServer>();
  const [error, setError] = useState<string>();

  async function load() {
    try {
      const status = await api.get<McpStatus>("/api/mcp");
      setServer(status.servers.find((candidate) => candidate.name === GMAIL_SERVER));
      setError(undefined);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const waiting = server?.status === "connecting" || server?.status === "sign-in";
  usePolling(() => void load(), WAITING_POLL_MS, waiting);

  return { loaded, server, error };
}
