import { useRef, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { ChatDetail, ChatMessage, RunEvent } from "../../api/types";

// How long to wait between asks for a run's new events.
const POLL_MS = 600;

// The messages of the open chat, and the reply being written into it.
// A run keeps going on the server even when the page closes, so opening a chat picks up a run that is still going.
// `onRunSaved` runs after a run finishes and its messages are saved.
export function useTranscript(onRunSaved: () => void) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  // The run this chat is following. It is cleared when the user moves to another chat, which stops the old follow loop.
  const following = useRef<string | undefined>(undefined);

  // Changes the last message, which is the assistant reply that is still arriving.
  function updateReply(change: (reply: ChatMessage) => ChatMessage) {
    setMessages((list) => [...list.slice(0, -1), change(list[list.length - 1])]);
  }

  // Shows the events the chat displays: text, tool names, and errors. Other events are ignored.
  function applyEvent(event: RunEvent) {
    if (event.type === "text") updateReply((r) => ({ ...r, text: r.text + (event.text ?? "") }));
    if (event.type === "tool_call") updateReply((r) => ({ ...r, tools: [...r.tools, event.name ?? ""] }));
    if (event.type === "error") updateReply((r) => ({ ...r, error: event.message ?? null }));
  }

  // Follows a run by asking the server for the events it has not shown yet, until the run finishes.
  // Then the saved messages replace the streamed ones, so the chat shows what was stored.
  function follow(runId: string, sessionId: string) {
    following.current = runId;
    setBusy(true);
    setMessages((list) => [...list, { role: "assistant", text: "", tools: [] }]);

    (async () => {
      let after = 0;
      for (;;) {
        const data = await api.get<{ status: string; events: { seq: number; event: RunEvent }[] }>(`/api/runs/${runId}/events?after=${after}`);
        if (following.current !== runId) return;
        for (const { seq, event } of data.events) {
          after = seq;
          applyEvent(event);
        }
        if (data.status !== "running") break;
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        if (following.current !== runId) return;
      }
      following.current = undefined;
      setBusy(false);
      await load(sessionId);
      onRunSaved();
    })().catch((err: unknown) => {
      following.current = undefined;
      setBusy(false);
      updateReply((r) => ({ ...r, error: errorText(err) }));
    });
  }

  // Opens a chat: its saved messages, and the run still going in it, if there is one.
  async function load(sessionId: string): Promise<void> {
    following.current = undefined;
    setBusy(false);
    const data = await api.get<ChatDetail>(`/api/sessions/${sessionId}`);
    setMessages(data.messages);
    if (data.activeRunId) follow(data.activeRunId, sessionId);
  }

  // Starts a run with the message. A failed start appears as an error in the transcript.
  async function send(sessionId: string, prompt: string): Promise<void> {
    try {
      const data = await api.post<{ runId: string }>("/api/run", { sessionId, prompt });
      setMessages((list) => [...list, { role: "user", text: prompt, tools: [] }]);
      follow(data.runId, sessionId);
    } catch (err) {
      setMessages((list) => [...list, { role: "assistant", text: "", tools: [], error: errorText(err) }]);
    }
  }

  // Empties the transcript, for when its chat is deleted.
  function clear() {
    following.current = undefined;
    setBusy(false);
    setMessages([]);
  }

  return { messages, busy, load, send, clear };
}
