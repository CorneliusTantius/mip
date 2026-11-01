import { SourceCard } from "../../ui/SourceCard";

// The WhatsApp card. WhatsApp is not connected yet, so it shows that. Its chats come once a WhatsApp connection exists.
export function WhatsAppCard() {
  return <SourceCard title="WhatsApp" glow="green" tone="neutral" status="Not connected" detail="WhatsApp is not connected yet." note="Chats coming next." />;
}
