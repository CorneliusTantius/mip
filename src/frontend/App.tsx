import { useState } from "preact/hooks";
import { BotsCard } from "./features/bots/BotsCard";
import { AgentCard } from "./features/agent/AgentCard";
import { MemoryCard } from "./features/memory/MemoryCard";
import { RepositoriesCard } from "./features/repos/RepositoriesCard";
import { SettingsDialog } from "./features/settings/SettingsDialog";
import { McpCard } from "./features/mcp/McpCard";
import { PlaceholderCard } from "./features/upcoming/PlaceholderCard";
import { SkillsCard } from "./features/skills/SkillsCard";
import { ToolsCard } from "./features/tools/ToolsCard";
import { Icon } from "./ui/Icon";
import { Starfield } from "./ui/Starfield";

// The page is narrow on a phone and wider on bigger screens. From desktop up it uses the whole window, capped on very wide monitors.
// The header and the grid share the same width and side padding.
const WIDTH = "mx-auto w-full max-w-5xl xl:max-w-none 2xl:max-w-[1920px]";
const SIDES = "px-4 xl:px-4.75";
// Medium cards: memory and repositories share a row from tablets up, and stack on phones.
const MEDIUM = "col-span-12 md:col-span-6";

// The page: a header, then one scrolling grid of cards. Each card sits in a grid cell, and the cells keep their order.
export function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <div className="flex h-full flex-col">
      <Starfield />

      <main className={`${WIDTH} grid min-h-0 flex-1 grid-cols-12 content-start gap-4 xl:gap-5 overflow-y-auto ${SIDES} pb-4 pt-0 xl:pb-3`}>
        {/* The header scrolls with the page, so it sits inside the scrolling area. */}
        <div className="navbar col-span-12 -mb-2 min-h-10 py-0 xl:-mb-3">
          <span className="flex-1 text-lg font-semibold">mip</span>
          <button className="btn btn-ghost btn-sm btn-circle" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
            <Icon name="gear" />
          </button>
        </div>

        {/* The agent and the bots room are the tall cards. Desktops put them side by side, both as tall as the window allows. */}
        <div className="col-span-12 h-[min(44rem,80vh)] xl:col-span-8">
          <AgentCard />
        </div>
        <div className="col-span-12 h-[min(40rem,80vh)] xl:col-span-4 xl:h-[min(44rem,80vh)]">
          <BotsCard />
        </div>

        <div className={MEDIUM}>
          <MemoryCard />
        </div>
        <div className={MEDIUM}>
          <RepositoriesCard />
        </div>

        {/* Below everything else. Two per row on tablets, five on desktops. */}
        <div className="col-span-12 grid gap-4 xl:gap-5 md:grid-cols-2 xl:grid-cols-5">
          <PlaceholderCard title="Tasks" summary="No tasks yet." glow="yellow" />
          <PlaceholderCard title="Activity" summary="No activity yet." glow="blue" />
          <ToolsCard />
          <SkillsCard />
          <McpCard />
        </div>
      </main>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
