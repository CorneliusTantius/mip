import { SourceCard } from "../../ui/SourceCard";

// The email card. No mail account is connected yet, so it shows that. Accounts and the inbox come with the IMAP integration.
export function EmailCard() {
  return (
    <SourceCard title="Email" glow="frost" tone="neutral" status="Not connected" detail="No mail account is connected yet." note="Inbox view coming next." />
  );
}
