import type { ComponentChildren } from "preact";

// Each dashboard card has one accent color, so the cards read apart. Each name matches a glow-* class in styles.css.
export type Glow = "frost" | "teal" | "blue" | "violet" | "red" | "orange" | "yellow" | "green";

// A dashboard card: a panel with a glowing border and a slight tint of its accent. Its size comes from the grid cell or from className.
export function Card({ glow, className = "", children }: { glow: Glow; className?: string; children: ComponentChildren }) {
  return <section className={`card glow glow-${glow} bg-base-200/80 ${className}`}>{children}</section>;
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
