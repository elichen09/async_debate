"use client";

import { useEffect, useState } from "react";
import {
  Mode,
  Scheme,
  SCHEMES,
  applyMode,
  applyScheme,
  readMode,
  readScheme,
} from "@/lib/theme";

function SunIcon() {
  return (
    <svg className="db-mode-toggle__ic" width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="db-mode-toggle__ic" width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

export default function ThemePicker() {
  // Start matching whatever the boot script put on <html>.
  const [mode, setMode] = useState<Mode>("light");
  const [scheme, setScheme] = useState<Scheme>("ember");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setMode(readMode());
    setScheme(readScheme());
    setReady(true);
  }, []);

  function toggleMode() {
    const next: Mode = mode === "dark" ? "light" : "dark";
    setMode(next);
    applyMode(next);
  }

  function pickScheme(id: Scheme) {
    setScheme(id);
    applyScheme(id);
  }

  // Avoid rendering label text before we've read the real value (prevents a flash
  // of the wrong label). Swatches are safe to render immediately.
  return (
    <div className="db-theme">
      <button
        className="db-mode-toggle"
        onClick={toggleMode}
        aria-label={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}
      >
        {mode === "dark" ? <MoonIcon /> : <SunIcon />}
        <span className="db-mode-toggle__label">
          {ready ? (mode === "dark" ? "Dark" : "Light") : "Theme"}
        </span>
      </button>

      <div className="db-swatches" role="group" aria-label="Accent color">
        {SCHEMES.map((s) => (
          <button
            key={s.id}
            className={`db-swatch ${scheme === s.id ? "is-active" : ""}`}
            style={{ background: s.swatch }}
            onClick={() => pickScheme(s.id)}
            aria-label={s.label}
            aria-pressed={scheme === s.id}
            title={s.label}
          />
        ))}
      </div>
    </div>
  );
}