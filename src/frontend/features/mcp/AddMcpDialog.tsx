import { useState } from "preact/hooks";
import { errorText } from "../../api/client";
import type { NewMcpServer } from "../../api/types";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { Modal } from "../../ui/Modal";
import { parseArgs, parseEnv, parseHeaders } from "./mcpForm";

// The form that adds an MCP server. OAuth is the default: the user gives the server's address, and signs in on the server's own page.
// Manual entry is for a server without OAuth: a web address with headers, or a local command with its arguments and environment.
export function AddMcpDialog({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (server: NewMcpServer) => Promise<void> }) {
  const [mode, setMode] = useState<"oauth" | "manual">("oauth");
  const [kind, setKind] = useState<"web" | "command">("web");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [env, setEnv] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  function reset() {
    setMode("oauth");
    setKind("web");
    setName("");
    setUrl("");
    setHeaders("");
    setCommand("");
    setArgs("");
    setEnv("");
    setError(undefined);
  }

  function close() {
    reset();
    onClose();
  }

  // Builds the server from the form. A line the readers refuse throws, and its message is shown.
  function build(): NewMcpServer {
    const serverName = name.trim();
    if (!serverName) throw new Error("Give the server a name.");
    if (mode === "oauth") return { name: serverName, transport: "oauth", url: url.trim() };
    if (kind === "web") return { name: serverName, transport: "http", url: url.trim(), headers: parseHeaders(headers) };
    return { name: serverName, transport: "stdio", command: command.trim(), args: parseArgs(args), env: parseEnv(env) };
  }

  async function submit(e: Event) {
    e.preventDefault();
    setError(undefined);
    setBusy(true);
    try {
      await onAdd(build());
      close();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
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
              mip opens the server's own sign-in page in a new tab. You sign in there, and the server sends you back to mip.
            </div>
            <label className="flex flex-col gap-1 text-sm">
              Server address
              <input className="input input-sm w-full" placeholder="https://mcp.example.com/mcp" value={url} onInput={(e) => setUrl(e.currentTarget.value)} />
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
            Add server
          </button>
        </div>
      </form>
    </Modal>
  );
}
