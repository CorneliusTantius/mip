import { useState } from "preact/hooks";
import type { ModelOption, Agent } from "../../api/types";
import { OptionDropdown } from "../../ui/OptionDropdown";

// Thinking levels as people read them.
const THINKING_LABELS: Record<string, string> = {
  off: "Thinking off",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

// The model and thinking dropdowns above the message box, and the box itself. A change applies to the next message.
export function Composer({
  agent,
  models,
  busy,
  onSend,
  onChangeSettings,
}: {
  agent?: Agent;
  models: ModelOption[];
  busy: boolean;
  onSend: (prompt: string) => void;
  onChangeSettings: (changes: { model?: string; thinking?: string }) => void;
}) {
  const [draft, setDraft] = useState("");
  const model = models.find((m) => m.id === (agent?.model ?? ""));
  const levels = model?.thinkingLevels ?? [];

  function send(e: Event) {
    e.preventDefault();
    const prompt = draft.trim();
    if (!prompt || busy || !agent) return;
    setDraft("");
    onSend(prompt);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-2">
        <OptionDropdown
          label="Model"
          value={agent?.model ?? ""}
          options={models.map((m) => ({ value: m.id, label: m.name }))}
          placeholder={agent ? "No models available" : "Model"}
          disabled={!agent || !models.length}
          onChange={(next) => onChangeSettings({ model: next })}
        />
        <OptionDropdown
          label="Thinking"
          value={agent?.thinking ?? ""}
          options={[{ value: "", label: "Default thinking" }, ...levels.map((level) => ({ value: level, label: THINKING_LABELS[level] ?? level }))]}
          placeholder="Default thinking"
          disabled={!agent || !levels.length}
          onChange={(next) => onChangeSettings({ thinking: next })}
        />
      </div>

      <form className="join w-full" onSubmit={send}>
        <input
          className="input join-item w-full"
          placeholder={agent ? (busy ? "This agent is still working" : "Message mip") : "Create an agent first"}
          value={draft}
          disabled={busy || !agent}
          onInput={(e) => setDraft(e.currentTarget.value)}
        />
        <button className="btn btn-primary join-item" disabled={busy || !agent || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
