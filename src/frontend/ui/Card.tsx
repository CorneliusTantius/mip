import { createContext, type ComponentChildren } from "preact";
import { useContext, useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
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
// The zoom takes ZOOM_MS. Closing fades the backdrop for CLOSE_MS before the card shrinks back. The fade must match mip-fade-out in styles.css.
const ZOOM_MS = 260;
const CLOSE_MS = 200;
const EASING = "cubic-bezier(0.2, 0.7, 0.2, 1)";

// Lets the ExpandButton in a card's header read the expanded state and toggle it.
const ExpandContext = createContext({ expanded: false, toggle: () => {} });

// Draws an element from one box and moves it to where it already sits. The element has already changed place, so this only plays the move.
function zoom(el: HTMLElement, from: DOMRect, to: DOMRect): void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const sx = from.width / to.width;
  const sy = from.height / to.height;
  el.animate(
    [
      { transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
      { transformOrigin: "0 0", transform: "none" },
    ],
    { duration: ZOOM_MS, easing: EASING },
  );
}

// A dashboard card: a panel with a glowing border and a slight tint of its accent. Its size comes from the grid cell or from className.
// The card can expand into a large panel over the page. It is the same element, so its state is kept, and it zooms between the grid and the panel.
// Escape, a click outside, or the header's ExpandButton collapses it.
export function Card({ glow, className = "", children }: { glow: Glow; className?: string; children: ComponentChildren }) {
  const [timing] = useState(enterTiming);
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const section = useRef<HTMLElement>(null);
  // The box the card moves from. Set just before it expands, or when a close begins (its expanded box).
  const fromBox = useRef<DOMRect | undefined>(undefined);
  // The expanded state the last layout pass drew, so the zoom plays only when it changes.
  const drawn = useRef(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const closingNow = useRef(false);

  useLayoutEffect(() => {
    if (drawn.current === expanded) return;
    drawn.current = expanded;
    if (fromBox.current && section.current) zoom(section.current, fromBox.current, section.current.getBoundingClientRect());
    fromBox.current = undefined;
  });

  function open() {
    fromBox.current = section.current!.getBoundingClientRect();
    setExpanded(true);
  }

  // The backdrop fades, and the card holds its panel size for a moment, then shrinks back to its grid cell.
  function close() {
    if (closingNow.current || !expanded) return;
    closingNow.current = true;
    fromBox.current = section.current!.getBoundingClientRect();
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      closingNow.current = false;
      setClosing(false);
      setExpanded(false);
    }, CLOSE_MS);
  }

  const toggle = () => (expanded ? close() : open());

  // The Escape listener is set only while expanded, and it always calls the latest close.
  const closeLatest = useRef(close);
  closeLatest.current = close;
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLatest.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  return (
    <ExpandContext.Provider value={{ expanded, toggle }}>
      {expanded && <div className={`fixed inset-0 z-40 bg-black/50 ${closing ? "mip-fade-out" : "mip-fade"}`} aria-hidden="true" onClick={close} />}
      <section
        ref={section}
        className={`card glow glow-${glow} bg-base-200/80 ${expanded ? EXPANDED : className}`}
        style={timing}
        role={expanded ? "dialog" : undefined}
        aria-modal={expanded || undefined}
      >
        {children}
      </section>
    </ExpandContext.Provider>
  );
}

// The header button that expands its card into a large panel, or shrinks it back. It must sit inside a Card.
export function ExpandButton() {
  const { expanded, toggle } = useContext(ExpandContext);
  return (
    <button className="btn btn-ghost btn-sm btn-square" aria-label={expanded ? "Shrink card" : "Expand card"} onClick={toggle}>
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
