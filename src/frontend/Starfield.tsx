import { useEffect, useRef } from "preact/hooks";

// Nord colors for the stars.
const COLORS = ["#eceff4", "#d8dee9", "#88c0d0", "#8fbcbb", "#81a1c1"];

interface Star {
  x: number;
  y: number;
  r: number;
  color: string;
  speed: number;
  phase: number;
  glint: boolean;
}

// Twinkling stars behind the page. Drawn on one fixed canvas, so they stay put while you scroll.
export function Starfield() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d")!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stars: Star[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;

    function makeStar(): Star {
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        r: 0.5 + Math.random() * 1.3,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        speed: 0.6 + Math.random() * 1.8,
        phase: Math.random() * Math.PI * 2,
        // A few stars flash a small cross of light when they peak.
        glint: Math.random() < 0.08,
      };
    }

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      el.width = width * dpr;
      el.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = Array.from({ length: Math.min(260, Math.floor((width * height) / 5000)) }, makeStar);
      if (reduced) draw(0);
    }

    function draw(time: number) {
      ctx.clearRect(0, 0, width, height);
      for (const s of stars) {
        // Light goes from 0 (dim) to 1 (bright) as the star twinkles.
        const light = 0.5 + 0.5 * Math.sin((time / 1000) * s.speed + s.phase);
        ctx.globalAlpha = 0.15 + 0.85 * light;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * (0.7 + 0.5 * light), 0, Math.PI * 2);
        ctx.fill();

        if (s.glint && light > 0.95) {
          const len = s.r * 5;
          ctx.strokeStyle = s.color;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(s.x - len, s.y);
          ctx.lineTo(s.x + len, s.y);
          ctx.moveTo(s.x, s.y - len);
          ctx.lineTo(s.x, s.y + len);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    function loop(time: number) {
      draw(time);
      frame = requestAnimationFrame(loop);
    }

    resize();
    window.addEventListener("resize", resize);
    if (!reduced) frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvas} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />;
}
