// Checks what the email card shows for the Gmail server in each state: not listed yet, not connected, starting, waiting for sign-in,
// failed, and connected. Run with: node src/frontend/features/email/gmailStatus.test.mjs
import assert from "node:assert/strict";
import { GMAIL_SERVER, gmailStatus } from "./gmailStatus.ts";

const tool = (name, enabled) => ({ name: `mcp_gmail_${name}`, remoteName: name, description: "", enabled });
const server = (overrides) => ({ name: GMAIL_SERVER, transport: "http", status: "connected", error: null, oauth: true, signInUrl: null, tools: [], ...overrides });

// 1. Until the list has loaded, the card says so and does not claim anything.
assert.deepEqual(gmailStatus({ loaded: false }), { status: "Checking", tone: "neutral", detail: "Reading the MCP servers." });

// 2. A list that cannot be read is shown as the reason.
assert.deepEqual(gmailStatus({ loaded: true, error: "network down" }), { status: "Unavailable", tone: "error", detail: "network down" });

// 3. No Gmail server in the list: the card says how to add one, under the name it looks for.
const missing = gmailStatus({ loaded: true });
assert.equal(missing.status, "Not connected");
assert.equal(missing.tone, "neutral");
assert.match(missing.detail, /named gmail/);

// 4. The server's own states map to the card's badges.
assert.equal(gmailStatus({ loaded: true, server: server({ status: "connecting" }) }).status, "Connecting");
assert.equal(gmailStatus({ loaded: true, server: server({ status: "connecting" }) }).tone, "warning");
assert.equal(gmailStatus({ loaded: true, server: server({ status: "sign-in" }) }).status, "Needs sign-in");
assert.equal(gmailStatus({ loaded: true, server: server({ status: "sign-in" }) }).tone, "info");

// 5. A failed server shows its reason, or a plain line when it gave none.
assert.deepEqual(gmailStatus({ loaded: true, server: server({ status: "error", error: "the connection closed" }) }), {
  status: "Failed",
  tone: "error",
  detail: "the connection closed",
});
assert.equal(gmailStatus({ loaded: true, server: server({ status: "error", error: null }) }).detail, "The Gmail server did not start.");

// 6. A connected server counts the tools agents are offered, not every tool it lists.
const connected = gmailStatus({ loaded: true, server: server({ tools: [tool("read", true), tool("draft", false), tool("forward", true)] }) });
assert.deepEqual(connected, { status: "Connected", tone: "success", detail: "2 of 3 tools offered to agents." });

console.log("gmail status tests passed");
