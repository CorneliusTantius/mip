import type { NoteItem } from "../../api/types";

// The search box and the notes on the left of the memory screen. Search results show a snippet of the match.
export function NoteList({
  items,
  selected,
  query,
  onQuery,
  onOpen,
}: {
  items: NoteItem[];
  selected?: string;
  query: string;
  onQuery: (query: string) => void;
  onOpen: (title: string) => void;
}) {
  return (
    <div className="flex w-60 shrink-0 flex-col gap-2 border-r border-base-300 pr-4">
      <input className="input input-sm w-full" placeholder="Search notes" value={query} onInput={(e) => onQuery(e.currentTarget.value)} />
      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {items.map((item, i) => (
          <li key={item.id} style={{ animationDelay: `${i * 25}ms` }}>
            <button
              className={"btn btn-ghost btn-sm h-auto w-full min-w-0 justify-start py-1 text-left font-normal " + (item.title === selected ? "btn-active" : "")}
              onClick={() => onOpen(item.title)}
            >
              <span className="min-w-0">
                <span className="block truncate">{item.title}</span>
                {item.snippet && <span className="block truncate text-xs opacity-60">{item.snippet.replace(/\[|\]/g, "")}</span>}
              </span>
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="text-sm opacity-60">{query ? "No notes match." : "No notes yet."}</li>}
      </ul>
    </div>
  );
}
