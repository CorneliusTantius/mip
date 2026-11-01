import type { McpTool } from "../../api/types";

// The allowed list a server is saved with after one of its tools is offered, or withheld. A list that offers every tool is saved as null,
// the same as a server with no list, so a tool the server adds later is offered too.
export function allowedAfter(tools: McpTool[], remoteName: string, offered: boolean): string[] | null {
  const allowed = new Set(tools.filter((tool) => tool.enabled).map((tool) => tool.remoteName));
  if (offered) allowed.add(remoteName);
  else allowed.delete(remoteName);
  if (tools.every((tool) => allowed.has(tool.remoteName))) return null;
  return tools.filter((tool) => allowed.has(tool.remoteName)).map((tool) => tool.remoteName);
}
