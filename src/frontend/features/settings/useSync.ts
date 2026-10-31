import { useEffect, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { SyncStatus } from "../../api/types";

// The GitHub sync state. The server runs the sign-in and each sync in the background, so this polls while either is in progress.
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

  const waiting = !!status && (status.running || !!status.device);
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(load, 1500);
    return () => window.clearInterval(timer);
  }, [waiting]);

  // Runs one action that answers with the new status, and shows the error it gives.
  async function act(request: Promise<SyncStatus>) {
    setError(undefined);
    try {
      setStatus(await request);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return {
    status,
    error,
    saveClientId: (clientId: string) => act(api.put<SyncStatus>("/api/sync/client-id", { clientId })),
    connect: () => act(api.post<SyncStatus>("/api/sync/connect", {})),
    run: () => act(api.post<SyncStatus>("/api/sync/run", {})),
    async disconnect() {
      setError(undefined);
      try {
        await api.post("/api/sync/disconnect", {});
        await load();
      } catch (err) {
        setError(errorText(err));
      }
    },
  };
}
