// What the server sends for the memory graph.
export interface GraphNode {
  id: string;
  title: string;
  missing: boolean;
  degree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type Positions = Map<string, { x: number; y: number }>;

const ITERATIONS = 300;
// A weak pull toward the middle, so groups with no links between them don't drift apart forever.
const GRAVITY = 0.1;

// A force layout (Fruchterman-Reingold): every node pushes the others away, and linked nodes pull together.
// It runs once, starting from a circle, so the same notes always get the same picture. Positions are in pixels of the frame.
export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number): Positions {
  const n = nodes.length;
  const positions: Positions = new Map();
  if (n === 0) return positions;

  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const radius = Math.min(width, height) / 3;
  const x = nodes.map((_, i) => Math.cos((2 * Math.PI * i) / n) * radius);
  const y = nodes.map((_, i) => Math.sin((2 * Math.PI * i) / n) * radius);
  const k = Math.sqrt((width * height) / n);

  for (let step = 0; step < ITERATIONS; step++) {
    const dx = new Array<number>(n).fill(0);
    const dy = new Array<number>(n).fill(0);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const ax = x[i] - x[j];
        const ay = y[i] - y[j];
        const d = Math.max(Math.hypot(ax, ay), 0.01);
        const push = (k * k) / d;
        dx[i] += (ax / d) * push;
        dy[i] += (ay / d) * push;
        dx[j] -= (ax / d) * push;
        dy[j] -= (ay / d) * push;
      }
    }

    for (const edge of edges) {
      const s = index.get(edge.source)!;
      const t = index.get(edge.target)!;
      const ax = x[s] - x[t];
      const ay = y[s] - y[t];
      const d = Math.max(Math.hypot(ax, ay), 0.01);
      const pull = (d * d) / k;
      dx[s] -= (ax / d) * pull;
      dy[s] -= (ay / d) * pull;
      dx[t] += (ax / d) * pull;
      dy[t] += (ay / d) * pull;
    }

    // Cooling: each step moves less than the last, so the layout settles.
    const temperature = (Math.min(width, height) / 10) * (1 - step / ITERATIONS);
    for (let i = 0; i < n; i++) {
      dx[i] -= x[i] * GRAVITY;
      dy[i] -= y[i] * GRAVITY;
      const d = Math.max(Math.hypot(dx[i], dy[i]), 0.01);
      const move = Math.min(d, temperature);
      x[i] += (dx[i] / d) * move;
      y[i] += (dy[i] / d) * move;
    }
  }

  // Scale and center the result so it fills the box, with a margin for labels. One scale for both axes keeps the shape.
  const minX = Math.min(...x);
  const maxX = Math.max(...x);
  const minY = Math.min(...y);
  const maxY = Math.max(...y);
  const scale = Math.min((width * 0.85) / Math.max(maxX - minX, 1), (height * 0.85) / Math.max(maxY - minY, 1));
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  nodes.forEach((node, i) => {
    positions.set(node.id, { x: width / 2 + (x[i] - midX) * scale, y: height / 2 + (y[i] - midY) * scale });
  });
  return positions;
}
