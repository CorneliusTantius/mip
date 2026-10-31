import type { ComponentChildren } from "preact";
import { Icon } from "../../ui/Icon";

// The open agent's title, with its persona and provider as badges. The button on the left opens the agent list on a phone.
export function AgentHeader({
  title,
  badges,
  onToggleAgents,
  trailing,
}: {
  title: string;
  badges?: string[];
  onToggleAgents: () => void;
  // Controls shown at the right end of the header, such as the expand button.
  trailing?: ComponentChildren;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn btn-ghost btn-sm btn-square" aria-label="Toggle agents" onClick={onToggleAgents}>
        <Icon name="menu" className="size-5" />
      </button>
      <h2 className="card-title min-w-40 flex-1 truncate text-base">{title}</h2>
      {badges && (
        <div className="flex shrink-0 gap-2">
          {badges.map((badge, i) => (
            <span key={i} className="badge badge-outline">
              {badge}
            </span>
          ))}
        </div>
      )}
      {trailing}
    </div>
  );
}
