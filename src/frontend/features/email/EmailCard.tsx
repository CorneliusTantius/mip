import { SourceCard } from "../../ui/SourceCard";
import { gmailStatus } from "./gmailStatus";
import { useGmailServer } from "./useGmailServer";

// The email card: Gmail's connection, read from the MCP servers. The inbox view is not built yet, so the card shows the connection only.
export function EmailCard() {
  const { status, tone, detail } = gmailStatus(useGmailServer());
  return (
    <SourceCard title="Email" glow="frost" tone={tone} status={status} detail={detail}>
      <div className="py-4 text-center text-sm opacity-60">Inbox view coming next.</div>
    </SourceCard>
  );
}
