import { useEffect, useState } from "preact/hooks";
import { api } from "../../api/client";
import type { Bot, ProviderInfo } from "../../api/types";
import { Modal } from "../../ui/Modal";

// A bot's profile: its color, provider, model, thinking level, and persona. It opens from a mention in the room.
export function BotProfileModal({ bot, onClose, onEdit }: { bot?: Bot; onClose: () => void; onEdit: (bot: Bot) => void }) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);

  useEffect(() => {
    if (!bot) return;
    api
      .get<{ providers: ProviderInfo[] }>("/api/providers")
      .then((data) => setProviders(data.providers))
      .catch(() => setProviders([]));
  }, [bot?.id]);

  const provider = providers.find((p) => p.id === bot?.providerId);
  const model = provider?.models.find((m) => m.id === bot?.model);

  return (
    <Modal open={!!bot} onClose={onClose} closeButton glow={bot?.color ?? "frost"} boxClassName="max-w-lg">
      {bot && (
        <>
          <div className="flex items-center gap-3 pr-10">
            <span className={`bot-dot size-4 bot-${bot.color}`} />
            <h2 className="text-lg font-semibold">{bot.name}</h2>
          </div>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="opacity-60">Provider</dt>
            <dd>{provider?.name ?? bot.providerId}</dd>
            <dt className="opacity-60">Model</dt>
            <dd>{model?.name ?? bot.model ?? "Default model"}</dd>
            <dt className="opacity-60">Thinking</dt>
            <dd>{bot.thinking ?? "Default thinking"}</dd>
            <dt className="opacity-60">Skills</dt>
            <dd>{bot.skills.length > 0 ? bot.skills.join(", ") : "None"}</dd>
          </dl>
          <h3 className="mt-4 text-xs uppercase tracking-wide opacity-60">Persona</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm">{bot.persona}</p>
          <div className="mt-6 flex justify-end">
            <button className="btn btn-primary btn-sm" onClick={() => onEdit(bot)}>
              Edit bot
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
