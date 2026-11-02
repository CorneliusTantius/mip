// A web address as a short label: its host and path, without the scheme, cut to max characters with an ellipsis. The full address stays in
// the link itself, so a click still opens it.
export function shortLink(href: string, max = 40): string {
  const label = href.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}
