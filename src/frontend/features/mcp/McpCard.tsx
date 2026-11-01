import { useState } from "preact/hooks";
import { errorText } from "../../api/client";
import type { McpServer } from "../../api/types";
import { Card, CardBody, ExpandButton, useCardExpansion } from "../../ui/Card";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { AddMcpDialog } from "./AddMcpDialog";
import { summaryLine } from "./mcpSummary";
import { goToSignIn, isWebLink, openSignInTab } from "./signInWindow";
import { useMcpServers } from "./useMcpServers";

// The MCP servers in mcp.json. Each one shows whether it is connected and the tools it offers, and an error when it is not. A server
// that signs in with OAuth shows its sign-in link. Add server writes a new entry, and Remove takes one out. Reload reconnects from the file.
export function McpCard() {
  return (
    <Card glow="red">
      <McpBody />
    </Card>
  );
}

function McpBody() {
  const { expanded } = useCardExpansion();
  const { status, busy, error, reload, signIn, add, remove } = useMcpServers();
  const servers = status?.servers ?? [];
  const [adding, setAdding] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<string>();
  const [removeError, setRemoveError] = useState<string>();

  async function confirmRemove() {
    if (!pendingRemove) return;
    setRemoveError(undefined);
    try {
      await remove(pendingRemove);
      setPendingRemove(undefined);
    } catch (err) {
      setRemoveError(errorText(err));
    }
  }

  function cancelRemove() {
    setPendingRemove(undefined);
    setRemoveError(undefined);
  }

  // Starts a server's sign-in, and opens its sign-in page in a new tab once the server has answered with the link.
  async function startSignIn(name: string) {
    const tab = openSignInTab();
    const next = await signIn(name);
    goToSignIn(tab, next?.servers.find((server) => server.name === name)?.signInUrl);
  }

  return (
    <CardBody
      title="MCP"
      className={expanded ? "min-h-0 flex-1" : ""}
      actions={
        <>
          <button className="btn btn-ghost btn-sm" onClick={() => setAdding(true)} disabled={busy}>
            Add server
          </button>
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
          No MCP servers yet. Press Add server to connect one, or list them in <code className="break-all">{status.configFile}</code>, then press Reload.
        </div>
      )}

      {servers.length > 0 && (
        <ul className={expanded ? "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto" : "flex flex-col gap-2"}>
          {servers.map((server) => (
            <ServerRow
              key={server.name}
              server={server}
              busy={busy}
              onSignIn={() => void startSignIn(server.name)}
              onRemove={() => setPendingRemove(server.name)}
            />
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

      <AddMcpDialog open={adding} onClose={() => setAdding(false)} onAdd={add} />
      <ConfirmDialog
        open={!!pendingRemove}
        glow="red"
        title="Remove this server?"
        message={`"${pendingRemove ?? ""}" is taken out of mcp.json, with its sign-in and any token it holds. Its tools go away.`}
        error={removeError}
        onConfirm={confirmRemove}
        onCancel={cancelRemove}
      />
    </CardBody>
  );
}

// One server: its name, how it connects, its state, and the reason it failed. A server that signs in with OAuth shows its sign-in link
// while it waits. Expanded, it also lists its tools.
function ServerRow({ server, busy, onSignIn, onRemove }: { server: McpServer; busy: boolean; onSignIn: () => void; onRemove: () => void }) {
  const { expanded } = useCardExpansion();
  const size = expanded ? "badge-sm" : "badge-xs";
  const link = isWebLink(server.signInUrl) ? server.signInUrl : null;
  return (
    <li className="flex min-w-0 flex-col gap-1 rounded-box border border-base-300 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium break-all">{server.name}</span>
        <span className={`badge badge-ghost ${size}`}>{server.oauth ? "OAuth" : server.transport}</span>
        {server.status === "connecting" && <span className={`badge badge-warning badge-soft ${size}`}>starting</span>}
        {server.status === "connected" && <span className={`badge badge-success badge-soft ${size}`}>connected</span>}
        {server.status === "sign-in" && <span className={`badge badge-info badge-soft ${size}`}>needs sign-in</span>}
        {server.status === "error" && <span className={`badge badge-error badge-soft ${size}`}>failed</span>}
        {server.status === "connected" && (
          <span className="text-xs opacity-60">
            {server.tools.length} {server.tools.length === 1 ? "tool" : "tools"}
          </span>
        )}
      </div>

      {server.error && <p className={`${expanded ? "text-sm" : "text-xs"} break-words text-error`}>{server.error}</p>}

      {server.status === "sign-in" && <div className="text-xs opacity-70">Sign in on the server's page. This row updates once you have.</div>}

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

      <div className="flex flex-wrap items-center justify-end gap-2">
        {server.oauth && server.status === "sign-in" && link && (
          <a className="btn btn-primary btn-sm" href={link} target="_blank" rel="noopener noreferrer">
            Sign in
          </a>
        )}
        {server.oauth && (server.status === "error" || (server.status === "sign-in" && !link)) && (
          <button className="btn btn-outline btn-sm" onClick={onSignIn} disabled={busy}>
            Sign in
          </button>
        )}
        {server.oauth && server.status === "sign-in" && link && (
          <button className="btn btn-ghost btn-sm" onClick={onSignIn} disabled={busy}>
            New link
          </button>
        )}
        <button className="btn btn-ghost btn-sm text-error" onClick={onRemove} disabled={busy}>
          Remove
        </button>
      </div>
    </li>
  );
}
