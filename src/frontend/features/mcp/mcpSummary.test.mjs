// Checks the line under the MCP card's title: which servers it counts, and the word for tools.
// Run after a build: node src/frontend/features/mcp/mcpSummary.test.mjs
import assert from "node:assert/strict";
import { summaryLine } from "./mcpSummary.ts";

const tool = (name) => ({ name: `mcp_x_${name}`, remoteName: name, description: name });
const server = (name, status, tools = [], error = null) => ({ name, transport: "stdio", status, error, tools });

// 1. No servers at all.
assert.equal(summaryLine([]), "No servers configured.");

// 2. Connected servers count their tools, and the word follows the number.
assert.equal(summaryLine([server("a", "connected", [tool("one")])]), "1 connected, 1 tool");
assert.equal(summaryLine([server("a", "connected", [tool("one"), tool("two")]), server("b", "connected", [tool("three")])]), "2 connected, 3 tools");

// 3. Starting and failed servers are counted, and a failed one adds no tools.
assert.equal(summaryLine([server("a", "connected", [tool("one")]), server("b", "error", [], "spawn failed")]), "1 connected, 1 failed, 1 tool");
assert.equal(summaryLine([server("a", "connecting")]), "1 starting, 0 tools");

// 4. Nothing connected leaves out the connected part.
assert.equal(summaryLine([server("a", "error", [], "boom")]), "1 failed, 0 tools");

// 5. A server waiting for sign-in is counted on its own, not as failed.
assert.equal(summaryLine([server("a", "sign-in")]), "1 need sign-in, 0 tools");
assert.equal(summaryLine([server("a", "connected", [tool("one")]), server("b", "sign-in")]), "1 connected, 1 need sign-in, 1 tool");

console.log("MCP summary tests passed");
