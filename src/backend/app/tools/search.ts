import type { ToolSpec } from "../../adapters/contract.js";
import { fail, ok } from "./result.js";

// Tool search. A deferred tool is not offered to the model. tool_search lists the matching deferred tools with their inputs,
// and tool_call runs one. Both read only the deferred tools of the run they are part of, so a bot cannot reach tools it was not given.
const MAX_RESULTS = 8;

type Schema = { properties?: Record<string, { type?: string; description?: string }>; required?: string[] };

// Lowercase words of a text. Short ones are dropped, so "a" and "to" do not match every tool.
function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((word) => word.length > 1);
}

// The deferred tools that match a query, best match first. A word in a tool's name counts more than a word in its description.
// An empty query lists the first few.
export function searchTools(deferred: ToolSpec[], query: string): ToolSpec[] {
  const terms = words(query);
  if (terms.length === 0) return deferred.slice(0, MAX_RESULTS);
  return deferred
    .map((tool) => {
      const name = tool.name.toLowerCase();
      const description = tool.description.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (name.includes(term) ? 2 : 0) + (description.includes(term) ? 1 : 0), 0);
      return { tool, score };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
    .map((match) => match.tool);
}

// A tool's name, what it does, and its inputs, as tool_search shows them.
function describe(tool: ToolSpec): string {
  const schema = tool.inputSchema as Schema;
  const required = new Set(schema.required ?? []);
  const inputs = Object.entries(schema.properties ?? {}).map(
    ([name, spec]) => `  ${name} (${spec.type ?? "any"}${required.has(name) ? ", required" : ""}): ${spec.description ?? ""}`,
  );
  return [`${tool.name}: ${tool.description}`, `  guide: ${tool.guide}`, ...(inputs.length > 0 ? inputs : ["  (no inputs)"])].join("\n");
}

// Finds deferred tools by a few words about the task. The reply lists each match with its inputs.
export const toolSearchTool: ToolSpec = {
  name: "tool_search",
  guide: "Some tools are not listed for you. When you need one that is not listed, call tool_search with a few words about the task. It returns the matching tools with their inputs and guides, then run the match with tool_call.",
  description: "Find a tool that is not listed for you, by a few words about what it should do. Returns the matching tools with their inputs. Run one with tool_call.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string", description: "What you need the tool to do, in a few words." } },
    required: ["query"],
  },
  async run(input, context) {
    const deferred = context.deferred ?? [];
    if (deferred.length === 0) return ok("No other tools are available in this chat.");
    const found = searchTools(deferred, String(input.query ?? ""));
    if (found.length === 0) return ok("No tool matches. Try different words.");
    return ok(found.map(describe).join("\n\n"));
  },
};

// Runs a deferred tool that tool_search found, with its inputs. Other tools are refused here, since they are offered directly.
export const toolCallTool: ToolSpec = {
  name: "tool_call",
  guide: "Runs a tool that tool_search found. Pass its name and its inputs as an object. Only tools that tool_search listed can be run this way.",
  description: "Run a tool that tool_search found. Give its name, and its inputs as an object.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "The tool's name, as tool_search listed it." },
      input: { type: "object", description: "The tool's inputs." },
    },
    required: ["name"],
  },
  async run(input, context) {
    const name = String(input.name ?? "");
    const tool = (context.deferred ?? []).find((candidate) => candidate.name === name);
    if (!tool) return fail(`no deferred tool named ${name}. Find it with tool_search first.`);
    return tool.run(input.input ?? {}, context);
  },
};
