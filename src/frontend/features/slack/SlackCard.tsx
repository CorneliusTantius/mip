import { SourceCard } from "../../ui/SourceCard";

// The Slack card. Slack is not connected yet, so it shows that. Its channels and messages come once a Slack connection exists.
export function SlackCard() {
  return (
    <SourceCard title="Slack" glow="violet" tone="neutral" status="Not connected" detail="Slack is not connected yet.">
      <div className="py-4 text-center text-sm opacity-60">Channels and messages coming next.</div>
    </SourceCard>
  );
}
