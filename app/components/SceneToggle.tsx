"use client";

import { useSyncExternalStore } from "react";

// State lives on <html> as `gh-bg-off` (applied pre-paint by an inline script
// in the root layout) so every instance of this toggle stays in sync.
function subscribe(onChange: () => void) {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}
const readOff = () => document.documentElement.classList.contains("gh-bg-off");
const readServer = () => false;

/**
 * Toggles the photographic background + particle field off for easier
 * reading. Persists in localStorage.
 */
export default function SceneToggle() {
  const off = useSyncExternalStore(subscribe, readOff, readServer);

  function toggle() {
    const next = !off;
    document.documentElement.classList.toggle("gh-bg-off", next);
    try { localStorage.setItem("gh-bg", next ? "off" : "on"); } catch {}
  }

  return (
    <button
      type="button"
      className="gh-scene-toggle"
      onClick={toggle}
      aria-pressed={off}
      title={off ? "Bring the meadow back" : "Quiet the background for reading"}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" opacity={off ? 0.55 : 1}>
        <path d="M5 19c0-8 5-14 14-14 0 9-6 14-14 14Zm0 0c2-5 5-8 9-10" />
      </svg>
      <span className="gh-scene-toggle__lbl">{off ? "Scene off" : "Scene"}</span>
    </button>
  );
}
