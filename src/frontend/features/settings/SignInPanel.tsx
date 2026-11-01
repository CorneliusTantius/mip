import { useState } from "preact/hooks";
import { api } from "../../api/client";
import type { ProviderInfo, SignInTarget } from "../../api/types";
import { splitLinks } from "./outputLinks";

const METHODS: Record<string, string> = { subscription: "Sign in with subscription", api_key: "Use API key", cli: "Sign in" };

// Runs one sign-in action for a target: "sign-in", "answer", or "sign-out". The provider tab polls, so the screen updates on its own.
// Failures show in the progress the polling reads, so the buttons don't handle them.
export function runSignInAction(provider: ProviderInfo, target: SignInTarget, action: string, body: Record<string, unknown> = {}) {
  return api.post(`/api/providers/${provider.id}/targets/${target.id}/${action}`, body).catch(() => undefined);
}

// Asks before signing out, since the login has to be done again afterwards.
export function confirmSignOut(provider: ProviderInfo, target: SignInTarget) {
  if (confirm(`Sign out of ${target.name}?`)) runSignInAction(provider, target, "sign-out");
}

// The sign-in controls for the selected service: its status and buttons, then the output and any question the sign-in asks.
export function SignInPanel({ provider, target }: { provider: ProviderInfo; target: SignInTarget }) {
  return (
    <>
      <SignInButtons provider={provider} target={target} />
      <SignInOutput provider={provider} target={target} />
    </>
  );
}

function SignInButtons({ provider, target }: { provider: ProviderInfo; target: SignInTarget }) {
  const { auth, progress } = target;
  const status = auth.loggedIn ? "Signed in" + (auth.method ? " · " + auth.method : "") : "Not signed in";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className={"badge h-auto max-w-full whitespace-normal break-all py-2 " + (auth.loggedIn ? "badge-success" : "badge-ghost")}>{status}</span>
      {auth.loggedIn ? (
        <button className="btn btn-sm" disabled={progress.running} onClick={() => confirmSignOut(provider, target)}>
          Sign out
        </button>
      ) : (
        target.methods.map((method) => (
          <button key={method} className="btn btn-primary btn-sm" disabled={progress.running} onClick={() => runSignInAction(provider, target, "sign-in", { method })}>
            {METHODS[method] ?? method}
          </button>
        ))
      )}
    </div>
  );
}

// One line of sign-in output. Each link in it becomes a button that opens the link in a new tab, in place of the address.
function OutputLine({ line }: { line: string }) {
  const parts = splitLinks(line);

  return (
    <div>
      {parts.length === 0
        ? " "
        : parts.map((part, i) =>
            typeof part === "string" ? (
              <span key={i}>{part}</span>
            ) : (
              <button
                key={i}
                type="button"
                className="btn btn-primary btn-xs mx-1 align-middle"
                onClick={() => window.open(part.url, "_blank", "noopener,noreferrer")}
              >
                Open link
              </button>
            ),
          )}
    </div>
  );
}

// The sign-in's output, and the answer box when it is waiting for input such as a pasted code.
function SignInOutput({ provider, target }: { provider: ProviderInfo; target: SignInTarget }) {
  const { progress } = target;
  const [answer, setAnswer] = useState("");
  // Preact's input types can't take "text" or "password" from one expression, so widen the type.
  const inputType = (progress.prompt?.type === "secret" ? "password" : "text") as "text";

  if (!progress.running && progress.output.length === 0 && !progress.error) return null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      {progress.output.length > 0 && (
        <div className="flex flex-col gap-1 rounded-box bg-base-300 p-3 font-mono text-sm break-all">
          {progress.output.map((line, i) => (
            <OutputLine key={i} line={line} />
          ))}
        </div>
      )}
      {progress.error && (
        <div role="alert" className="alert alert-error">
          <span>{progress.error}</span>
        </div>
      )}

      {progress.running && (
        <form
          className="flex flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await runSignInAction(provider, target, "answer", { answer });
            setAnswer("");
          }}
        >
          {progress.prompt && <p className="text-sm">{progress.prompt.message}</p>}
          <div className="join w-full">
            <input
              className="input join-item w-full"
              type={inputType}
              placeholder={progress.prompt?.placeholder ?? "Paste code or answer"}
              value={answer}
              onInput={(e) => setAnswer(e.currentTarget.value)}
            />
            <button className="btn btn-primary join-item">Send</button>
          </div>
        </form>
      )}
    </div>
  );
}
