import type { McpServer } from "../../api/types";
import { Card, CardBody, ExpandButton, useCardExpansion } from "../../ui/Card";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { summaryLine } from "./mcpSummary";
import { useMcpServers } from "./useMcpServers";

// The MCP servers listed in mcp.json. Each one shows whether it is connected and the tools it offers, and an error when it is not.
// Reload reconnects from the file after the file changes.
export function McpCard() {
  return (
    <Card glow="red">
      <McpBody />
    </Card>
  );
}

function McpBody() {
  const { expanded } = useCardExpansion();
  const { status, busy, error, reload } = useMcpServers();
  const servers = status?.servers ?? [];

  return (
    <CardBody
      title="MCP"
      className={expanded ? "min-h-0 flex-1" : ""}
      actions={
        <>
          <button className="btn btn-ghost btn-sm" onClick={reload} disabled={busy}>
            {busy && <span className="loading loading-spinner loading-xs" />}
            Reload
          </button>
          <ExpandButton />
        </>
      }
    >
      {/* These are divs, not paragraphs: daisyUI makes every paragraph in a card body grow to fill an expanded card. */}
      {status ? <div className="text-sm opacity-70">{summaryLine(servers)}</div> : !error && <div className="text-sm opacity-60">Loading servers…</div>}

      {status && servers.length === 0 && (
        <div className="py-4 text-center text-sm opacity-60">
          No MCP servers yet. List them in <code className="break-all">{status.configFile}</code>, then press Reload.
        </div>
      )}

      {servers.length > 0 && (
        <ul className={expanded ? "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto" : "flex flex-col gap-2"}>
          {servers.map((server) => (
            <ServerRow key={server.name} server={server} />
          ))}
        </ul>
      )}

      {status && status.problems.length > 0 && (
        <div className={`${expanded ? "text-sm" : "text-xs"} flex flex-col gap-1 text-warning`}>
          {status.problems.map((problem) => (
            <p key={`${problem.server}:${problem.error}`} className="break-words">
              <strong>{problem.server}</strong>: {problem.error}
            </p>
          ))}
        </div>
      )}
      <ErrorAlert message={error} />
    </CardBody>
  );
}

// One server: its name, how it connects, its state, and the reason it failed. Expanded, it also lists its tools.
function ServerRow({ server }: { server: McpServer }) {
  const { expanded } = useCardExpansion();
  const size = expanded ? "badge-sm" : "badge-xs";
  return (
    <li className="flex min-w-0 flex-col gap-1 rounded-box border border-base-300 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium break-all">{server.name}</span>
        <span className={`badge badge-ghost ${size}`}>{server.transport}</span>
        {server.status === "connecting" && <span className={`badge badge-warning badge-soft ${size}`}>starting</span>}
        {server.status === "connected" && <span className={`badge badge-success badge-soft ${size}`}>connected</span>}
        {server.status === "error" && <span className={`badge badge-error badge-soft ${size}`}>failed</span>}
        {server.status === "connected" && (
          <span className="text-xs opacity-60">
            {server.tools.length} {server.tools.length === 1 ? "tool" : "tools"}
          </span>
        )}
      </div>

      {server.error && <p className={`${expanded ? "text-sm" : "text-xs"} break-words text-error`}>{server.error}</p>}

      {!expanded && server.tools.length > 0 && (
        <p className="truncate text-xs opacity-60">{server.tools.map((tool) => tool.name).join(", ")}</p>
      )}

      {expanded && server.tools.length > 0 && (
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Tool</th>
              <th>Name on the server</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {server.tools.map((tool) => (
              <tr key={tool.name}>
                <td className="break-all font-medium">{tool.name}</td>
                <td className="break-all">{tool.remoteName}</td>
                <td>{tool.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </li>
  );
}
