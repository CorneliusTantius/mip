import { useEffect, useState } from "preact/hooks";
import { api } from "../../api/client";
import { Card, CardBody, ExpandButton, useCardExpansion } from "../../ui/Card";
import type { GraphData } from "./graph-layout";
import { MemoryGraph } from "./MemoryGraph";
import { MemoryManager } from "./MemoryManager";

// The memory card. Collapsed, it shows the notes as a graph: a click on a dot expands the card on that note.
// Expanded, the same card becomes the memory screen, where notes are searched, read, written, and deleted.
export function MemoryCard() {
  return (
    <Card glow="green" className="h-full">
      <MemoryBody />
    </Card>
  );
}

// The card's content. It switches between the graph and the memory screen with the card's expanded state.
function MemoryBody() {
  const { expanded, open } = useCardExpansion();
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  // The note a graph click asked for. The memory screen opens on it, then it is cleared when the card collapses.
  const [startNote, setStartNote] = useState<string>();

  const loadGraph = () => api.get<GraphData>("/api/graph").then(setGraph);

  useEffect(() => {
    loadGraph();
  }, []);

  useEffect(() => {
    if (!expanded) setStartNote(undefined);
  }, [expanded]);

  // Notes are the nodes that have a note behind them. The others are links to titles nobody has written yet.
  const notes = graph.nodes.filter((node) => !node.missing).length;

  function openFromGraph(title: string) {
    setStartNote(title);
    open();
  }

  return (
    <CardBody
      title="Memory"
      className="min-h-0 flex-1 gap-3"
      actions={
        <>
          <span className="text-sm opacity-60">
            {notes} {notes === 1 ? "note" : "notes"}
          </span>
          <ExpandButton />
        </>
      }
    >
      {expanded ? (
        <MemoryManager initialNote={startNote} onChanged={loadGraph} />
      ) : (
        <div className="h-72">
          {notes === 0 ? (
            <p className="flex h-full items-center justify-center text-center text-sm opacity-60">
              No notes yet. Agents save notes as they work. Expand this card to write one.
            </p>
          ) : (
            <MemoryGraph graph={graph} onOpen={openFromGraph} />
          )}
        </div>
      )}
    </CardBody>
  );
}
