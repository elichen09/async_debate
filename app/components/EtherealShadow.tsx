"use client";

import { useEffect, useRef, useState } from "react";

// "Shadow" scene layer: a ocean-blue smoke mask drifted by animated SVG
// turbulence. Ported dependency-free from the framer-motion "etheral shadow"
// component; renders only while the gh-bg-shadow scene is active so the
// filter work stops the moment another scene is picked.

const MASK_URL = "https://framerusercontent.com/images/ceBGguIpUU8luwByxuQz79t7To.png";
const NOISE_URL = "https://framerusercontent.com/images/g0QcWrxr87K0ufOxIUFBakwYA8.png";

const SCALE = 100;        // displacement intensity, 1–100
const SPEED = 90;         // drift speed, 1–100
const COLOR = "rgba(78, 120, 150, 0.9)"; // ocean smoke
const NOISE_OPACITY = 0.5;
const NOISE_SCALE = 1.2;

function mapRange(value: number, fromLow: number, fromHigh: number, toLow: number, toHigh: number): number {
  if (fromLow === fromHigh) return toLow;
  return toLow + ((value - fromLow) / (fromHigh - fromLow)) * (toHigh - toLow);
}

export default function EtherealShadow() {
  const [active, setActive] = useState(false);
  const [reduced, setReduced] = useState(false);
  const feRef = useRef<SVGFEColorMatrixElement>(null);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const html = document.documentElement;
    const update = () => setActive(html.classList.contains("gh-bg-shadow"));
    update();
    const obs = new MutationObserver(update);
    obs.observe(html, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // Drive the turbulence hue rotation (what makes the smoke drift).
  useEffect(() => {
    if (!active || reduced) return;
    const durMs = (mapRange(SPEED, 1, 100, 1000, 50) / 25) * 1000;
    let raf: number;
    const t0 = performance.now();
    function tick(t: number) {
      const hue = (((t - t0) % durMs) / durMs) * 360;
      feRef.current?.setAttribute("values", String(hue));
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, reduced]);

  if (!active) return null;

  const displacement = mapRange(SCALE, 1, 100, 20, 100);
  const animated = !reduced;

  return (
    <div
      aria-hidden="true"
      style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}
    >
      <div
        style={{
          position: "absolute",
          inset: -displacement,
          filter: animated ? "url(#gh-ethereal) blur(4px)" : "blur(3px)",
        }}
      >
        {animated && (
          <svg style={{ position: "absolute" }}>
            <defs>
              <filter id="gh-ethereal">
                <feTurbulence
                  result="undulation"
                  numOctaves="2"
                  baseFrequency={`${mapRange(SCALE, 0, 100, 0.001, 0.0005)},${mapRange(SCALE, 0, 100, 0.004, 0.002)}`}
                  seed="0"
                  type="turbulence"
                />
                <feColorMatrix ref={feRef} in="undulation" type="hueRotate" values="180" />
                <feColorMatrix
                  in="dist"
                  result="circulation"
                  type="matrix"
                  values="4 0 0 0 1  4 0 0 0 1  4 0 0 0 1  1 0 0 0 0"
                />
                <feDisplacementMap in="SourceGraphic" in2="circulation" scale={displacement} result="dist" />
                <feDisplacementMap in="dist" in2="undulation" scale={displacement} result="output" />
              </filter>
            </defs>
          </svg>
        )}
        <div
          style={{
            backgroundColor: COLOR,
            maskImage: `url('${MASK_URL}')`,
            WebkitMaskImage: `url('${MASK_URL}')`,
            maskSize: "cover",
            maskRepeat: "no-repeat",
            maskPosition: "center",
            width: "100%",
            height: "100%",
          }}
        />
      </div>

      {NOISE_OPACITY > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url("${NOISE_URL}")`,
            backgroundSize: NOISE_SCALE * 200,
            backgroundRepeat: "repeat",
            opacity: NOISE_OPACITY / 2,
          }}
        />
      )}
    </div>
  );
}
