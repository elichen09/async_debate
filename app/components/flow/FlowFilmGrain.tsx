"use client";

import { useEffect, useRef } from "react";

/* Animated analog film grain for the flow workspace. Replaces the old graph-paper
   ForceGridScene: pins the light palette (the html.gh-light overrides are
   load-bearing for legible flow text) and drops the heavy animated site
   backgrounds, then paints a moving monochrome grain over the neutral-gray canvas.

   Cheap by construction: a handful of noise tiles are baked once, then one is
   stamped across the canvas as a repeating pattern each tick (~22fps) for the
   reshuffling flicker of real film. Static single frame under reduced-motion. */
const SCENE_CLASSES = ["gh-bg-grid", "gh-bg-dots", "gh-bg-shadow", "gh-bg-off"];
const TILE = 150; // grain tile size (px)
const FRAMES = 8; // pre-baked noise frames to cycle through
const FPS = 6; // slow flicker — present grain that barely moves
const DENSITY = 0.5; // share of pixels that carry a speck
const MAX_ALPHA = 26; // peak speck opacity (0-255)

export default function FlowFilmGrain() {
  const ref = useRef<HTMLCanvasElement>(null);

  // Keep the workspace on the light scene, minus the graph paper and particles.
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.className;
    el.classList.remove(...SCENE_CLASSES);
    el.classList.add("gh-light", "gh-bg-off");
    return () => {
      el.className = prev;
    };
  }, []);

  useEffect(() => {
    const canvasEl = ref.current;
    if (!canvasEl) return;
    const context = canvasEl.getContext("2d");
    if (!context) return;
    // Explicit non-null aliases so the nested helpers keep the narrowed types.
    const cv: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = context;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const patterns = Array.from({ length: FRAMES }, () =>
      ctx.createPattern(makeTile(), "repeat"),
    ).filter(Boolean) as CanvasPattern[];

    let dpr = 1;
    let raf = 0;
    let last = 0;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.max(1, Math.round(cv.clientWidth * dpr));
      cv.height = Math.max(1, Math.round(cv.clientHeight * dpr));
      paint();
    }

    function paint() {
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // Swap the whole tile in place (no spatial drift) — flicker, not motion.
      ctx.fillStyle = patterns[(Math.random() * patterns.length) | 0];
      ctx.fillRect(0, 0, w, h);
    }

    function loop(t: number) {
      raf = requestAnimationFrame(loop);
      if (t - last < 1000 / FPS) return;
      last = t;
      paint();
    }

    resize();
    window.addEventListener("resize", resize);
    if (!reduce) raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="flow-grain" aria-hidden />;
}

// One tile of monochrome speckle: both dark and light grains at low alpha so it
// reads as film over the gray canvas rather than dirt.
function makeTile(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = TILE;
  c.height = TILE;
  const cx = c.getContext("2d");
  if (!cx) return c;
  const img = cx.createImageData(TILE, TILE);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.random() > DENSITY) continue;
    const v = (Math.random() * 255) | 0;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = (Math.random() * MAX_ALPHA) | 0;
  }
  cx.putImageData(img, 0, 0);
  return c;
}
