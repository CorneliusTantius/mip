// The name a tool shows as in a transcript. The Claude CLI names an MCP tool mcp__<server>__<tool>. mip's server is "mip", so its
// tools arrive as mcp__mip__bash, and the prefix is dropped. Other names, such as Pi's, are shown as they are.
export function toolLabel(name: string): string {
  return name.replace(/^mcp__.+?__/, "");
}
