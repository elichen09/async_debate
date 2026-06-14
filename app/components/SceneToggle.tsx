"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// Scene picker. State lives on <html> as a `gh-bg-*` class (applied pre-paint
// by an inline script in the root layout) so every instance stays in sync.
// "Meadow" is the default — the per-page photos with no class at all.
const SCENES = [
  { value: "on",     cls: null as string | null, light: false, label: "Ocean", desc: "Photos" },
  { value: "grid",   cls: "gh-bg-grid",          light: true,  label: "Grid",   desc: "Light · graph paper" },
  { value: "dots",   cls: "gh-bg-dots",          light: true,  label: "Dots",   desc: "Light · dot matrix" },
  { value: "shadow", cls: "gh-bg-shadow",        light: false, label: "Shadow", desc: "Dark · drifting smoke" },
  { value: "off",    cls: "gh-bg-off",           light: true,  label: "Quiet",  desc: "Light · plain paper" },
] as const;

type SceneValue = (typeof SCENES)[number]["value"];

function subscribe(onChange: () => void) {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}
function readScene(): SceneValue {
  for (const s of SCENES) {
    if (s.cls && document.documentElement.classList.contains(s.cls)) return s.value;
  }
  return "on";
}
const readServer = (): SceneValue => "on";

export default function SceneToggle() {
  const scene = useSyncExternalStore(subscribe, readScene, readServer);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(value: SceneValue) {
    const html = document.documentElement;
    for (const s of SCENES) if (s.cls) html.classList.remove(s.cls);
    const chosen = SCENES.find(s => s.value === value);
    if (chosen?.cls) html.classList.add(chosen.cls);
    html.classList.toggle("gh-light", chosen?.light ?? false);
    try { localStorage.setItem("gh-bg", value); } catch {}
    setOpen(false);
  }

  const current = SCENES.find(s => s.value === scene) ?? SCENES[0];

  return (
    <div className="gh-scene" ref={wrapRef}>
      <button
        type="button"
        className="gh-scene-toggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Change the background scene"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" opacity={scene === "on" ? 1 : 0.55}>
          <path d="M5 19c0-8 5-14 14-14 0 9-6 14-14 14Zm0 0c2-5 5-8 9-10" />
        </svg>
        <span className="gh-scene-toggle__lbl">
          {scene === "on" ? "Scene" : `Scene · ${current.label}`}
        </span>
      </button>

      {open && (
        <div className="gh-scene-menu" role="menu" aria-label="Background scene">
          {SCENES.map(s => (
            <button
              key={s.value}
              type="button"
              role="menuitemradio"
              aria-checked={scene === s.value}
              className={`gh-scene-menu__item ${scene === s.value ? "is-active" : ""}`}
              onClick={() => pick(s.value)}
            >
              <i className={`gh-scene-swatch gh-scene-swatch--${s.value}`} aria-hidden="true" />
              <span>
                <b>{s.label}</b>
                <small>{s.desc}</small>
              </span>
              {scene === s.value && <span className="gh-scene-menu__check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
