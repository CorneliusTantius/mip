// Checks the list a server is saved with when one of its tools is offered or withheld. Run with: node src/frontend/features/mcp/toolAllowList.test.mjs
import assert from "node:assert/strict";
import { allowedAfter } from "./toolAllowList.ts";

const tool = (remoteName, enabled) => ({ name: `mcp_docs_${remoteName}`, remoteName, description: "", enabled });

// 1. Offering a tool adds it to the list, in the server's order.
const tools = [tool("read", true), tool("draft", false), tool("forward", false)];
assert.deepEqual(allowedAfter(tools, "forward", true), ["read", "forward"]);

// 2. Withholding a tool takes it out, and keeps the others.
const three = [tool("read", true), tool("draft", true), tool("forward", true)];
assert.deepEqual(allowedAfter(three, "draft", false), ["read", "forward"]);
assert.deepEqual(allowedAfter(tools, "read", false), []);

// 3. When every tool is offered, no list is saved, so a tool the server adds later is offered too.
assert.equal(allowedAfter([tool("read", true), tool("draft", false)], "draft", true), null);

// 4. A server with no tools has nothing to withhold, so no list is saved.
assert.equal(allowedAfter([], "read", false), null);

console.log("tool allow list tests passed");
