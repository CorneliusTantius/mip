import type { ToolSpec } from "../../adapters/contract.js";
import { enabledSkill, readSkillFile } from "../skills/registry.js";
import { ok } from "./result.js";

// The chat a skill tool works for. A run without a chat has no skills.
function chatOf(chatId: string | undefined): string {
  if (!chatId) throw new Error("skills are only available inside a chat");
  return chatId;
}

// Reads a skill the chat has enabled: its instructions, and the files it names.
export const skillReadTool: ToolSpec = {
  name: "skill_read",
  guide: "Reads a skill this chat has enabled: its instructions and the files it names. When a task matches a skill in the skill list, call this with the skill's name before you start, and follow what it says.",
  description: "Read a skill enabled for this chat: its instructions and the files it names. Call this before a task that a listed skill covers.",
  inputSchema: {
    type: "object",
    properties: { name: { type: "string", description: "The skill's name, as listed in the system prompt." } },
    required: ["name"],
  },
  async run(input, context) {
    const skill = enabledSkill(chatOf(context.chatId), String(input.name ?? ""));
    const files = skill.files.length > 0 ? `\n\nFiles in this skill (read them with skill_file): ${skill.files.join(", ")}` : "";
    return ok(`# ${skill.name}\n\n${skill.body}${files}`);
  },
};

// Reads one text file that a skill lists. The skill must be enabled for the chat.
export const skillFileTool: ToolSpec = {
  name: "skill_file",
  guide: "Reads one text file that an enabled skill names, using the path that skill_read listed. Only the files a skill lists can be read.",
  description: "Read one text file that an enabled skill lists, as skill_read named it.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "The skill's name." },
      path: { type: "string", description: "The file's path inside the skill." },
    },
    required: ["name", "path"],
  },
  async run(input, context) {
    const name = String(input.name ?? "");
    enabledSkill(chatOf(context.chatId), name);
    return ok(readSkillFile(name, String(input.path ?? "")));
  },
};
