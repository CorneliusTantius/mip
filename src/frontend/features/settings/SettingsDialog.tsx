import { useState } from "preact/hooks";
import { Modal } from "../../ui/Modal";
import { PersonasTab } from "./PersonasTab";
import { ProviderTab } from "./ProviderTab";

// Settings: the provider sign-ins, and the personas. It opens from the gear in the header.
export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"provider" | "config">("provider");

  return (
    <Modal open={open} onClose={onClose} closeButton boxClassName="flex h-[min(36rem,80vh)] max-w-4xl flex-col">
      <h2 className="mb-4 text-lg font-semibold">Settings</h2>
      <div className="flex min-h-0 flex-1 gap-4">
        <ul className="menu w-36 shrink-0 gap-1 border-r border-base-300 p-0 pr-3">
          <li>
            <button className={tab === "provider" ? "menu-active" : ""} onClick={() => setTab("provider")}>
              Provider
            </button>
          </li>
          <li>
            <button className={tab === "config" ? "menu-active" : ""} onClick={() => setTab("config")}>
              Config
            </button>
          </li>
        </ul>
        <div key={tab} className="mip-fade min-h-0 min-w-0 flex-1 overflow-y-auto pr-1">
          {tab === "provider" ? <ProviderTab open={open} /> : <PersonasTab />}
        </div>
      </div>
    </Modal>
  );
}
