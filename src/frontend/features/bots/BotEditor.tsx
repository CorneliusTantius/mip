import { useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import { DEFAULT_PROVIDER_ID } from "../../api/constants";
import type { Bot, BotColor, ProviderInfo } from "../../api/types";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { OptionDropdown } from "../../ui/OptionDropdown";
import { BOT_COLORS, nextBotColor } from "./botColors";

interface Draft {
  name: string;
  persona: string;
  providerId: string;
  model: string;
  thinking: string;
  color: BotColor;
}

// The form for one bot. A bot with no `bot` is a new one, and it starts on the first color no other bot uses. Changing the
// provider clears the model and thinking level, and changing the model clears the thinking level, because the next choice may
// not offer them.
export function BotEditor({
  bot,
  providers,
  usedColors,
  onSaved,
  onCancel,
}: {
  bot?: Bot;
  providers: ProviderInfo[];
  usedColors: BotColor[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(
    bot
      ? {
          name: bot.name,
          persona: bot.persona,
          providerId: bot.providerId,
          model: bot.model ?? "",
          thinking: bot.thinking ?? "",
          color: bot.color,
        }
      : { name: "", persona: "", providerId: DEFAULT_PROVIDER_ID, model: "", thinking: "", color: nextBotColor(usedColors) },
  );
  const [error, setError] = useState<string>();

  const provider = providers.find((p) => p.id === draft.providerId);
  const model = provider?.models.find((m) => m.id === draft.model);
  const levels = model?.thinkingLevels ?? [];

  async function save(e: Event) {
    e.preventDefault();
    setError(undefined);
    try {
      if (bot) await api.put(`/api/bots/${bot.id}`, draft);
      else await api.post("/api/bots", draft);
    } catch (err) {
      return setError(errorText(err));
    }
    onSaved();
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={save}>
      <fieldset className="fieldset">
        <legend className="fieldset-legend">Name</legend>
        <input className="input w-full" placeholder="For example: Thorin" value={draft.name} onInput={(e) => setDraft({ ...draft, name: e.currentTarget.value })} />
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <OptionDropdown
          label="Provider"
          value={draft.providerId}
          options={providers.map((p) => ({ value: p.id, label: p.name }))}
          placeholder="Provider"
          onChange={(providerId) => setDraft({ ...draft, providerId, model: "", thinking: "" })}
        />
        <OptionDropdown
          label="Model"
          value={draft.model}
          options={(provider?.models ?? []).map((m) => ({ value: m.id, label: m.name }))}
          placeholder="Default model"
          disabled={!provider?.models.length}
          searchable
          onChange={(modelId) => setDraft({ ...draft, model: modelId, thinking: "" })}
        />
        <OptionDropdown
          label="Thinking"
          value={draft.thinking}
          options={[{ value: "", label: "Default thinking" }, ...levels.map((level) => ({ value: level, label: level }))]}
          placeholder="Default thinking"
          disabled={levels.length === 0}
          onChange={(thinking) => setDraft({ ...draft, thinking })}
        />
      </div>

      <fieldset className="fieldset">
        <legend className="fieldset-legend">Color</legend>
        <div className="flex flex-wrap gap-2">
          {BOT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              title={color}
              aria-label={color}
              aria-pressed={draft.color === color}
              className={`bot-dot size-7 bot-${color} ${draft.color === color ? "ring-2 ring-base-content ring-offset-2 ring-offset-base-200" : ""}`}
              onClick={() => setDraft({ ...draft, color })}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend className="fieldset-legend">Persona</legend>
        <textarea
          className="textarea h-40 w-full"
          placeholder="Who this bot is and what it cares about in the room."
          value={draft.persona}
          onInput={(e) => setDraft({ ...draft, persona: e.currentTarget.value })}
        />
      </fieldset>

      <ErrorAlert message={error} />

      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={!draft.name.trim() || !draft.persona.trim()}>
          {bot ? "Save" : "Create"}
        </button>
      </div>
    </form>
  );
}
