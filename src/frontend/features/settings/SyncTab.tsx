import { useState } from "preact/hooks";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { useSync } from "./useSync";

// Sync keeps mip's data in a private dotmip repo on the user's GitHub account. Connect once, then sync whenever you like.
// Repository clones, chat files, and provider logins stay on this machine.
export function SyncTab() {
  const sync = useSync();
  const { status } = sync;
  // What the client ID field shows while it is being edited. Until then it shows the saved ID.
  const [draft, setDraft] = useState<string>();
  const busy = !!status && (status.running || !!status.device);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">GitHub</h3>
        <p className="text-sm opacity-70">
          Sync stores your chats, notes, personas, and bots in a private repo named dotmip on your GitHub account. It creates the repo the first time.
        </p>

        <label className="flex flex-col gap-1 text-sm">
          <span className="opacity-70">OAuth client ID</span>
          <div className="flex gap-2">
            <input
              className="input input-sm flex-1"
              placeholder="Iv1.xxxxxxxxxxxxxxxx"
              value={draft ?? status?.clientId ?? ""}
              onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
            />
            <button className="btn btn-sm" disabled={!draft?.trim()} onClick={() => sync.saveClientId(draft ?? "")}>
              Save
            </button>
          </div>
        </label>
        <p className="text-xs opacity-60">
          Create a GitHub OAuth App (Settings, Developer settings, OAuth Apps), turn on Device Flow, and paste its Client ID here. No client
          secret is needed.
        </p>

        {status?.connected ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm">
              Signed in as <strong>{status.login}</strong>. Data syncs to <code>{status.repo}</code>.
            </span>
            <button className="btn btn-sm" onClick={sync.disconnect}>
              Disconnect
            </button>
          </div>
        ) : (
          <div>
            <button className="btn btn-primary btn-sm" disabled={!status?.clientId || busy} onClick={sync.connect}>
              Connect GitHub
            </button>
          </div>
        )}

        {status?.device && (
          <div className="flex flex-col gap-2 rounded-box bg-base-300/60 p-3 text-sm">
            <span>
              Open{" "}
              <a className="link" href={status.device.verificationUri} target="_blank" rel="noreferrer">
                {status.device.verificationUri}
              </a>{" "}
              and enter this code:
            </span>
            <code className="text-lg tracking-widest">{status.device.userCode}</code>
            <span className="flex items-center gap-2 opacity-70">
              <span className="loading loading-spinner loading-xs" />
              Waiting for approval on GitHub.
            </span>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">Sync now</h3>
        <p className="text-sm opacity-70">
          Pulls changes from GitHub, merges them with this machine, and pushes the result. When both sides edited the same item, the newer edit is kept.
          Messages from both sides are kept.
        </p>
        <div>
          <button className="btn btn-primary btn-sm" disabled={!status?.connected || busy} onClick={sync.run}>
            {status?.running && <span className="loading loading-spinner loading-xs" />}
            Sync now
          </button>
        </div>

        {status?.lastSync && (
          <div className="flex flex-col gap-1 text-sm">
            <span className={status.lastSync.ok ? "" : "text-error"}>
              {new Date(status.lastSync.at).toLocaleString()}: {status.lastSync.message}
            </span>
            {status.lastSync.notes.map((note) => (
              <span key={note} className="text-xs opacity-70">
                {note}
              </span>
            ))}
          </div>
        )}
      </section>

      <ErrorAlert message={sync.error ?? status?.error} />
    </div>
  );
}
