// How many bot badges fit on one line. widths holds each badge's width, and the last one is the width of the "+n" badge that stands for the
// badges that do not fit. gap is the space between two items. The result is how many badges to show before it.
export function badgesThatFit(widths: number[], available: number, gap: number): number {
  if (widths.length === 0) return 0;
  const count = widths.length - 1;
  const more = widths[count];
  // The width of the first k badges with the gaps between them.
  const span = (k: number) => widths.slice(0, k).reduce((sum, width) => sum + width, 0) + gap * Math.max(0, k - 1);
  if (span(count) <= available) return count;
  for (let k = count - 1; k > 0; k--) {
    if (span(k) + gap + more <= available) return k;
  }
  return 0;
}
