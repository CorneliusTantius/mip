import type { McpServer } from "../../api/types";

// The line under the MCP card's title: how many servers are connected, starting, waiting for sign-in, or failed, and how many tools they
// offer. A part that is zero is left out, so a server list with nothing connected says only that, and an empty list says it is empty.
export function summaryLine(servers: McpServer[]): string {
  if (servers.length === 0) return "No servers configured.";
  const connected = servers.filter((server) => server.status === "connected");
  const starting = servers.filter((server) => server.status === "connecting").length;
  const signIn = servers.filter((server) => server.status === "sign-in").length;
  const failed = servers.filter((server) => server.status === "error").length;
  const tools = connected.reduce((sum, server) => sum + server.tools.length, 0);

  const parts: string[] = [];
  if (connected.length > 0) parts.push(`${connected.length} connected`);
  if (starting > 0) parts.push(`${starting} starting`);
  if (signIn > 0) parts.push(`${signIn} need sign-in`);
  if (failed > 0) parts.push(`${failed} failed`);
  parts.push(`${tools} ${tools === 1 ? "tool" : "tools"}`);
  return parts.join(", ");
}
