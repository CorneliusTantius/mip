import { useEffect, useState } from "preact/hooks";
import { api } from "../../api/client";
import type { ProviderInfo } from "../../api/types";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { usePolling } from "../../ui/hooks";
import { confirmSignOut, SignInPanel } from "./SignInPanel";

const CAPABILITIES: Record<string, string> = { streaming: "Streaming", tools: "Tools", mcp: "MCP", sessions: "Sessions", signIn: "Sign-in" };
const POLL_MS = 2000;

// The providers, the service the user picks within one, and what is connected. Polls while Settings is open,
// so sign-in progress and prompts stay current.
export function ProviderTab({ open }: { open: boolean }) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providerId, setProviderId] = useState("");
  const [targetId, setTargetId] = useState("");

  const refresh = () => api.get<{ providers: ProviderInfo[] }>("/api/providers").then((data) => setProviders(data.providers));

  useEffect(() => {
    if (open) refresh();
  }, [open]);
  usePolling(refresh, POLL_MS, open);

  const provider = providers.find((p) => p.id === providerId) ?? providers[0];
  const target = provider?.targets.find((t) => t.id === targetId) ?? provider?.targets[0];
  const connected = providers.flatMap((p) => p.targets.filter((t) => t.auth.loggedIn).map((t) => ({ provider: p, target: t })));

  return (
    <>
      {provider && (
        <>
          <fieldset className="fieldset">
            <legend className="fieldset-legend">Provider</legend>
            <select
              className="select w-full"
              value={provider.id}
              onChange={(e) => {
                setProviderId(e.currentTarget.value);
                setTargetId("");
              }}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </fieldset>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(provider.capabilities)
              .filter(([, on]) => on)
              .map(([key]) => (
                <span key={key} className="badge badge-outline">
                  {CAPABILITIES[key] ?? key}
                </span>
              ))}
          </div>

          <ErrorAlert message={provider.error} className="mt-4" />

          {target && (
            <>
              <fieldset className="fieldset mt-4">
                <legend className="fieldset-legend">Service</legend>
                <select className="select w-full" value={target.id} onChange={(e) => setTargetId(e.currentTarget.value)}>
                  {provider.targets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </fieldset>
              <SignInPanel key={provider.id + target.id} provider={provider} target={target} />
            </>
          )}
        </>
      )}

      <div className="divider">Connected</div>
      {connected.length === 0 && <p className="text-sm opacity-60">Nothing connected yet.</p>}
      <ul className="list">
        {connected.map(({ provider: p, target: t }) => (
          <li key={p.id + t.id} className="list-row items-center">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{t.name}</div>
              <div className="text-xs opacity-70">
                {p.name}
                {t.auth.method ? " · " + t.auth.method : ""}
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => confirmSignOut(p, t)}>
              Sign out
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
