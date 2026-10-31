import { useRef, useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import type { AgentDetail, AgentMessage, RunEvent } from "../../api/types";

// How long to wait between asks for a run's new events.
const POLL_MS = 600;

// The messages of the open agent, and the reply being written into it.
// A run keeps going on the server even when the page closes, so opening an agent picks up a run that is still going.
// `onRunSaved` runs after a run finishes and its messages are saved.
export function useTranscript(onRunSaved: () => void) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [busy, setBusy] = useState(false);
  // The run this agent is following. It is cleared when the user moves to another agent, which stops the old follow loop.
  const following = useRef<string | undefined>(undefined);

  // Changes the last message, which is the assistant reply that is still arriving.
  function updateReply(change: (reply: AgentMessage) => AgentMessage) {
    setMessages((list) => [...list.slice(0, -1), change(list[list.length - 1])]);
  }

  // Shows the events the agent displays: text, tool names, and errors. Other events are ignored.
  function applyEvent(event: RunEvent) {
    if (event.type === "text") updateReply((r) => ({ ...r, text: r.text + (event.text ?? "") }));
    if (event.type === "tool_call") {
      const call = { id: event.id, name: event.name ?? "", input: JSON.stringify(event.input ?? null), output: null, isError: false };
      updateReply((r) => ({ ...r, tools: [...r.tools, call.name], calls: [...r.calls, call] }));
    }
    if (event.type === "tool_result") {
      updateReply((r) => ({
        ...r,
        calls: r.calls.map((call) => (call.id === event.id ? { ...call, output: event.output ?? "", isError: !!event.isError } : call)),
      }));
    }
    if (event.type === "error") updateReply((r) => ({ ...r, error: event.message ?? null }));
  }

  // Follows a run by asking the server for the events it has not shown yet, until the run finishes.
  // Then the saved messages replace the streamed ones, so the agent shows what was stored.
  function follow(runId: string, agentId: string) {
    following.current = runId;
    setBusy(true);
    setMessages((list) => [...list, { role: "assistant", text: "", tools: [], calls: [] }]);

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
      await load(agentId);
      onRunSaved();
    })().catch((err: unknown) => {
      following.current = undefined;
      setBusy(false);
      updateReply((r) => ({ ...r, error: errorText(err) }));
    });
  }

  // Opens an agent: its saved messages, and the run still going in it, if there is one.
  async function load(agentId: string): Promise<void> {
    following.current = undefined;
    setBusy(false);
    const data = await api.get<AgentDetail>(`/api/agents/${agentId}`);
    setMessages(data.messages);
    if (data.activeRunId) follow(data.activeRunId, agentId);
  }

  // Starts a run with the message. A failed start appears as an error in the transcript.
  async function send(agentId: string, prompt: string): Promise<void> {
    try {
      const data = await api.post<{ runId: string }>("/api/run", { agentId, prompt });
      setMessages((list) => [...list, { role: "user", text: prompt, tools: [], calls: [] }]);
      follow(data.runId, agentId);
    } catch (err) {
      setMessages((list) => [...list, { role: "assistant", text: "", tools: [], calls: [], error: errorText(err) }]);
    }
  }

  // Empties the transcript, for when its agent is deleted.
  function clear() {
    following.current = undefined;
    setBusy(false);
    setMessages([]);
  }

  return { messages, busy, load, send, clear };
}
