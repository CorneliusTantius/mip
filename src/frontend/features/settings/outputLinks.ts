// A web link in the sign-in output. The pattern takes everything up to a space.
const LINK = /https?:\/\/\S+/g;

// The pieces of one line of sign-in output: plain text, and each link as its address. The page draws a link as a button that opens it.
export type OutputPiece = string | { url: string };

export function splitLinks(line: string): OutputPiece[] {
  const pieces: OutputPiece[] = [];
  let last = 0;
  for (const match of line.matchAll(LINK)) {
    // Punctuation after a link, such as a closing bracket or a full stop, is not part of the address.
    const url = match[0].replace(/[.,;:)\]]+$/, "");
    const at = match.index ?? 0;
    if (at > last) pieces.push(line.slice(last, at));
    pieces.push({ url });
    last = at + url.length;
  }
  if (last < line.length) pieces.push(line.slice(last));
  return pieces;
}
