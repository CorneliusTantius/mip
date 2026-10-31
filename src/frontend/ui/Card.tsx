import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";

// Each dashboard card has one accent color, so the cards read apart. Each name matches a glow-* class in styles.css.
export type Glow = "frost" | "teal" | "blue" | "violet" | "red" | "orange" | "yellow" | "green";

// Each card enters on its own timing, drawn once when it mounts. So the order cards appear in changes on every page load.
function enterTiming(): string {
  const duration = 0.4 + Math.random() * 0.8; // 0.4s to 1.2s
  const delay = Math.random() * 0.5; // 0s to 0.5s
  return `--enter-duration: ${duration.toFixed(2)}s; --enter-delay: ${delay.toFixed(2)}s`;
}

// A dashboard card: a panel with a glowing border and a slight tint of its accent. Its size comes from the grid cell or from className.
export function Card({ glow, className = "", children }: { glow: Glow; className?: string; children: ComponentChildren }) {
  const [timing] = useState(enterTiming);
  return (
    <section className={`card glow glow-${glow} bg-base-200/80 ${className}`} style={timing}>
      {children}
    </section>
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
