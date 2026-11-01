// The date of a message as the card lists it: a time for today, and a day and month for an older message. A missing or unreadable date
// is a dash.
export function formatMailDate(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

// The name to show for a sender: the name when the message gives one, otherwise the address.
export function displaySender(from: string): string {
  const named = /^(.*?)\s*<[^>]+>$/.exec(from);
  return named && named[1] ? named[1] : from;
}
