import { useState } from "preact/hooks";
import { Chat } from "./Chat";
import { Memory } from "./Memory";
import { MemoryCard } from "./MemoryCard";
import { Settings } from "./Settings";
import { Starfield } from "./Starfield";

const PANELS = [
  { title: "Tasks", empty: "No tasks yet." },
  { title: "Activity", empty: "No activity yet." },
];

// The top bar stays put. Everything below it is one content box that scrolls, with the cards inside.
export function App() {
  const [open, setOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  // The note the memory screen opens on, when a dot on the graph was clicked.
  const [memoryTitle, setMemoryTitle] = useState<string>();
  // Goes up after each save or delete, so the memory card redraws.
  const [memoryVersion, setMemoryVersion] = useState(0);

  function openMemory(title?: string) {
    setMemoryTitle(title);
    setMemoryOpen(true);
  }

  return (
    <div className="flex h-full flex-col">
      <Starfield />
      <div className="navbar mx-auto min-h-10 w-full max-w-5xl shrink-0 px-2 py-0">
        <span className="flex-1 text-lg font-semibold">mip</span>
        <button className="btn btn-ghost btn-sm btn-circle" aria-label="Settings" onClick={() => setOpen(true)}>
          <GearIcon />
        </button>
      </div>

      <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-4 overflow-y-auto p-4 pt-0">
        <Chat />
        <div className="grid shrink-0 grid-cols-2 gap-4">
          {PANELS.map((panel) => (
            <section key={panel.title} className="card bg-base-200/80">
              <div className="card-body">
                <h2 className="card-title">{panel.title}</h2>
                <p className="py-6 text-center opacity-60">{panel.empty}</p>
              </div>
            </section>
          ))}
          <MemoryCard version={memoryVersion} onOpen={openMemory} onSeeMore={() => openMemory()} />
        </div>
      </main>

      <Settings open={open} onClose={() => setOpen(false)} />
      <Memory open={memoryOpen} initial={memoryTitle} onClose={() => setMemoryOpen(false)} onChange={() => setMemoryVersion((v) => v + 1)} />
    </div>
  );
}

function GearIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
