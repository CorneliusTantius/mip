import { useState } from "preact/hooks";
import { errorText } from "../../api/client";
import type { SlackAccount } from "../../api/types";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { usePolling } from "../../ui/hooks";
import { useSlack } from "../slack/useSlack";

// How long, after "Connect with Slack", the list is re-read while the browser finishes the sign-in on Slack's page.
const WAIT_MS = 120_000;
const POLL_MS = 3000;

// Slack in Settings: the Slack app's client ID and secret, the address the app must list, the connected accounts, and connecting one.
// The card reads the same connection. A user token pasted here works too, for when the sign-in page cannot be used.
export function SlackTab() {
  const slack = useSlack();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [appError, setAppError] = useState<string>();
  const [appSaved, setAppSaved] = useState(false);
  const [connectError, setConnectError] = useState<string>();
  const [token, setToken] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<SlackAccount>();
  const [removeError, setRemoveError] = useState<string>();

  // While a sign-in is open in another tab, the account list is re-read, so a new account shows up without a reload.
  usePolling(() => void slack.reload(), POLL_MS, waiting);

  async function saveApp() {
    setAppError(undefined);
    setAppSaved(false);
    try {
      await slack.saveApp(clientId, clientSecret);
      setClientSecret("");
      setAppSaved(true);
    } catch (err) {
      setAppError(errorText(err));
    }
  }

  async function connect() {
    setConnectError(undefined);
    try {
      const url = await slack.startConnect();
      window.open(url, "_blank", "noopener");
      setWaiting(true);
      window.setTimeout(() => setWaiting(false), WAIT_MS);
    } catch (err) {
      setConnectError(errorText(err));
    }
  }

  async function connectWithToken() {
    setConnectError(undefined);
    try {
      await slack.connectWithToken(token);
      setToken("");
    } catch (err) {
      setConnectError(errorText(err));
    }
  }

  async function confirmRemove() {
    if (!pendingRemove) return;
    setRemoveError(undefined);
    try {
      await slack.remove(pendingRemove.id);
      setPendingRemove(undefined);
    } catch (err) {
      setRemoveError(errorText(err));
    }
  }

  const state = slack.state;
  const hasApp = !!state?.app;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">Slack app</h3>
        <p className="text-sm opacity-70">
          mip signs in to Slack as you, through a Slack app that you create for your own workspace. The app asks for user permissions only, so
          nothing posts as a bot. Create it at{" "}
          <a className="link" href="https://api.slack.com/apps" target="_blank" rel="noopener">
            api.slack.com/apps
          </a>{" "}
          with <span className="font-medium">Create New App → From scratch</span>. Then, in its settings:
        </p>
        <ol className="list-decimal pl-5 text-sm opacity-70">
          <li>
            Under <span className="font-medium">OAuth &amp; Permissions</span>, add this address to <span className="font-medium">Redirect URLs</span>:
            <code className="mt-1 block break-all rounded bg-base-300/60 px-2 py-1 text-xs">{state?.redirectUri ?? "Loading…"}</code>
          </li>
          <li>
            Under <span className="font-medium">Basic Information</span>, copy the Client ID and Client Secret into the fields below.
          </li>
        </ol>

        {hasApp ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="opacity-70">
              Client ID <span className="font-mono">{state?.app?.clientId}</span> is saved. The secret stays on this machine.
            </span>
            <button className="btn btn-ghost btn-xs" onClick={() => setClientId(state?.app?.clientId ?? "")}>
              Change
            </button>
          </div>
        ) : null}
        {(!hasApp || clientId !== "" || clientSecret !== "") && (
          <div className="flex flex-col gap-2">
            <input
              className="input input-sm"
              placeholder="Client ID, like 1234567890.1234567890"
              aria-label="Client ID"
              value={clientId}
              onInput={(e) => setClientId((e.target as HTMLInputElement).value)}
            />
            <input
              className="input input-sm"
              type="password"
              placeholder="Client secret"
              aria-label="Client secret"
              value={clientSecret}
              onInput={(e) => setClientSecret((e.target as HTMLInputElement).value)}
            />
            <div className="flex items-center gap-2">
              <button className="btn btn-primary btn-sm" disabled={!clientId.trim() || !clientSecret.trim()} onClick={() => void saveApp()}>
                Save app
              </button>
              {appSaved && <span className="text-sm text-success">Saved.</span>}
            </div>
          </div>
        )}
        <ErrorAlert message={appError ?? slack.error} />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">Connected accounts</h3>
        <p className="text-sm opacity-70">
          Connecting opens Slack's page in a new tab. Approve it there, then come back here. The Slack card reads as the account you connect.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary btn-sm" disabled={!hasApp} onClick={() => void connect()}>
            Connect with Slack
          </button>
          {waiting && <span className="text-sm opacity-60">Waiting for the approval in the other tab…</span>}
        </div>
        <ErrorAlert message={connectError} />

        <details className="text-sm">
          <summary className="cursor-pointer opacity-70">Connect with a user token instead</summary>
          <div className="mt-2 flex flex-col gap-2">
            <p className="opacity-70">
              In the Slack app, under OAuth &amp; Permissions, copy the User OAuth Token (it starts with xoxp-). It acts as you, so keep it private.
            </p>
            <input
              className="input input-sm"
              type="password"
              placeholder="xoxp-…"
              aria-label="User token"
              value={token}
              onInput={(e) => setToken((e.target as HTMLInputElement).value)}
            />
            <button className="btn btn-sm self-start" disabled={!token.trim()} onClick={() => void connectWithToken()}>
              Connect with token
            </button>
          </div>
        </details>

        {state && state.accounts.length === 0 && <div className="text-sm opacity-60">No Slack account is connected yet.</div>}
        {state?.accounts.map((account) => (
          <div key={account.id} className="flex flex-wrap items-center justify-between gap-2 rounded-box bg-base-300/40 px-3 py-2 text-sm">
            <span>
              <span className="font-medium">{account.userName}</span> in {account.teamName}
            </span>
            <button className="btn btn-ghost btn-xs text-error" onClick={() => setPendingRemove(account)}>
              Disconnect
            </button>
          </div>
        ))}

        {state?.problems.map((problem) => (
          <ErrorAlert key={problem.account} message={`slack.json: "${problem.account}" ${problem.error}`} />
        ))}
      </section>

      <ConfirmDialog
        open={!!pendingRemove}
        glow="red"
        title="Disconnect this account?"
        message={`${pendingRemove?.userName ?? ""} in ${pendingRemove?.teamName ?? ""} is removed from slack.json, with its token. Nothing is revoked in Slack, so reconnect to use it again.`}
        error={removeError}
        onConfirm={confirmRemove}
        onCancel={() => {
          setPendingRemove(undefined);
          setRemoveError(undefined);
        }}
      />
    </div>
  );
}
