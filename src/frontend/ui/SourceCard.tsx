import { Card, CardBody, ExpandButton, type Glow, useCardExpansion } from "./Card";

// The colour of a source's status badge: grey when it is not set up, amber while it starts, green when it works, red when it failed.
export type SourceTone = "neutral" | "success" | "warning" | "error" | "info";

const BADGE: Record<SourceTone, string> = {
  neutral: "badge-ghost",
  success: "badge-success",
  warning: "badge-warning",
  error: "badge-error",
  info: "badge-info",
};

// A dashboard card for one place mip reads messages or mail from: its title, a status badge, a line of detail, and a note on what comes
// next. It expands like the other cards.
export function SourceCard({
  title,
  glow,
  tone,
  status,
  detail,
  note,
}: {
  title: string;
  glow: Glow;
  tone: SourceTone;
  status: string;
  detail: string;
  note: string;
}) {
  return (
    <Card glow={glow}>
      <SourceBody title={title} tone={tone} status={status} detail={detail} note={note} />
    </Card>
  );
}

// The card's content. It sits inside Card, so it reads the expanded state, and its text steps up one size when the card is expanded.
function SourceBody({ title, tone, status, detail, note }: { title: string; tone: SourceTone; status: string; detail: string; note: string }) {
  const { expanded } = useCardExpansion();
  return (
    <CardBody
      title={title}
      className={expanded ? "min-h-0 flex-1" : "gap-3"}
      actions={
        <>
          <span className={`badge badge-soft ${BADGE[tone]}`}>{status}</span>
          <ExpandButton />
        </>
      }
    >
      {/* A div, not a paragraph: daisyUI makes every paragraph in a card body grow to fill an expanded card. */}
      <div className={`${expanded ? "text-base" : "text-sm"} opacity-70`}>{detail}</div>
      <div className={expanded ? "flex flex-1 items-center justify-center text-base opacity-60" : "py-4 text-center text-sm opacity-60"}>{note}</div>
    </CardBody>
  );
}
