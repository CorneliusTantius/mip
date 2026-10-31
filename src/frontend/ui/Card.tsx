import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { Icon } from "./Icon";

// Each dashboard card has one accent color, so the cards read apart. Each name matches a glow-* class in styles.css.
export type Glow = "frost" | "teal" | "blue" | "violet" | "red" | "orange" | "yellow" | "green";

// Each card enters on its own timing, drawn once when it mounts. So the order cards appear in changes on every page load.
function enterTiming(): string {
  const duration = 0.4 + Math.random() * 0.8; // 0.4s to 1.2s
  const delay = Math.random() * 0.5; // 0s to 0.5s
  return `--enter-duration: ${duration.toFixed(2)}s; --enter-delay: ${delay.toFixed(2)}s`;
}

// An expanded card covers the page, above the other cards. Its size comes from the window, not the grid cell.
const EXPANDED = "fixed inset-3 z-50 flex flex-col md:inset-8";

// A dashboard card: a panel with a glowing border and a slight tint of its accent. Its size comes from the grid cell or from className.
// With `expanded`, the same element grows into a large panel over the page, so its state is kept. Escape or a click outside collapses it.
export function Card({
  glow,
  className = "",
  expanded = false,
  onCollapse,
  children,
}: {
  glow: Glow;
  className?: string;
  expanded?: boolean;
  onCollapse?: () => void;
  children: ComponentChildren;
}) {
  const [timing] = useState(enterTiming);

  useEffect(() => {
    if (!expanded || !onCollapse) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCollapse();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, onCollapse]);

  return (
    <>
      {expanded && <div className="fixed inset-0 z-40 bg-black/50" aria-hidden="true" onClick={onCollapse} />}
      <section
        className={`card glow glow-${glow} bg-base-200/80 ${expanded ? EXPANDED : className}`}
        style={timing}
        role={expanded ? "dialog" : undefined}
        aria-modal={expanded || undefined}
      >
        {children}
      </section>
    </>
  );
}

// The header button that grows a card into a large panel, or shrinks it back.
export function ExpandButton({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <button className="btn btn-ghost btn-sm btn-square" aria-label={expanded ? "Shrink card" : "Expand card"} onClick={onToggle}>
      <Icon name={expanded ? "minimize" : "maximize"} />
    </button>
  );
}

// The usual card body: a title on the left, optional actions on the right, and the content below.
export function CardBody({
  title,
  actions,
  className = "gap-3",
  children,
}: {
  title: string;
  actions?: ComponentChildren;
  className?: string;
  children: ComponentChildren;
}) {
  return (
    <div className={`card-body ${className}`}>
      <div className="flex items-center gap-2">
        <h2 className="card-title mr-auto">{title}</h2>
        {actions}
      </div>
      {children}
    </div>
  );
}
