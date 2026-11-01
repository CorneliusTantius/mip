import { useEffect, useState } from "preact/hooks";
import { api } from "../../api/client";
import type { ModelOption, Agent, SkillSummary } from "../../api/types";
import { OptionDropdown } from "../../ui/OptionDropdown";
import { matchingSkills, skillCommandQuery } from "./skillCommand";

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
// Typing "/" at the start opens the list of installed skills. Picking one puts "/name " in the box, and the run reads the skill's
// instructions from it.
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
  onChangeSettings: (changes: { model?: string; thinking?: string; openToBots?: boolean }) => void;
}) {
  const [draft, setDraft] = useState("");
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const model = models.find((m) => m.id === (agent?.model ?? ""));
  const levels = model?.thinkingLevels ?? [];
  const query = skillCommandQuery(draft);
  const typingSkill = query !== undefined;
  const matches = query === undefined ? [] : matchingSkills(skills, query);
  // The list steps aside once the only match is the name already typed, so Enter sends.
  const listOpen = matches.length > 0 && !(matches.length === 1 && matches[0].name === query);

  // Reads the installed skills each time a "/" starts the message, so a skill added on the Skills card shows up.
  useEffect(() => {
    if (!typingSkill) return;
    api.get<{ skills: SkillSummary[] }>("/api/skills").then(
      (data) => setSkills(data.skills),
      () => setSkills([]),
    );
  }, [typingSkill]);

  function send(e: Event) {
    e.preventDefault();
    const prompt = draft.trim();
    if (!prompt || busy || !agent) return;
    setDraft("");
    onSend(prompt);
  }

  function pick(skill: SkillSummary) {
    setDraft(`/${skill.name} `);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && listOpen) {
      e.preventDefault();
      pick(matches[0]);
    }
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
          searchable
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
        <label className="flex cursor-pointer items-center gap-2 text-sm" title="Bots in a room may send this agent tasks">
          <input
            type="checkbox"
            className="toggle toggle-sm"
            checked={agent?.openToBots ?? false}
            disabled={!agent}
            onChange={(e) => onChangeSettings({ openToBots: e.currentTarget.checked })}
          />
          Bots may ask
        </label>
      </div>

      <div className="relative">
        {listOpen && (
          <ul className="menu absolute bottom-full left-0 right-0 z-10 mb-1 max-h-60 w-full flex-nowrap overflow-y-auto rounded-box bg-base-200 p-1 shadow-lg">
            {matches.map((skill) => (
              <li key={skill.name}>
                <button type="button" className="flex flex-col items-start gap-0" onClick={() => pick(skill)}>
                  <span className="font-medium">/{skill.name}</span>
                  <span className="text-xs opacity-70">{skill.description}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <form className="join w-full" onSubmit={send}>
          <input
            className="input join-item w-full"
            placeholder={agent ? (busy ? "This agent is still working" : "Message mip, or type / for a skill") : "Create an agent first"}
            value={draft}
            disabled={busy || !agent}
            onInput={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={onKeyDown}
          />
          <button className="btn btn-primary join-item" disabled={busy || !agent || !draft.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
