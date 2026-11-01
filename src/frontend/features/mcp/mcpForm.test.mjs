// Checks the add-server form's readers: headers as "Name: value", environment as "KEY=value", arguments one per line, and a clear message
// for a line that is wrong. Run after a build: node src/frontend/features/mcp/mcpForm.test.mjs
import assert from "node:assert/strict";
import { parseArgs, parseEnv, parseHeaders } from "./mcpForm.ts";

// 1. Blank lines are skipped, and a value may contain colons and equals signs.
assert.deepEqual(parseHeaders("Authorization: Bearer abc:def\n\n  X-Team:  mip  \n"), { Authorization: "Bearer abc:def", "X-Team": "mip" });
assert.deepEqual(parseEnv("TOKEN=a=b\n\nMODE= fast "), { TOKEN: "a=b", MODE: "fast" });
assert.deepEqual(parseHeaders(""), {});
assert.deepEqual(parseEnv("   \n"), {});

// 2. Arguments keep their order, and an argument with spaces stays whole.
assert.deepEqual(parseArgs("serve\n--root\n/home/me/my notes\n"), ["serve", "--root", "/home/me/my notes"]);
assert.deepEqual(parseArgs(""), []);

// 3. A header without a name or a colon is refused, and the message shows the line.
assert.throws(() => parseHeaders("Authorization Bearer abc"), /A header needs a name and a colon.*Authorization Bearer abc/);
assert.throws(() => parseHeaders(": value"), /A header needs a name/);

// 4. An environment value without an equals sign is refused, and so is one without a name.
assert.throws(() => parseEnv("TOKEN"), /An environment value needs a name.*TOKEN/);
assert.throws(() => parseEnv("=abc"), /An environment value needs a name/);

console.log("MCP form tests passed");
