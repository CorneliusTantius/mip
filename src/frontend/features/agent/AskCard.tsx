import { useState } from "preact/hooks";
import type { Ask } from "../../api/types";

// The controls for a question an agent asked, drawn under its reply. Each answer is sent as the user's next message. Once the user has
// sent a message after the question, or while the agent is working, the controls are shown but cannot be used.
export function AskCard({ ask, disabled, onAnswer }: { ask: Ask; disabled: boolean; onAnswer: (answer: string) => void }) {
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-base-content/10 pt-2">
      <div className="text-sm font-medium">{ask.question}</div>
      {ask.kind === "choice" && <Choice options={ask.options} disabled={disabled} onAnswer={onAnswer} />}
      {ask.kind === "multi" && <MultiChoice options={ask.options} disabled={disabled} onAnswer={onAnswer} />}
      {ask.kind === "text" && <TextAnswer placeholder={ask.placeholder} disabled={disabled} onAnswer={onAnswer} />}
      {ask.kind === "slider" && <SliderAnswer ask={ask} disabled={disabled} onAnswer={onAnswer} />}
    </div>
  );
}

// One option is sent at once. Other opens a box for an answer of the user's own.
function Choice({ options, disabled, onAnswer }: { options: string[]; disabled: boolean; onAnswer: (answer: string) => void }) {
  const [otherOpen, setOtherOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button key={option} className="btn btn-sm btn-outline" disabled={disabled} onClick={() => onAnswer(option)}>
            {option}
          </button>
        ))}
        <button className="btn btn-sm btn-outline" disabled={disabled} aria-expanded={otherOpen} onClick={() => setOtherOpen(!otherOpen)}>
          Other
        </button>
      </div>
      {otherOpen && <TextAnswer placeholder="Type your own answer" disabled={disabled} onAnswer={onAnswer} />}
    </div>
  );
}

// Several options, sent together in the order they are listed. Other adds an answer of the user's own after them.
function MultiChoice({ options, disabled, onAnswer }: { options: string[]; disabled: boolean; onAnswer: (answer: string) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [otherOn, setOtherOn] = useState(false);
  const [otherText, setOtherText] = useState("");
  const answers = [...options.filter((option) => picked.includes(option)), ...(otherOn && otherText.trim() ? [otherText.trim()] : [])];

  function toggle(option: string, on: boolean) {
    setPicked(options.filter((candidate) => (candidate === option ? on : picked.includes(candidate))));
  }

  return (
    <div className="flex flex-col gap-1">
      {options.map((option) => (
        <label key={option} className="label cursor-pointer justify-start gap-2 text-sm">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={picked.includes(option)}
            disabled={disabled}
            onChange={(e) => toggle(option, e.currentTarget.checked)}
          />
          {option}
        </label>
      ))}
      <label className="label cursor-pointer justify-start gap-2 text-sm">
        <input type="checkbox" className="checkbox checkbox-sm" checked={otherOn} disabled={disabled} onChange={(e) => setOtherOn(e.currentTarget.checked)} />
        Other
      </label>
      {otherOn && (
        <input
          className="input input-sm w-full"
          placeholder="Type your own answer"
          value={otherText}
          disabled={disabled}
          onInput={(e) => setOtherText(e.currentTarget.value)}
        />
      )}
      <button className="btn btn-sm btn-primary self-start" disabled={disabled || answers.length === 0} onClick={() => onAnswer(answers.join(", "))}>
        Send
      </button>
    </div>
  );
}

// A short typed answer. Enter sends it.
function TextAnswer({ placeholder, disabled, onAnswer }: { placeholder: string; disabled: boolean; onAnswer: (answer: string) => void }) {
  const [text, setText] = useState("");
  const answer = text.trim();

  function send(e: Event) {
    e.preventDefault();
    if (disabled || !answer) return;
    setText("");
    onAnswer(answer);
  }

  return (
    <form className="join w-full" onSubmit={send}>
      <input
        className="input input-sm join-item w-full"
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        onInput={(e) => setText(e.currentTarget.value)}
      />
      <button className="btn btn-sm btn-primary join-item" disabled={disabled || !answer}>
        Send
      </button>
    </form>
  );
}

// A number in a range. The value shows beside the slider, and Send answers with it.
function SliderAnswer({ ask, disabled, onAnswer }: { ask: Extract<Ask, { kind: "slider" }>; disabled: boolean; onAnswer: (answer: string) => void }) {
  const [value, setValue] = useState(ask.value);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <input
          type="range"
          className="range range-sm range-primary"
          min={ask.min}
          max={ask.max}
          step={ask.step}
          value={value}
          disabled={disabled}
          onInput={(e) => setValue(Number(e.currentTarget.value))}
        />
        <span className="badge badge-outline min-w-12 font-mono">{value}</span>
      </div>
      <button className="btn btn-sm btn-primary self-start" disabled={disabled} onClick={() => onAnswer(String(value))}>
        Send
      </button>
    </div>
  );
}
