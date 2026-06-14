"use client";

import { useEffect, useState } from "react";

// Toggles the custom cursor on/off. State persists in localStorage ("gh-cursor")
// and a "gh-cursor-change" event tells the mounted CustomCursor to react live.
export default function CursorToggle() {
  const [on, setOn] = useState(true);

  useEffect(() => {
    try { setOn(localStorage.getItem("gh-cursor") !== "off"); } catch {}
  }, []);

  function toggle() {
    const next = !on;
    setOn(next);
    try { localStorage.setItem("gh-cursor", next ? "on" : "off"); } catch {}
    window.dispatchEvent(new Event("gh-cursor-change"));
  }

  return (
    <button
      type="button"
      className="gh-scene-toggle"
      onClick={toggle}
      aria-pressed={on}
      title="Toggle the custom cursor"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" opacity={on ? 1 : 0.5}>
        <path d="M5 3l6.5 16 2-6.5 6.5-2z" />
      </svg>
      <span className="gh-scene-toggle__lbl">Cursor · {on ? "On" : "Off"}</span>
    </button>
  );
}
