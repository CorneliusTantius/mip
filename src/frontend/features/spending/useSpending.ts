import { useEffect, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { NewSpendingEntry, SpendingEntry } from "../../api/types";

// The spending entries, newest first. Adding one saves it and re-reads the list, so the totals and categories follow the server.
export function useSpending() {
  const [entries, setEntries] = useState<SpendingEntry[]>();
  const [error, setError] = useState<string>();

  async function load() {
    try {
      setEntries((await api.get<{ entries: SpendingEntry[] }>("/api/spending")).entries);
      setError(undefined);
    } catch (err) {
      setError(errorText(err));
    }
  }

  // The dialog shows a refused entry, so the failure is thrown to it.
  async function add(input: NewSpendingEntry) {
    await api.post<SpendingEntry>("/api/spending", input);
    await load();
  }

  useEffect(() => {
    void load();
  }, []);

  return { entries, error, add };
}
