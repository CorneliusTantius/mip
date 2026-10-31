import { useState } from "preact/hooks";
import type { ModelOption, Session } from "../../api/types";
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
  session,
  models,
  busy,
  onSend,
  onChangeSettings,
}: {
  session?: Session;
  models: ModelOption[];
  busy: boolean;
  onSend: (prompt: string) => void;
  onChangeSettings: (changes: { model?: string; thinking?: string }) => void;
}) {
  const [draft, setDraft] = useState("");
  const model = models.find((m) => m.id === (session?.model ?? ""));
  const levels = model?.thinkingLevels ?? [];

  function send(e: Event) {
    e.preventDefault();
    const prompt = draft.trim();
    if (!prompt || busy || !session) return;
    setDraft("");
    onSend(prompt);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-2">
        <OptionDropdown
          label="Model"
          value={session?.model ?? ""}
          options={models.map((m) => ({ value: m.id, label: m.name }))}
          placeholder={session ? "No models available" : "Model"}
          disabled={!session || !models.length}
          onChange={(next) => onChangeSettings({ model: next })}
        />
        <OptionDropdown
          label="Thinking"
          value={session?.thinking ?? ""}
          options={[{ value: "", label: "Default thinking" }, ...levels.map((level) => ({ value: level, label: THINKING_LABELS[level] ?? level }))]}
          placeholder="Default thinking"
          disabled={!session || !levels.length}
          onChange={(next) => onChangeSettings({ thinking: next })}
        />
      </div>

      <form className="join w-full" onSubmit={send}>
        <input
          className="input join-item w-full"
          placeholder={session ? (busy ? "This agent is still working" : "Message mip") : "Create a session first"}
          value={draft}
          disabled={busy || !session}
          onInput={(e) => setDraft(e.currentTarget.value)}
        />
        <button className="btn btn-primary join-item" disabled={busy || !session || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
