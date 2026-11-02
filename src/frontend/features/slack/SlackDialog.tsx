import { useState } from "preact/hooks";
import { errorText } from "../../api/client";
import type { SlackAccount } from "../../api/types";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { Modal } from "../../ui/Modal";
import type { useSlack } from "./useSlack";

// The Slack setup and accounts, opened from the Slack card's Accounts button. It holds the Slack app's client ID and secret, the sign-in
// that connects an account, a pasted user token for when the sign-in page cannot be used, and the list of connected accounts.
// The card owns the sign-in itself (so it can re-read the accounts while the approval is open), and passes it in.
export function SlackDialog({
  open,
  slack,
  waiting,
  onSignIn,
  onClose,
}: {
  open: boolean;
  slack: ReturnType<typeof useSlack>;
  waiting: boolean;
  onSignIn: () => Promise<void>;
  onClose: () => void;
}) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [appError, setAppError] = useState<string>();
  const [appSaved, setAppSaved] = useState(false);
  const [connectError, setConnectError] = useState<string>();
  const [token, setToken] = useState("");
  const [pendingRemove, setPendingRemove] = useState<SlackAccount>();
  const [removeError, setRemoveError] = useState<string>();

  const state = slack.state;
  const hasApp = !!state?.app;

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

  async function signIn() {
    setConnectError(undefined);
    try {
      await onSignIn();
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

  return (
    <>
      <Modal open={open} onClose={onClose} closeButton glow="violet" boxClassName="flex max-h-[80vh] w-[min(36rem,92vw)] max-w-none flex-col">
        <h2 className="mb-4 text-lg font-semibold">Slack</h2>
        <div className="flex min-h-0 flex-col gap-6 overflow-y-auto pr-1">
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

            {hasApp && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="opacity-70">
                  Client ID <span className="font-mono">{state?.app?.clientId}</span> is saved. The secret stays on this machine.
                </span>
                <button className="btn btn-ghost btn-xs" onClick={() => setClientId(state?.app?.clientId ?? "")}>
                  Change
                </button>
              </div>
            )}
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
            <h3 className="font-semibold">Accounts</h3>
            <p className="text-sm opacity-70">
              Sign in opens Slack's page in a new tab. Approve it there, and the card fills in. The card reads as the account you connect.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn btn-primary btn-sm" disabled={!hasApp} onClick={() => void signIn()}>
                Sign in with Slack
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
        </div>
      </Modal>

      <ConfirmDialog
        open={!!pendingRemove}
        glow="red"
        title="Disconnect this account?"
        message={`${pendingRemove?.userName ?? ""} in ${pendingRemove?.teamName ?? ""} is removed from slack.json, with its token. Nothing is revoked in Slack, so sign in again to use it.`}
        error={removeError}
        onConfirm={confirmRemove}
        onCancel={() => {
          setPendingRemove(undefined);
          setRemoveError(undefined);
        }}
      />
    </>
  );
}
