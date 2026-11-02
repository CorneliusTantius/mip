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

// The text of a message as paragraphs, each a list of lines. A blank line starts a new paragraph. Lines inside a paragraph are joined,
// since mail is wrapped at a fixed width, but a bullet or numbered line keeps its own line.
export function paragraphsOf(text: string): string[][] {
  const bullet = /^([•·*-]|\d+[.)])\s/;
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n+/)
    .map((block) => {
      const lines: string[] = [];
      for (const raw of block.split("\n")) {
        const line = raw.trim();
        if (!line) continue;
        const last = lines.length - 1;
        if (last < 0 || bullet.test(line)) lines.push(line);
        else lines[last] = `${lines[last]} ${line}`;
      }
      return lines.map((line) => line.replace(/\s{2,}/g, " "));
    })
    .filter((lines) => lines.length > 0);
}

// A line split into plain text and web links, so each link can be drawn as a link. Only http and https addresses are links.
export function linkPieces(line: string): ({ text: string; href?: string })[] {
  const pieces: { text: string; href?: string }[] = [];
  let last = 0;
  for (const match of line.matchAll(/https?:\/\/[^\s<>"]+/g)) {
    const at = match.index ?? 0;
    // Punctuation after a link is part of the sentence, not the address.
    const address = match[0].replace(/[.,;:!?)\]]+$/, "");
    if (at > last) pieces.push({ text: line.slice(last, at) });
    pieces.push({ text: address, href: address });
    last = at + address.length;
  }
  if (last < line.length) pieces.push({ text: line.slice(last) });
  return pieces;
}
