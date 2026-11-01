// Checks the model search: the query is a plain text match, in any case, against the label or the value. An empty query keeps everything.
// Run after a build: node src/frontend/ui/filterOptions.test.mjs
import assert from "node:assert/strict";
import { filterOptions } from "./filterOptions.ts";

const options = [
  { value: "", label: "Default (Anthropic: Claude Fable 5 (openrouter))" },
  { value: "openrouter/anthropic/claude-fable-5", label: "Anthropic: Claude Fable 5 (openrouter)" },
  { value: "openrouter/anthropic/claude-fable-5.1", label: "Anthropic: Claude Fable 5.1 (openrouter)" },
  { value: "openrouter/openai/gpt-5", label: "OpenAI: GPT-5 (openrouter)" },
];
const values = (list) => list.map((option) => option.value);

// 1. An empty or blank query keeps every option.
assert.equal(filterOptions(options, "").length, 4);
assert.equal(filterOptions(options, "   ").length, 4);

// 2. The query is found inside a label, in any case.
assert.deepEqual(values(filterOptions(options, "fable")), ["", "openrouter/anthropic/claude-fable-5", "openrouter/anthropic/claude-fable-5.1"]);
assert.deepEqual(values(filterOptions(options, "FABLE 5.1")), ["openrouter/anthropic/claude-fable-5.1"]);
assert.deepEqual(values(filterOptions(options, "claude fable")), ["", "openrouter/anthropic/claude-fable-5", "openrouter/anthropic/claude-fable-5.1"]);

// 3. The query is found inside a value, so an id matches its model.
assert.deepEqual(values(filterOptions(options, "openai/gpt")), ["openrouter/openai/gpt-5"]);

// 4. It is a plain contains match: the words must be in the same order and next to each other.
assert.deepEqual(filterOptions(options, "5 fable"), []);

// 5. No match gives an empty list.
assert.deepEqual(filterOptions(options, "llama"), []);

console.log("option filter tests passed");
