import { useState } from "preact/hooks";
import { errorText } from "../../api/client";
import type { MailAccount, MailPreset } from "../../api/types";
import { ErrorAlert } from "../../ui/ErrorAlert";
import { Modal } from "../../ui/Modal";

// The form that adds a mail account. The provider fills in the server. "Other" asks for the server, its port, and whether it is encrypted.
// The password is an app password, and the server must accept it before the account is kept, so a wrong one is never saved.
export function AddMailAccountDialog({
  open,
  presets,
  onClose,
  onAdd,
}: {
  open: boolean;
  presets: MailPreset[];
  onClose: () => void;
  onAdd: (input: unknown) => Promise<MailAccount>;
}) {
  const [presetId, setPresetId] = useState("gmail");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("993");
  const [secure, setSecure] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const preset = presets.find((candidate) => candidate.id === presetId) ?? presets[0];
  const custom = preset?.id === "other";

  function reset() {
    setPresetId("gmail");
    setAddress("");
    setPassword("");
    setHost("");
    setPort("993");
    setSecure(true);
    setError(undefined);
  }

  function close() {
    reset();
    onClose();
  }

  // Choosing a provider fills in its server, so the form shows what will be used.
  function choose(id: string) {
    const next = presets.find((candidate) => candidate.id === id);
    setPresetId(id);
    setHost(next?.host ?? "");
    setPort(String(next?.port ?? 993));
    setSecure(next?.secure ?? true);
  }

  async function submit(e: Event) {
    e.preventDefault();
    setError(undefined);
    setBusy(true);
    try {
      await onAdd({ preset: presetId, address, password, host, port: Number(port), secure });
      reset();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={close} closeButton glow="frost">
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <h3 className="text-lg font-semibold">Add mail account</h3>

        <label className="flex flex-col gap-1 text-sm">
          Provider
          <select className="select select-sm w-full" value={presetId} onChange={(e) => choose(e.currentTarget.value)}>
            {presets.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label}
              </option>
            ))}
          </select>
        </label>

        <div className="text-sm opacity-70">{preset?.help}</div>

        <label className="flex flex-col gap-1 text-sm">
          Email address
          <input type="email" className="input input-sm w-full" autoComplete="off" value={address} onInput={(e) => setAddress(e.currentTarget.value)} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          App password
          <input
            type="password"
            className="input input-sm w-full font-mono"
            autoComplete="new-password"
            value={password}
            onInput={(e) => setPassword(e.currentTarget.value)}
          />
          <div className="text-xs opacity-60">Spaces are removed. The password is stored on this machine only, and is never synced.</div>
        </label>

        {preset?.passwordUrl && (
          <a className="btn btn-outline btn-sm self-start" href={preset.passwordUrl} target="_blank" rel="noopener noreferrer">
            Get an app password
          </a>
        )}

        {custom && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              IMAP server
              <input className="input input-sm w-full font-mono" placeholder="imap.example.com" value={host} onInput={(e) => setHost(e.currentTarget.value)} />
            </label>
            <div className="flex items-end gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Port
                <input className="input input-sm w-24" inputMode="numeric" value={port} onInput={(e) => setPort(e.currentTarget.value)} />
              </label>
              <label className="label cursor-pointer gap-2 text-sm">
                <input type="checkbox" className="checkbox checkbox-sm" checked={secure} onChange={(e) => setSecure(e.currentTarget.checked)} />
                Encrypted (TLS)
              </label>
            </div>
          </>
        )}

        <ErrorAlert message={error} />

        <div className="modal-action mt-0">
          <button type="button" className="btn btn-ghost" onClick={close}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy && <span className="loading loading-spinner loading-xs" />}
            Sign in and add
          </button>
        </div>
      </form>
    </Modal>
  );
}
