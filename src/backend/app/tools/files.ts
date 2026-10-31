import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ToolSpec } from "../../adapters/contract.js";
import { fail, ok } from "./result.js";
import { inWorkspace } from "./workspace.js";

const MAX_LINES = 2000;
const MAX_BYTES = 50_000;

export const readTool: ToolSpec = {
  name: "read",
  description: "Read a text file in the workspace. Use offset and limit to read part of a long file.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path, relative to the workspace" },
      offset: { type: "number", description: "Line to start at, counting from 1" },
      limit: { type: "number", description: "How many lines to read" },
    },
    required: ["path"],
  },
  async run({ path, offset = 1, limit }, { workspace }) {
    const lines = (await readFile(inWorkspace(workspace, path), "utf8")).split("\n");
    const from = Math.max(0, offset - 1);
    const to = Math.min(lines.length, from + (limit ?? MAX_LINES), from + MAX_LINES);
    let text = lines.slice(from, to).join("\n");
    if (text.length > MAX_BYTES) text = text.slice(0, MAX_BYTES) + "\n[cut at 50 KB]";
    if (to < lines.length) text += `\n[showing lines ${from + 1}-${to} of ${lines.length}]`;
    return ok(text);
  },
};

export const writeTool: ToolSpec = {
  name: "write",
  description: "Create or overwrite a file in the workspace. Missing folders are created.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path, relative to the workspace" },
      content: { type: "string", description: "Full text to write" },
    },
    required: ["path", "content"],
  },
  async run({ path, content }, { workspace }) {
    const full = inWorkspace(workspace, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
    return ok(`Wrote ${Buffer.byteLength(content)} bytes to ${path}`);
  },
};

export const editTool: ToolSpec = {
  name: "edit",
  description: "Replace one exact piece of text in a file. oldText must appear exactly once, so include enough context to make it unique.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path, relative to the workspace" },
      oldText: { type: "string", description: "Exact text to replace" },
      newText: { type: "string", description: "Text to put in its place" },
    },
    required: ["path", "oldText", "newText"],
  },
  async run({ path, oldText, newText }, { workspace }) {
    if (!oldText) return fail("oldText is empty");
    const full = inWorkspace(workspace, path);
    const text = await readFile(full, "utf8");
    const matches = text.split(oldText).length - 1;
    if (matches === 0) return fail(`oldText was not found in ${path}`);
    if (matches > 1) return fail(`oldText matches ${matches} places in ${path}; include more context so it matches once`);
    // A function replacement keeps "$" in newText from being read as a pattern.
    await writeFile(full, text.replace(oldText, () => newText));
    return ok(`Edited ${path}`);
  },
};
