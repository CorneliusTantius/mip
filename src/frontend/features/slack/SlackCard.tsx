import { SourceCard } from "../../ui/SourceCard";

// The Slack card. Slack is not connected yet, so it shows that. Its channels and messages come once a Slack connection exists.
export function SlackCard() {
  return (
    <SourceCard title="Slack" glow="violet" tone="neutral" status="Not connected" detail="Slack is not connected yet." note="Channels and messages coming next." />
  );
}
