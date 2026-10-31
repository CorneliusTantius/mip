import { useEffect, useRef } from "preact/hooks";
import { Icon } from "./Icon";

export interface DropdownOption {
  value: string;
  label: string;
}

// A fixed-width dropdown built on daisyUI's dropdown. A long label is cut with an ellipsis and shows in full on hover.
// A native select can't cut its label that way in every browser, so this draws the list itself.
export function OptionDropdown({
  label,
  value,
  options,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: DropdownOption[];
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const current = options.find((option) => option.value === value);

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

  return (
    <details ref={details} className="dropdown dropdown-top">
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
        {options.map((option) => (
          <li key={option.value} className="w-full">
            <button className={"block w-full truncate text-left " + (option.value === value ? "menu-active" : "")} title={option.label} onClick={() => pick(option.value)}>
              {option.label}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
