import type { ToolSpec } from "../../adapters/contract.js";
import { searchRoomMessages } from "../../storage/room.js";
import { fail, ok } from "./result.js";

// How many matches one search returns, and how much of each message it shows.
const MAX_RESULTS = 10;
const MAX_SNIPPET = 400;

// Searches the shared room's messages. A bot's prompt holds only the latest messages, so this is how it finds older ones.
export const roomSearchTool: ToolSpec = {
  name: "room_search",
  guide: "Searches every message in the shared room by words, so you can find what was said earlier. The latest messages are already in your prompt, so use this when someone refers to an older message or to something a bot said before.",
  description: "Search the messages of the shared room. Returns the newest matches with their authors. A message matches when it contains every word.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string", description: "Words to look for, such as a name or a topic" } },
    required: ["query"],
  },
  async run({ query }) {
    const words = (String(query ?? "").match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => word.length >= 2);
    if (words.length === 0) return fail("Give at least one word to search for.");
    const found = searchRoomMessages(words, MAX_RESULTS);
    if (found.length === 0) return ok("No message matches. Try fewer or different words.");
    return ok(found.map((message) => `${message.authorName}: ${oneLine(message.text)}`).join("\n"));
  },
};

// The message on one line, cut when it is long.
function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_SNIPPET ? `${flat.slice(0, MAX_SNIPPET)}…` : flat;
}
