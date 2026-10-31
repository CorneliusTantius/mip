import { useEffect, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { SyncStatus } from "../../api/types";

// The GitHub sync state. The server runs each sync in the background, so this polls while one is running.
export function useSync() {
  const [status, setStatus] = useState<SyncStatus>();
  const [error, setError] = useState<string>();

  async function load() {
    try {
      setStatus(await api.get<SyncStatus>("/api/sync"));
    } catch (err) {
      setError(errorText(err));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const running = !!status?.running;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(load, 1500);
    return () => window.clearInterval(timer);
  }, [running]);

  async function run() {
    setError(undefined);
    try {
      setStatus(await api.post<SyncStatus>("/api/sync/run", {}));
    } catch (err) {
      setError(errorText(err));
    }
  }

  return { status, error, run };
}
