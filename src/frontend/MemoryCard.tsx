import { useEffect, useState } from "preact/hooks";
import type { GraphData } from "./graph-layout";
import { MemoryGraph } from "./MemoryGraph";

// The memory card on the main page: the notes as a graph. Click a dot to open that note, or See more for the full memory.
// `version` changes after a note is saved or deleted, so the graph reloads.
export function MemoryCard({ version, onOpen, onSeeMore }: { version: number; onOpen: (title: string) => void; onSeeMore: () => void }) {
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });

  useEffect(() => {
    fetch("/api/graph")
      .then((res) => res.json())
      .then(setGraph);
  }, [version]);

  const notes = graph.nodes.filter((node) => !node.missing).length;

  return (
    <section className="card h-full bg-base-200/80">
      <div className="card-body gap-3">
        <div className="flex items-center gap-2">
          <h2 className="card-title mr-auto">Memory</h2>
          <span className="text-sm opacity-60">{notes} {notes === 1 ? "note" : "notes"}</span>
          <button className="btn btn-sm" onClick={onSeeMore}>
            See more
          </button>
        </div>
        <div className="h-72">
          {notes === 0 ? (
            <p className="flex h-full items-center justify-center text-center text-sm opacity-60">No notes yet. Agents save notes as they work, or you can write one in See more.</p>
          ) : (
            <MemoryGraph graph={graph} onOpen={onOpen} />
          )}
        </div>
      </div>
    </section>
  );
}
