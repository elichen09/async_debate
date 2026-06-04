// Theme system for Async Debate.
// Two independent axes: `mode` (light/dark) and `scheme` (accent personality).
// Values are stored in localStorage and mirrored onto <html data-mode/data-scheme>.

export type Mode = "light" | "dark";
export type Scheme = "ember" | "gold" | "azure" | "violet" | "emerald";

export const MODE_KEY = "ad-mode";
export const SCHEME_KEY = "ad-scheme";

export const DEFAULT_SCHEME: Scheme = "ember";

// `swatch` is the resting accent color, shown in the picker dots.
export const SCHEMES: { id: Scheme; label: string; swatch: string }[] = [
  { id: "ember", label: "Ember", swatch: "#d11f2d" },
  { id: "gold", label: "Gold", swatch: "#e7b84b" },
  { id: "azure", label: "Azure", swatch: "#2f7bff" },
  { id: "violet", label: "Violet", swatch: "#7c5cff" },
  { id: "emerald", label: "Emerald", swatch: "#0fa968" },
];

const SCHEME_IDS = SCHEMES.map((s) => s.id);

function isScheme(v: unknown): v is Scheme {
  return typeof v === "string" && (SCHEME_IDS as string[]).includes(v);
}

export function applyMode(mode: Mode) {
  document.documentElement.setAttribute("data-mode", mode);
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* storage may be unavailable (private mode); the attribute still applies */
  }
}

export function applyScheme(scheme: Scheme) {
  document.documentElement.setAttribute("data-scheme", scheme);
  try {
    localStorage.setItem(SCHEME_KEY, scheme);
  } catch {
    /* ignore */
  }
}

// Read whatever the inline boot script already resolved onto <html>,
// so React state starts in sync with the rendered DOM (no flicker, no mismatch).
export function readMode(): Mode {
  return document.documentElement.getAttribute("data-mode") === "dark"
    ? "dark"
    : "light";
}

export function readScheme(): Scheme {
  const s = document.documentElement.getAttribute("data-scheme");
  return isScheme(s) ? s : DEFAULT_SCHEME;
}

// Inline script injected into <head>. Runs before first paint so the correct
// theme is on <html> before any pixels are drawn. Kept tiny and dependency-free.
export const THEME_BOOT_SCRIPT = `
(function () {
  try {
    var m = localStorage.getItem("${MODE_KEY}");
    if (m !== "light" && m !== "dark") {
      m = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    var s = localStorage.getItem("${SCHEME_KEY}");
    var valid = ${JSON.stringify(SCHEME_IDS)};
    if (valid.indexOf(s) === -1) s = "${DEFAULT_SCHEME}";
    var el = document.documentElement;
    el.setAttribute("data-mode", m);
    el.setAttribute("data-scheme", s);
  } catch (e) {
    document.documentElement.setAttribute("data-mode", "light");
    document.documentElement.setAttribute("data-scheme", "${DEFAULT_SCHEME}");
  }
})();
`;