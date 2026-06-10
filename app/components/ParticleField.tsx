"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  size: number;
  vy: number;
  vx: number;
  opacity: number;
  opacityDir: number;
  hue: number;
}

const COUNT = 65;

function make(w: number, h: number, fromBottom = false): Particle {
  return {
    x: Math.random() * w,
    y: fromBottom ? h + Math.random() * 80 : Math.random() * h,
    size: Math.random() * 2.2 + 0.6,
    vy: -(Math.random() * 0.35 + 0.12),
    vx: (Math.random() - 0.5) * 0.28,
    opacity: Math.random() * 0.45 + 0.08,
    opacityDir: Math.random() < 0.5 ? 1 : -1,
    hue: Math.random() * 30 + 28, // 28–58: amber to gold
  };
}

export default function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf: number;
    let running = false;
    let particles: Particle[] = [];

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
    }

    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < COUNT; i++) {
      particles.push(make(canvas.width, canvas.height));
    }

    function frame() {
      const w = canvas!.width;
      const h = canvas!.height;
      ctx!.clearRect(0, 0, w, h);

      for (const p of particles) {
        // draw
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx!.fillStyle = `hsla(${p.hue}, 95%, 70%, ${p.opacity})`;
        ctx!.shadowBlur = p.size * 8;
        ctx!.shadowColor = `hsla(${p.hue}, 100%, 65%, ${p.opacity * 0.7})`;
        ctx!.fill();

        // update position
        p.y += p.vy;
        p.x += p.vx;

        // breathe opacity
        p.opacity += p.opacityDir * 0.0025;
        if (p.opacity > 0.58) p.opacityDir = -1;
        if (p.opacity < 0.05) p.opacityDir = 1;

        // respawn from bottom when offscreen top
        if (p.y < -12) Object.assign(p, make(w, h, true));
      }

      ctx!.shadowBlur = 0;
      raf = requestAnimationFrame(frame);
    }

    // Pause entirely while the scene is toggled off (html.gh-bg-off)
    function syncRunning() {
      const shouldRun = !document.documentElement.classList.contains("gh-bg-off");
      if (shouldRun && !running) { running = true; frame(); }
      if (!shouldRun && running) { running = false; cancelAnimationFrame(raf); }
    }
    const observer = new MutationObserver(syncRunning);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    syncRunning();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="gh-particles"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        opacity: 0.55,
      }}
    />
  );
}
