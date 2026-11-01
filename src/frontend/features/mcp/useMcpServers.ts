import { useEffect, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { McpStatus } from "../../api/types";
import { usePolling } from "../../ui/hooks";

// How often the card re-reads the servers while one of them is still starting.
const STARTING_POLL_MS = 1500;

// The MCP servers and their state. While one is starting, it re-reads them, so the card follows the start. Reload reconnects from the file.
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

  async function reload() {
    setBusy(true);
    setError(undefined);
    try {
      setStatus(await api.post<McpStatus>("/api/mcp/reload"));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const starting = status?.servers.some((server) => server.status === "connecting") ?? false;
  usePolling(() => void load(), STARTING_POLL_MS, starting);

  return { status, busy, error, reload };
}
