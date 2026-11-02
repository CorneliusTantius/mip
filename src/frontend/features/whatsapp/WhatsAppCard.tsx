import { Card, CardBody, ExpandButton, useCardExpansion } from "../../ui/Card";
import { MESSAGING_CARD_HEIGHT } from "../../ui/SourceCard";

// The WhatsApp card. WhatsApp is not connected yet, so it shows that. Its chats come once a WhatsApp connection exists.
// It has the height and layout of the mail and Slack cards, so the messaging row lines up.
export function WhatsAppCard() {
  return (
    <Card glow="green" className={MESSAGING_CARD_HEIGHT}>
      <WhatsAppBody />
    </Card>
  );
}

// The card's content. It sits inside Card, so it reads the expanded state, and its text steps up one size when the card is expanded.
function WhatsAppBody() {
  const { expanded } = useCardExpansion();
  return (
    <CardBody title="WhatsApp" className="min-h-0 flex-1 gap-3" actions={<ExpandButton />}>
      <div className={`py-4 text-center opacity-60 ${expanded ? "text-base" : "text-sm"}`}>WhatsApp is not connected yet.</div>
    </CardBody>
  );
}
