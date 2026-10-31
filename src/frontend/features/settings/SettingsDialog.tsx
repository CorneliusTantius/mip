import { useState } from "preact/hooks";
import { Modal } from "../../ui/Modal";
import { ProviderTab } from "./ProviderTab";
import { SyncTab } from "./SyncTab";
import { UpdateTab } from "./UpdateTab";

// Settings: the provider sign-ins, syncing data to GitHub, and updating mip. Personas are managed from the chat card. It opens from the gear in the header.
export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"provider" | "sync" | "update">("provider");

  return (
    <Modal open={open} onClose={onClose} closeButton glass boxClassName="flex h-[min(36rem,80vh)] max-w-4xl flex-col">
      <h2 className="mb-4 text-lg font-semibold">Settings</h2>
      <div className="flex min-h-0 flex-1 gap-4">
        <ul className="menu w-36 shrink-0 gap-1 border-r border-base-300 p-0 pr-3">
          <li>
            <button className={tab === "provider" ? "menu-active" : ""} onClick={() => setTab("provider")}>
              Provider
            </button>
          </li>
          <li>
            <button className={tab === "sync" ? "menu-active" : ""} onClick={() => setTab("sync")}>
              Sync
            </button>
          </li>
          <li>
            <button className={tab === "update" ? "menu-active" : ""} onClick={() => setTab("update")}>
              Update
            </button>
          </li>
        </ul>
        <div key={tab} className="mip-fade min-h-0 min-w-0 flex-1 overflow-y-auto pr-1">
          {tab === "provider" && <ProviderTab open={open} />}
          {tab === "sync" && <SyncTab />}
          {tab === "update" && <UpdateTab />}
        </div>
      </div>
    </Modal>
  );
}
