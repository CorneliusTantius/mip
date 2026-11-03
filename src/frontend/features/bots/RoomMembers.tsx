import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Bot } from "../../api/types";
import { badgesThatFit } from "./fitBadges";

// The room's bots on one line. As many badges as fit are shown, and "+n" stands for the rest, with their names as its title. A hidden copy
// of every badge is measured, so the count follows the width of the line and the length of the names.
export function RoomMembers({ bots }: { bots: Bot[] }) {
  const line = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(0);
  // The members' ids, names, and colors. The line is measured again when any of them change.
  const members = bots.map((bot) => `${bot.id}:${bot.name}:${bot.color}`).join("|");

  useLayoutEffect(() => {
    const fit = () => {
      const row = line.current;
      const measure = ruler.current;
      if (!row || !measure) return;
      const widths = [...measure.children].map((el) => (el as HTMLElement).offsetWidth);
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      setShown(badgesThatFit(widths, row.clientWidth, gap));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(line.current!);
    return () => observer.disconnect();
  }, [members]);

  const hidden = bots.slice(shown);
  return (
    <div className="relative min-w-0 flex-1">
      <div ref={line} className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
        {bots.length === 0 && <span className="text-xs opacity-70">no bots yet</span>}
        {bots.slice(0, shown).map((bot) => (
          <BotBadge key={bot.id} bot={bot} />
        ))}
        {hidden.length > 0 && (
          <span className="badge badge-outline flex-none" title={hidden.map((bot) => bot.name).join(", ")}>
            +{hidden.length}
          </span>
        )}
      </div>

      {/* Every badge, laid out but hidden, so its width can be measured. The last one is the "+n" badge at its widest. */}
      <div ref={ruler} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flex h-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
        {bots.map((bot) => (
          <BotBadge key={bot.id} bot={bot} />
        ))}
        <span className="badge badge-outline flex-none">+{bots.length}</span>
      </div>
    </div>
  );
}

function BotBadge({ bot }: { bot: Bot }) {
  return (
    <span className="badge badge-outline flex-none gap-1.5">
      <span className={`bot-dot size-2 bot-${bot.color}`} />
      {bot.name}
    </span>
  );
}
