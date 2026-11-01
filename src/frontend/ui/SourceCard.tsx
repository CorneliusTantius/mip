import type { ComponentChildren } from "preact";
import { Card, CardBody, type Glow } from "./Card";

// The colour of a source's status badge: grey when it is not set up, amber while it starts, green when it works, red when it failed.
export type SourceTone = "neutral" | "success" | "warning" | "error" | "info";

const BADGE: Record<SourceTone, string> = {
  neutral: "badge-ghost",
  success: "badge-success",
  warning: "badge-warning",
  error: "badge-error",
  info: "badge-info",
};

// A dashboard card for one place mip reads messages or mail from: its title, a status badge, a line of detail, and the content below.
export function SourceCard({
  title,
  glow,
  tone,
  status,
  detail,
  children,
}: {
  title: string;
  glow: Glow;
  tone: SourceTone;
  status: string;
  detail: string;
  children: ComponentChildren;
}) {
  return (
    <Card glow={glow}>
      <CardBody title={title} actions={<span className={`badge badge-soft ${BADGE[tone]}`}>{status}</span>}>
        {/* A div, not a paragraph: daisyUI makes every paragraph in a card body grow to fill an expanded card. */}
        <div className="text-sm opacity-70">{detail}</div>
        {children}
      </CardBody>
    </Card>
  );
}
