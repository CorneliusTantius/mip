// The options a search shows: those whose label or value contains the query text, ignoring case. The value is searched too, so an id
// such as "openai/gpt" finds its model. An empty query keeps every option.
export function filterOptions<T extends { value: string; label: string }>(options: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return options;
  return options.filter((option) => option.label.toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle));
}
