import { useEffect, useRef, useState } from "preact/hooks";
import { filterOptions } from "./filterOptions";
import { Icon } from "./Icon";

// The most the list can be tall (max-h-64), in pixels, so the placement can tell whether it fits above or below the button.
const LIST_HEIGHT = 256;

export interface DropdownOption {
  value: string;
  label: string;
}

// A fixed-width dropdown built on daisyUI's dropdown. A long label is cut with an ellipsis and shows in full on hover.
// A native select can't cut its label that way in every browser, so this draws the list itself.
// With searchable, a box at the top of the list narrows the options as the user types. Enter picks the first match.
export function OptionDropdown({
  label,
  value,
  options,
  placeholder,
  disabled,
  searchable = false,
  onChange,
}: {
  label: string;
  value: string;
  options: DropdownOption[];
  placeholder: string;
  disabled?: boolean;
  searchable?: boolean;
  onChange: (value: string) => void;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  // Whether the list opens above the button. It opens above when there is room, and below when there is not.
  const [up, setUp] = useState(true);
  const current = options.find((option) => option.value === value);
  const shown = searchable ? filterOptions(options, query) : options;

  // Closes the list when the user clicks anywhere else.
  useEffect(() => {
    const closeOutside = (e: MouseEvent) => {
      if (details.current?.open && !details.current.contains(e.target as Node)) details.current.open = false;
    };
    document.addEventListener("click", closeOutside);
    return () => document.removeEventListener("click", closeOutside);
  }, []);

  function pick(next: string) {
    details.current!.open = false;
    onChange(next);
  }

  // Each time the list opens, the search box takes focus. Closing clears the search, so the next open shows every option.
  function toggled() {
    if (!details.current?.open) return setQuery("");
    const button = details.current.querySelector("summary")!.getBoundingClientRect();
    const height = Math.min(details.current.querySelector("ul")!.scrollHeight, LIST_HEIGHT);
    setUp(button.top >= height || button.top >= innerHeight - button.bottom);
    requestAnimationFrame(() => search.current?.focus());
  }

  function searchKey(e: KeyboardEvent) {
    if (e.key === "Escape") details.current!.open = false;
    if (e.key === "Enter" && shown[0]) {
      e.preventDefault();
      pick(shown[0].value);
    }
  }

  return (
    <details ref={details} className={`dropdown ${up ? "dropdown-top" : "dropdown-bottom"}`} onToggle={toggled}>
      <summary
        className={"btn btn-xs w-52 flex-nowrap justify-between font-normal list-none [&::-webkit-details-marker]:hidden " + (disabled ? "btn-disabled" : "")}
        aria-label={label}
        aria-disabled={disabled}
        title={current?.label ?? placeholder}
      >
        <span className="truncate">{current?.label ?? placeholder}</span>
        <Icon name="chevronDown" className="size-3 shrink-0" strokeWidth={2.5} />
      </summary>
      <ul className="dropdown-content menu z-20 mb-1 max-h-64 w-52 flex-nowrap overflow-y-auto rounded-box bg-base-200 p-2 shadow-lg">
        {searchable && (
          <li className="sticky top-0 z-10 w-full bg-base-200 pb-1">
            <input
              ref={search}
              type="search"
              className="input input-xs w-full"
              placeholder="Search"
              aria-label={`Search ${label}`}
              value={query}
              onInput={(e) => setQuery(e.currentTarget.value)}
              onKeyDown={searchKey}
            />
          </li>
        )}
        {shown.map((option) => (
          <li key={option.value} className="w-full">
            <button className={"block w-full truncate text-left " + (option.value === value ? "menu-active" : "")} title={option.label} onClick={() => pick(option.value)}>
              {option.label}
            </button>
          </li>
        ))}
        {searchable && shown.length === 0 && <li className="w-full px-2 py-1 text-xs opacity-60">No matches</li>}
      </ul>
    </details>
  );
}
