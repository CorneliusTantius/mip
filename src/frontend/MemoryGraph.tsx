import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { layoutGraph, type GraphData } from "./graph-layout";

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

// The notes as a graph, like Obsidian's: a dot per note, a line per link. Drag to pan, scroll to zoom, double-click to reset.
// Hover a dot to see its links. Click a dot to open that note.
export function MemoryGraph({ graph, onOpen }: { graph: GraphData; onOpen: (title: string) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const start = useRef<{ x: number; y: number; view: View } | undefined>(undefined);
  // Set once the pointer has moved, so releasing a drag doesn't count as a click.
  const dragged = useRef(false);
  // The graph's box is the SVG's size in pixels, so dots and labels keep a readable size. Undefined view means the whole box.
  const [box, setBox] = useState({ w: 800, h: 300 });
  const [view, setView] = useState<View>();
  const [hovered, setHovered] = useState<string>();

  useEffect(() => {
    const el = svg.current!;
    const observer = new ResizeObserver(() => {
      if (!el.clientHeight) return;
      setBox({ w: el.clientWidth, h: el.clientHeight });
      setView(undefined);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const whole: View = { x: 0, y: 0, w: box.w, h: box.h };
  const current = view ?? whole;
  const positions = useMemo(() => layoutGraph(graph.nodes, graph.edges, box.w, box.h), [graph, box]);
  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const link = (a: string, b: string) => {
      if (!map.has(a)) map.set(a, new Set());
      map.get(a)!.add(b);
    };
    for (const { source, target } of graph.edges) {
      link(source, target);
      link(target, source);
    }
    return map;
  }, [graph]);

  // A screen point in graph units, so zooming stays under the pointer.
  function toGraph(clientX: number, clientY: number) {
    const el = svg.current!;
    const pt = el.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(el.getScreenCTM()!.inverse());
  }

  function onPointerDown(e: PointerEvent) {
    dragged.current = false;
    start.current = { x: e.clientX, y: e.clientY, view: current };
  }

  function onPointerMove(e: PointerEvent) {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (Math.abs(dx) + Math.abs(dy) < 4) return;
    dragged.current = true;
    // Graph units per screen pixel, from the SVG's current scale.
    const unitsPerPixel = 1 / (svg.current?.getScreenCTM()?.a ?? 1);
    setView({ ...start.current.view, x: start.current.view.x - dx * unitsPerPixel, y: start.current.view.y - dy * unitsPerPixel });
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1;
    const p = toGraph(e.clientX, e.clientY);
    setView((v) => {
      const cur = v ?? whole;
      const w = cur.w * factor;
      if (w > box.w * 2 || w < box.w / 10) return cur;
      return { x: p.x - (p.x - cur.x) * factor, y: p.y - (p.y - cur.y) * factor, w, h: cur.h * factor };
    });
  }

  // A node is lit when nothing is hovered, or when it is the hovered node or one of its neighbors.
  const lit = (id: string) => !hovered || id === hovered || neighbors.get(hovered)?.has(id) === true;

  return (
    <svg
      ref={svg}
      viewBox={`${current.x} ${current.y} ${current.w} ${current.h}`}
      className="h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (start.current = undefined)}
      onPointerLeave={() => (start.current = undefined)}
      onWheel={onWheel}
      onDblClick={() => setView(undefined)}
    >
      {graph.edges.map((edge, i) => {
        const a = positions.get(edge.source)!;
        const b = positions.get(edge.target)!;
        const edgeLit = !hovered || edge.source === hovered || edge.target === hovered;
        return (
          <line
            key={`${edge.source}|${edge.target}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            strokeWidth={1.5}
            style={{
              stroke: "var(--color-base-content)",
              strokeOpacity: edgeLit ? 0.35 : 0.06,
              transition: "stroke-opacity 0.25s ease",
              animation: "mip-fade 0.6s ease-out backwards",
              animationDelay: `${i * 20}ms`,
            }}
          />
        );
      })}

      {graph.nodes.map((node, i) => {
        const p = positions.get(node.id)!;
        const r = 5 + Math.min(node.degree, 10) * 1.5;
        const showLabel = graph.nodes.length <= 30 || node.degree >= 2 || hovered === node.id;
        return (
          <g
            key={node.id}
            className="cursor-pointer"
            style={{
              opacity: lit(node.id) ? 1 : 0.2,
              transition: "opacity 0.25s ease",
              animation: "mip-fade 0.5s ease-out backwards",
              animationDelay: `${i * 30}ms`,
            }}
            onPointerEnter={() => setHovered(node.id)}
            onPointerLeave={() => setHovered(undefined)}
            onClick={() => !dragged.current && onOpen(node.title)}
          >
            <title>{node.title}</title>
            <circle
              cx={p.x}
              cy={p.y}
              r={r}
              strokeWidth={node.missing ? 1.5 : 0}
              style={node.missing ? { fill: "var(--color-base-100)", stroke: "var(--color-base-content)", strokeDasharray: "8 6" } : { fill: "var(--color-primary)" }}
            />
            {showLabel && (
              <text x={p.x} y={p.y + r + 13} textAnchor="middle" style={{ fill: "var(--color-base-content)", fontSize: 12 }}>
                {node.title}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
