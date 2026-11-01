import { useState } from "preact/hooks";
import { errorText } from "../../api/client";
import type { McpStatus, NewMcpServer } from "../../api/types";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { Modal } from "../../ui/Modal";
import { parseArgs, parseEnv, parseHeaders } from "./mcpForm";
import { goToSignIn, isWebLink, openSignInTab } from "./signInWindow";

// The form that adds an MCP server. OAuth is the default: the user gives the server's address, and the one button adds the server and opens
// its sign-in page in a new tab. Manual entry is for a server without OAuth: a web address with headers, or a local command with its
// arguments and environment.
export function AddMcpDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (server: NewMcpServer) => Promise<McpStatus>;
}) {
  const [mode, setMode] = useState<"oauth" | "manual">("oauth");
  const [kind, setKind] = useState<"web" | "command">("web");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [env, setEnv] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // The sign-in link of a server that was added while the browser blocked the sign-in tab. The dialog then offers the link as a button.
  const [signInLink, setSignInLink] = useState<string>();

  function reset() {
    setMode("oauth");
    setKind("web");
    setName("");
    setUrl("");
    setHeaders("");
    setCommand("");
    setArgs("");
    setEnv("");
    setClientId("");
    setClientSecret("");
    setError(undefined);
    setSignInLink(undefined);
  }

  function close() {
    reset();
    onClose();
  }

  // Builds the server from the form. A line the readers refuse throws, and its message is shown.
  function build(): NewMcpServer {
    const serverName = name.trim();
    if (!serverName) throw new Error("Give the server a name.");
    if (mode === "oauth") return { name: serverName, transport: "oauth", url: url.trim(), clientId: clientId.trim() || undefined, clientSecret: clientSecret.trim() || undefined };
    if (kind === "web") return { name: serverName, transport: "http", url: url.trim(), headers: parseHeaders(headers) };
    return { name: serverName, transport: "stdio", command: command.trim(), args: parseArgs(args), env: parseEnv(env) };
  }

  async function submit(e: Event) {
    e.preventDefault();
    setError(undefined);
    let server: NewMcpServer;
    try {
      server = build();
    } catch (err) {
      setError(errorText(err));
      return;
    }
    // An OAuth server's sign-in tab is opened now, from this click. Its address is set once the server has answered.
    const tab = server.transport === "oauth" ? openSignInTab() : null;
    setBusy(true);
    try {
      const status = await onAdd(server);
      const link = status.servers.find((candidate) => candidate.name === server.name)?.signInUrl;
      if (goToSignIn(tab, link)) close();
      else if (isWebLink(link)) setSignInLink(link);
      else close();
    } catch (err) {
      tab?.close();
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  // The server is added, but the browser blocked its sign-in tab. The link is offered as a button, which opens the page itself.
  if (signInLink) {
    return (
      <Modal open={open} onClose={close} closeButton glow="red">
        <div className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold">Sign in to {name.trim()}</h3>
          <div className="text-sm opacity-70">The server is added. Your browser blocked the sign-in tab, so open the server's sign-in page from here.</div>
          <div className="modal-action mt-0">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Close
            </button>
            <a className="btn btn-primary" href={signInLink} target="_blank" rel="noopener noreferrer">
              Open sign-in page
            </a>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={close} closeButton glow="red">
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <h3 className="text-lg font-semibold">Add MCP server</h3>

        <label className="flex flex-col gap-1 text-sm">
          Name
          <input className="input input-sm w-full" placeholder="docs" value={name} onInput={(e) => setName(e.currentTarget.value)} />
          <div className="text-xs opacity-60">Letters, digits, - and _, up to 32 characters. Tools are named after it.</div>
        </label>

        <div className="join self-start" role="group" aria-label="How the server connects">
          <button type="button" className={`btn btn-sm join-item ${mode === "oauth" ? "btn-active" : ""}`} onClick={() => setMode("oauth")}>
            OAuth sign-in
          </button>
          <button type="button" className={`btn btn-sm join-item ${mode === "manual" ? "btn-active" : ""}`} onClick={() => setMode("manual")}>
            Manual entry
          </button>
        </div>

        {mode === "oauth" && (
          <>
            <div className="text-sm opacity-70">
              mip adds the server, then opens its sign-in page in a new tab. You sign in there, and the server sends you back to mip. A new
              server offers no tools until you allow some in the card.
            </div>
            <label className="flex flex-col gap-1 text-sm">
              Server address
              <input className="input input-sm w-full" placeholder="https://mcp.example.com/mcp" value={url} onInput={(e) => setUrl(e.currentTarget.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Client ID <span className="opacity-60">(optional)</span>
              <input className="input input-sm w-full font-mono" value={clientId} onInput={(e) => setClientId(e.currentTarget.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Client secret <span className="opacity-60">(optional)</span>
              <input
                type="password"
                autoComplete="off"
                className="input input-sm w-full font-mono"
                value={clientSecret}
                onInput={(e) => setClientSecret(e.currentTarget.value)}
              />
              <div className="text-xs opacity-60">
                Leave both blank for a server that registers mip itself. Google's servers need a client from your own Google Cloud project.
              </div>
            </label>
          </>
        )}

        {mode === "manual" && (
          <>
            <div className="join self-start" role="group" aria-label="What the server is">
              <button type="button" className={`btn btn-sm join-item ${kind === "web" ? "btn-active" : ""}`} onClick={() => setKind("web")}>
                Web address
              </button>
              <button type="button" className={`btn btn-sm join-item ${kind === "command" ? "btn-active" : ""}`} onClick={() => setKind("command")}>
                Local command
              </button>
            </div>

            {kind === "web" && (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  Server address
                  <input className="input input-sm w-full" placeholder="https://mcp.example.com/mcp" value={url} onInput={(e) => setUrl(e.currentTarget.value)} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Headers, one per line
                  <textarea
                    className="textarea textarea-sm w-full font-mono"
                    placeholder="Authorization: Bearer your-token"
                    value={headers}
                    onInput={(e) => setHeaders(e.currentTarget.value)}
                  />
                </label>
              </>
            )}

            {kind === "command" && (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  Command
                  <input className="input input-sm w-full font-mono" placeholder="npx" value={command} onInput={(e) => setCommand(e.currentTarget.value)} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Arguments, one per line
                  <textarea className="textarea textarea-sm w-full font-mono" placeholder="-y" value={args} onInput={(e) => setArgs(e.currentTarget.value)} />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Environment, one KEY=value per line
                  <textarea className="textarea textarea-sm w-full font-mono" placeholder="TOKEN=abc" value={env} onInput={(e) => setEnv(e.currentTarget.value)} />
                </label>
                <div className="text-xs opacity-60">A command runs on this machine with the values you give here.</div>
              </>
            )}
          </>
        )}

        <ErrorAlert message={error} />

        <div className="modal-action mt-0">
          <button type="button" className="btn btn-ghost" onClick={close}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy && <span className="loading loading-spinner loading-xs" />}
            {mode === "oauth" ? "Add and sign in" : "Add server"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
