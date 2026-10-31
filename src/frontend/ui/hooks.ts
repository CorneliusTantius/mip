import { useEffect, useRef } from "preact/hooks";
import { subscribe } from "../api/events";

// Calls `fn` every `ms` milliseconds while `enabled` is true. It always runs the latest `fn`, so it sees current state.
export function usePolling(fn: () => void, ms: number, enabled = true): void {
  const latest = useRef(fn);
  latest.current = fn;

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => latest.current(), ms);
    return () => clearInterval(timer);
  }, [enabled, ms]);
}

// Runs `handler` whenever the named browser-wide event (see api/events.ts) is sent, for as long as the component is mounted.
export function useAnnouncement(name: string, handler: () => void): void {
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => subscribe(name, () => latest.current()), [name]);
}
