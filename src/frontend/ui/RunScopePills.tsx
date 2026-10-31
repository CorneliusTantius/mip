import { useCardExpansion } from "./Card";

// Which kind of run a card's list is for: everything, the chats' side, or the bots' side.
export type RunScope = "all" | "chat" | "bot";

const OPTIONS: [RunScope, string][] = [
  ["all", "All"],
  ["chat", "Chat"],
  ["bot", "Bot"],
];

// The All / Chat / Bot pill that picks a card's view. It is one size larger when its card is expanded, like the rest of the card.
export function RunScopePills({ value, onChange }: { value: RunScope; onChange: (scope: RunScope) => void }) {
  const { expanded } = useCardExpansion();
  return (
    <div className="join self-start">
      {OPTIONS.map(([key, label]) => (
        <button key={key} className={`join-item btn ${expanded ? "btn-sm" : "btn-xs"} ${value === key ? "btn-active" : ""}`} onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}
