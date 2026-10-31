import { useState } from "preact/hooks";
import { api, errorText } from "../../api/client";
import { ErrorAlert } from "../../ui/ErrorAlert";

// The server is down while it restarts. Poll until it answers again, then reload, so the page runs the new build.
function reloadWhenBack() {
  const check = () =>
    api.get("/api/providers").then(
      () => window.location.reload(),
      () => window.setTimeout(check, 1000),
    );
  // Wait before the first check, so the old server has stopped answering.
  window.setTimeout(check, 2000);
}

// Keeps mip in step with its code. Pull latest fetches the newest commits. Restart installs dependencies, builds, and starts
// the server again, so the new code runs.
export function UpdateTab() {
  const [busy, setBusy] = useState<"pull" | "restart">();
  const [output, setOutput] = useState<string>();
  const [error, setError] = useState<string>();

  async function pull() {
    setBusy("pull");
    setError(undefined);
    setOutput(undefined);
    try {
      const data = await api.post<{ output: string }>("/api/system/update", {});
      setOutput(data.output || "Already up to date.");
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(undefined);
  }

  async function restart() {
    setBusy("restart");
    setError(undefined);
    try {
      await api.post("/api/system/restart", {});
    } catch (err) {
      setError(errorText(err));
      setBusy(undefined);
      return;
    }
    reloadWhenBack();
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">Pull latest</h3>
        <p className="text-sm opacity-70">Fetches the newest commits for this checkout's branch. Fast-forward only. Restart to run them.</p>
        <div>
          <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={pull}>
            {busy === "pull" && <span className="loading loading-spinner loading-xs" />}
            Pull latest
          </button>
        </div>
        {output && <pre className="whitespace-pre-wrap break-all text-xs opacity-80">{output}</pre>}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">Restart</h3>
        <p className="text-sm opacity-70">Installs dependencies, builds, and starts the server again. The page reloads when the server is back.</p>
        <div>
          <button className="btn btn-sm" disabled={!!busy} onClick={restart}>
            {busy === "restart" && <span className="loading loading-spinner loading-xs" />}
            Restart
          </button>
        </div>
        {busy === "restart" && <p className="text-sm opacity-70">Restarting. This page reloads when the server answers again.</p>}
      </section>

      <ErrorAlert message={error} />
    </div>
  );
}
