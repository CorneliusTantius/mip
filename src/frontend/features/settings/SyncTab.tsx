import { ErrorAlert } from "../../ui/ErrorAlert";
import { useSync } from "./useSync";

// Sync keeps mip's data in a private dotmip repo on the GitHub account the GitHub CLI is signed in to on this machine.
// mip never stores a token. Each sync asks gh for one.
export function SyncTab() {
  const { status, error, run } = useSync();
  const running = !!status?.running;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">GitHub</h3>
        <p className="text-sm opacity-70">
          Sync keeps your chats, notes, personas, and bots in a private repo named dotmip. It uses the account that the GitHub CLI (gh) is
          signed in to here. Repository clones, chat files, and provider logins stay on this machine.
        </p>
        {status?.login ? (
          <p className="text-sm">
            Signed in as <strong>{status.login}</strong>. Data syncs to <code>{status.repo}</code>.
          </p>
        ) : (
          <p className="text-sm opacity-70">
            Not signed in. Run <code>gh auth login</code> in a terminal, then reopen Settings.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">Sync now</h3>
        <p className="text-sm opacity-70">
          Creates dotmip if it does not exist, pulls changes, merges them with this machine, and pushes the result. When both sides edited the
          same item, the newer edit is kept. Messages from both sides are kept.
        </p>
        <div>
          <button className="btn btn-primary btn-sm" disabled={!status?.login || running} onClick={run}>
            {running && <span className="loading loading-spinner loading-xs" />}
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

      <ErrorAlert message={error ?? status?.error} />
    </div>
  );
}
