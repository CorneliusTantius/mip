import { useEffect, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { McpStatus, NewMcpServer } from "../../api/types";
import { usePolling } from "../../ui/hooks";

// How often the card re-reads the servers while one is starting, or waiting for its sign-in to finish in the browser.
const WAITING_POLL_MS = 1500;

// The MCP servers and their state. While one is starting or waiting for sign-in, it re-reads them, so the card follows the start and the
// sign-in. Each change replies with the new state. Reload, and signing in, show a failure on the card. Adding and removing hand a failure
// to the dialog or the confirm box that asked, so the reason is shown where the user is looking.
export function useMcpServers() {
  const [status, setStatus] = useState<McpStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function load() {
    try {
      setStatus(await api.get<McpStatus>("/api/mcp"));
      setError(undefined);
    } catch (err) {
      setError(errorText(err));
    }
  }

  // A change whose failure is shown on the card. Returns the new state, or nothing when the change failed.
  async function change(run: () => Promise<McpStatus>): Promise<McpStatus | undefined> {
    setBusy(true);
    setError(undefined);
    try {
      const next = await run();
      setStatus(next);
      return next;
    } catch (err) {
      setError(errorText(err));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  // A change whose caller shows the failure. The error is thrown to it.
  async function apply(run: () => Promise<McpStatus>): Promise<McpStatus> {
    setBusy(true);
    try {
      const next = await run();
      setStatus(next);
      return next;
    } finally {
      setBusy(false);
    }
  }

  const reload = () => change(() => api.post<McpStatus>("/api/mcp/reload"));
  const signIn = (name: string) => change(() => api.post<McpStatus>(`/api/mcp/${encodeURIComponent(name)}/sign-in`, {}));
  const add = (server: NewMcpServer) => apply(() => api.post<McpStatus>("/api/mcp", server));
  const remove = (name: string) => apply(() => api.del<McpStatus>(`/api/mcp/${encodeURIComponent(name)}`));

  useEffect(() => {
    void load();
  }, []);

  const waiting = status?.servers.some((server) => server.status === "connecting" || server.status === "sign-in") ?? false;
  usePolling(() => void load(), WAITING_POLL_MS, waiting);

  return { status, busy, error, reload, signIn, add, remove };
}
