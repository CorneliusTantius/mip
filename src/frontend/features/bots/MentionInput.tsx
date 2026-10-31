import { useRef, useState } from "preact/hooks";
import type { Bot } from "../../api/types";
import { completeMention, mentionAt, suggestions } from "./mentions";

// The room's message box. Typing "@" lists the bots that match what follows it. Arrow keys move through the list,
// Enter or Tab picks one, and Escape closes it. Render it inside a relative container, which the list is placed against.
export function MentionInput({
  value,
  bots,
  disabled,
  placeholder,
  onInput,
}: {
  value: string;
  bots: Bot[];
  disabled: boolean;
  placeholder: string;
  onInput: (value: string) => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  const [caret, setCaret] = useState(0);
  const [picked, setPicked] = useState(0);
  const [hidden, setHidden] = useState(false);

  const mention = mentionAt(value, caret);
  const candidates = mention && !hidden ? suggestions(bots, mention) : [];
  const active = Math.min(picked, candidates.length - 1);

  function changeText(input: HTMLInputElement) {
    onInput(input.value);
    setCaret(input.selectionStart ?? input.value.length);
    setPicked(0);
    setHidden(false);
  }

  function pick(bot: Bot) {
    if (!mention) return;
    const next = completeMention(value, caret, mention, bot.name);
    onInput(next.text);
    setCaret(next.caret);
    requestAnimationFrame(() => field.current?.setSelectionRange(next.caret, next.caret));
  }

  function onKeyDown(e: KeyboardEvent) {
    if (candidates.length === 0) return;
    if (e.key === "ArrowDown") setPicked((active + 1) % candidates.length);
    else if (e.key === "ArrowUp") setPicked((active - 1 + candidates.length) % candidates.length);
    else if (e.key === "Enter" || e.key === "Tab") pick(candidates[active]);
    else if (e.key === "Escape") setHidden(true);
    else return;
    e.preventDefault();
  }

  return (
    <>
      {candidates.length > 0 && (
        <ul role="listbox" className="menu absolute bottom-full left-0 z-10 mb-1 w-56 rounded-box border border-base-300 bg-base-200 p-1 shadow-lg">
          {candidates.map((bot, i) => (
            <li key={bot.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={i === active ? "active" : ""}
                onMouseDown={(e) => {
                  // Keeps the focus in the box while the list is clicked.
                  e.preventDefault();
                  pick(bot);
                }}
              >
                <span className={`bot-dot size-2 bot-${bot.color}`} />
                @{bot.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={field}
        className="input join-item w-full"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onInput={(e) => changeText(e.currentTarget)}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
        onClick={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
      />
    </>
  );
}
