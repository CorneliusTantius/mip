import type { ToolSpec } from "../../adapters/contract.js";
import type { Ask } from "../../storage/agents.js";
import { fail, ok } from "./result.js";

// The question a run asked, waiting for the run to end. A run asks at most one, and its reply takes it when the run ends.
const pending = new Map<string, Ask>();

// Takes the question an agent's run asked, or null when it asked none. The reply is saved with it.
export function takePendingAsk(agentId: string): Ask | null {
  const ask = pending.get(agentId) ?? null;
  pending.delete(agentId);
  return ask;
}

const MAX_OPTIONS = 8;
const KINDS = ["choice", "multi", "text", "slider"] as const;

// Asks the user a question with controls for the answer. The controls show under the agent's reply. The answer is the user's next message,
// so the run ends here and does not wait for it.
export const askUserTool: ToolSpec = {
  name: "ask_user",
  guide: "Asks the user a question with buttons, a checklist, a text box, or a slider, when you need them to choose or confirm something before you can go on. Ask one question, then end your turn: their answer comes as their next message. Do not ask what you can work out yourself.",
  description: "Ask the user a question with controls for the answer. The run ends after this; the answer is the user's next message.",
  inputSchema: {
    type: "object",
    properties: {
      question: { type: "string", description: "The question to ask" },
      kind: {
        type: "string",
        enum: [...KINDS],
        description: "choice: pick one option. multi: pick any number of options. text: type a short answer. slider: pick a number in a range.",
      },
      options: { type: "array", items: { type: "string" }, description: "For choice and multi: the options, from 2 to 8" },
      placeholder: { type: "string", description: "For text: a hint shown in the box" },
      min: { type: "number", description: "For slider: the lowest value" },
      max: { type: "number", description: "For slider: the highest value" },
      step: { type: "number", description: "For slider: the gap between values. Defaults to 1" },
      value: { type: "number", description: "For slider: the value it starts at. Defaults to min" },
    },
    required: ["question", "kind"],
  },
  async run(input, context) {
    if (!context.agentId) return fail("Only an agent can ask the user a question.");
    if (pending.has(context.agentId)) return fail("This reply already asks a question. Ask one at a time.");
    const ask = parseAsk(input);
    if (typeof ask === "string") return fail(ask);
    pending.set(context.agentId, ask);
    return ok("The question is shown to the user. End your turn now. Their answer comes as their next message.");
  },
};

// Checks the input and builds the question. A string is the reason it was refused.
function parseAsk(input: Record<string, unknown>): Ask | string {
  const question = String(input.question ?? "").trim();
  if (!question) return "question is required";
  const kind = KINDS.find((known) => known === input.kind);
  if (!kind) return `kind must be one of ${KINDS.join(", ")}`;

  if (kind === "choice" || kind === "multi") {
    const options = Array.isArray(input.options) ? input.options.map((option) => String(option ?? "").trim()) : [];
    if (options.length < 2 || options.length > MAX_OPTIONS) return `${kind} needs from 2 to ${MAX_OPTIONS} options`;
    if (options.some((option) => !option)) return "every option needs text";
    return { question, kind, options };
  }

  if (kind === "text") {
    return { question, kind, placeholder: String(input.placeholder ?? "").trim() };
  }

  const min = Number(input.min);
  const max = Number(input.max);
  const step = input.step === undefined ? 1 : Number(input.step);
  const value = input.value === undefined ? min : Number(input.value);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return "a slider needs a min and a max, with max above min";
  if (!Number.isFinite(step) || step <= 0) return "step must be above 0";
  if (!Number.isFinite(value) || value < min || value > max) return "value must be between min and max";
  return { question, kind, min, max, step, value };
}
