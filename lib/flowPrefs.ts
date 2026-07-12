// Per-device view preferences for the flow workspace: the film-grain backdrop,
// full-width panes, the outline's text size, and the document zoom. These are
// how-it-looks-on-THIS-screen choices (a laptop and a tournament monitor want
// different sizes), so they live in localStorage — not on the flow row — and
// change nothing for collaborators.
//
// Same-tab reactivity is by subscription (components that consume a pref call
// onFlowPrefs / useSyncExternalStore); the snapshot object is replaced on every
// write so referential equality means "nothing changed".

export interface FlowPrefs {
  grain: boolean;      // animated film-grain backdrop on the flow canvas
  fullWidth: boolean;  // let a solo pane use the whole window instead of centering
  fontSize: number;    // outline text px (labels/headings scale with it)
  zoom: number;        // document zoom percent (100 = normal)
}

export const FLOW_FONT_DEFAULT = 18;   // matches .flow-node__text's stylesheet size
export const FLOW_FONT_MIN = 12;
export const FLOW_FONT_MAX = 28;
export const FLOW_ZOOM_DEFAULT = 100;
export const FLOW_ZOOM_MIN = 50;
export const FLOW_ZOOM_MAX = 200;
export const FLOW_ZOOM_STEP = 10;

const DEFAULTS: FlowPrefs = { grain: true, fullWidth: false, fontSize: FLOW_FONT_DEFAULT, zoom: FLOW_ZOOM_DEFAULT };

const KEY = "flow.viewprefs.v1";
const isBrowser = typeof window !== "undefined";
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function sanitize(raw: unknown): FlowPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<FlowPrefs>;
  return {
    grain: typeof r.grain === "boolean" ? r.grain : DEFAULTS.grain,
    fullWidth: typeof r.fullWidth === "boolean" ? r.fullWidth : DEFAULTS.fullWidth,
    fontSize: typeof r.fontSize === "number" ? clamp(Math.round(r.fontSize), FLOW_FONT_MIN, FLOW_FONT_MAX) : DEFAULTS.fontSize,
    zoom: typeof r.zoom === "number" ? clamp(Math.round(r.zoom), FLOW_ZOOM_MIN, FLOW_ZOOM_MAX) : DEFAULTS.zoom,
  };
}

function load(): FlowPrefs {
  if (!isBrowser) return DEFAULTS;
  try {
    return sanitize(JSON.parse(localStorage.getItem(KEY) || "null"));
  } catch {
    return DEFAULTS;
  }
}

let current: FlowPrefs = load();
const listeners = new Set<() => void>();

// Stable snapshots for useSyncExternalStore (server side must not read storage).
export const getFlowPrefs = (): FlowPrefs => current;
export const getFlowPrefsServer = (): FlowPrefs => DEFAULTS;

export function onFlowPrefs(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function setFlowPrefs(patch: Partial<FlowPrefs>) {
  current = sanitize({ ...current, ...patch });
  if (isBrowser) {
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* quota */ }
  }
  for (const fn of listeners) fn();
}
