"use client";

import { Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { enqueueInsert, enqueueUpdate, enqueueDelete } from "@/lib/flowSync";
import { blockToHtml, cardHtml } from "@/lib/richText";
import FlowGrid from "@/app/components/flow/FlowGrid";
import FlowSpeech from "@/app/components/flow/FlowSpeech";
import SendDoc from "@/app/components/flow/SendDoc";
import ReadDocView from "@/app/components/flow/ReadDocView";
import FlowTimers, { type TimerSnap, type TimerKey } from "@/app/components/flow/FlowTimers";
import FlowSnapshots from "@/app/components/flow/FlowSnapshots";
import FolderColors from "@/app/components/flow/FolderColors";
import { takeSnap } from "@/lib/flowSnaps";
import FlowDock from "@/app/components/flow/FlowDock";
import FlowShortcuts from "@/app/components/flow/FlowShortcuts";
import FlowPalette, { type PaletteCommand } from "@/app/components/flow/FlowPalette";
import SyncStatus from "@/app/components/flow/SyncStatus";
import { Columns2, Ellipsis, SquareArrowOutUpRight, X } from "lucide-react";
import type { EditorInsert, Flow, FlowSnippet, FlowCell, FlowTocItem, SlashOption } from "@/app/flow/shared";

const SNIP_SEL = "id, owner_id, label, body, points, shortcut, parent_id, created_at";
type Sibling = { id: string; title: string; folder_id: string | null; side: "aff" | "neg" | null };
type FolderInk = { fid: string; aff: string | null; neg: string | null };
type ViewKind = "flow" | "speech" | "send" | "read";
type DockTab = "extensions" | "share";
// What the single floating (Document PiP) window holds: the timers or a view.
type PipKind = "timers" | ViewKind;
type Pane = { key: string; view: ViewKind; flowId: string };
const VIEW_LABELS: Record<ViewKind, string> = { flow: "Flow", speech: "Speech", send: "Send doc", read: "Read doc" };
const isViewKind = (v: string | null): v is ViewKind => v === "flow" || v === "speech" || v === "send" || v === "read";

// Are we running as the installed app (standalone display mode)? Subscribed via
// useSyncExternalStore so it also tracks moving a tab between browser and app.
function subscribeDisplayMode(cb: () => void): () => void {
  const m = window.matchMedia("(display-mode: standalone)");
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches;

// Document Picture-in-Picture (Chromium): a small always-on-top window we can
// render React into — used to float the timer strip above every other window.
interface DocPiP {
  requestWindow(opts?: { width?: number; height?: number }): Promise<Window>;
}
declare global {
  interface Window { documentPictureInPicture?: DocPiP }
}
const noopSubscribe = () => () => {};
const hasDocPiP = () => "documentPictureInPicture" in window;

// Remembered workspace layout (which view/panel you left open) so a reload — or
// switching flows — lands you back where you were instead of always on Flow.
const UI_KEY = "flow.ui.v1";
type PaneSpec = { view: ViewKind; flowId: string };
type SavedUi = {
  layout: PaneSpec[]; layoutFlow: string; widths: number[];   // the current arrangement (for reload / flow switch)
  split: PaneSpec[]; splitWidths: number[]; splitFlow: string; // the last ≥2-pane split (for tab rebuild)
  dock: DockTab | null; timers: boolean;
};
function loadUi(): SavedUi {
  const fallback: SavedUi = { layout: [], layoutFlow: "", widths: [], split: [], splitWidths: [], splitFlow: "", dock: null, timers: false };
  if (typeof window === "undefined") return fallback;
  try {
    const r = JSON.parse(localStorage.getItem(UI_KEY) || "null");
    if (r && typeof r === "object") return {
      layout: Array.isArray(r.layout) ? r.layout : [],
      layoutFlow: typeof r.layoutFlow === "string" ? r.layoutFlow : "",
      widths: Array.isArray(r.widths) ? r.widths : [],
      split: Array.isArray(r.split) ? r.split : [],
      splitWidths: Array.isArray(r.splitWidths) ? r.splitWidths : [],
      splitFlow: typeof r.splitFlow === "string" ? r.splitFlow : "",
      dock: r.dock ?? null,
      timers: !!r.timers,
    };
  } catch { /* ignore */ }
  return fallback;
}
function saveUi(patch: Partial<SavedUi>) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(UI_KEY, JSON.stringify({ ...loadUi(), ...patch })); } catch { /* ignore */ }
}

// Turn saved pane specs into live panes for `flowId`. When the specs were saved
// under this same flow we restore them exactly (sibling-flow panes + widths);
// otherwise we keep the split shape but point flow panes at the current flow — so a
// Flow + Send doc split survives reloads, flow switches, and tab navigation.
let paneKeySeq = 0;
function specsToPanes(specs: PaneSpec[], widths: number[], savedFlow: string, flowId: string): { panes: Pane[]; flexes: Record<string, number> } {
  const sameFlow = savedFlow === flowId && specs.length > 0;
  const list = specs.length ? specs : [{ view: "flow" as ViewKind, flowId }];
  const panes: Pane[] = [];
  const flexes: Record<string, number> = {};
  const seen = new Set<string>();
  list.forEach((s, i) => {
    const fid = s.view === "flow" ? (sameFlow ? s.flowId : flowId) : flowId;
    const dk = `${s.view}:${fid}`;
    if (seen.has(dk)) return;          // never two panes of the same view+flow
    seen.add(dk);
    const key = `p${paneKeySeq++}`;
    panes.push({ key, view: s.view, flowId: fid });
    if (sameFlow && typeof widths[i] === "number") flexes[key] = widths[i];
  });
  if (!panes.length) panes.push({ key: `p${paneKeySeq++}`, view: "flow", flowId });
  return { panes, flexes };
}
function restoreLayout(flowId: string) {
  const ui = loadUi();
  return specsToPanes(ui.layout, ui.widths, ui.layoutFlow, flowId);
}

// Remove Send-doc cards tied to deleted flow points: drop each h4[data-cell] and
// its body (siblings up to the next heading), then any block title (h3[data-block])
// left with no cards.
function removeSendCards(html: string, ids: string[]): string {
  if (!html) return html;
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    let changed = false;
    for (const id of ids) {
      const h = doc.querySelector(`[data-cell="${id}"]`);
      if (!h) continue;
      changed = true;
      let n = h.nextElementSibling;
      while (n && !/^H[1-6]$/.test(n.tagName)) { const x = n; n = n.nextElementSibling; x.remove(); }
      h.remove();
    }
    for (const t of Array.from(doc.querySelectorAll("h3[data-block]"))) {
      let n = t.nextElementSibling;
      let hasCard = false;
      while (n && n.tagName !== "H3") { if ((n as HTMLElement).hasAttribute("data-cell")) { hasCard = true; break; } n = n.nextElementSibling; }
      if (!hasCard) { t.remove(); changed = true; }
    }
    return changed ? doc.body.innerHTML : html;
  } catch {
    return html;
  }
}

// Insert a block's HTML into the Send doc before the card of the first following
// flow point that already has one (so doc order mirrors the outline). If none of
// them have a card yet, append at the end. We insert before that card's block
// title (h3[data-block]) when it's part of a block, else before the card itself.
function insertSendBlock(html: string, blockHtml: string, afterIds: string[]): string {
  if (!afterIds.length) return html + blockHtml;
  try {
    const doc = new DOMParser().parseFromString(html || "", "text/html");
    let anchor: Element | null = null;
    for (const id of afterIds) {
      anchor = doc.querySelector(`[data-block="${id}"]`) || doc.querySelector(`[data-cell="${id}"]`);
      if (anchor) break;
    }
    if (!anchor) return html + blockHtml;
    // If the anchor is a card inside a block, back up to that block's title.
    if (!anchor.hasAttribute("data-block")) {
      let p = anchor.previousElementSibling;
      while (p && !/^H[1-3]$/.test(p.tagName)) p = p.previousElementSibling;
      if (p && p.hasAttribute("data-block")) anchor = p;
    }
    const frag = new DOMParser().parseFromString(blockHtml, "text/html").body;
    while (frag.firstChild) anchor.parentNode!.insertBefore(frag.firstChild, anchor);
    return doc.body.innerHTML;
  } catch {
    return html + blockHtml;
  }
}

// Reorder the Send doc's card segments to match a new flow point order. The doc is
// a flat sequence of heading-led segments; each segment keyed by its heading's
// data-block/data-cell. We sort the KEYED segments by the flow order and slot them
// back into the positions keyed segments occupied, leaving free text in place.
function reorderSendDoc(html: string, orderedIds: string[]): string {
  if (!html) return html;
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const children = Array.from(doc.body.children);
    if (!children.length) return html;
    type Seg = { nodes: Element[]; key: string | null };
    const segs: Seg[] = [];
    for (const el of children) {
      if (/^H[1-6]$/.test(el.tagName) || !segs.length) {
        const key = el.getAttribute("data-block") || el.getAttribute("data-cell");
        segs.push({ nodes: [el], key });
      } else {
        segs[segs.length - 1].nodes.push(el);
      }
    }
    const idx = new Map(orderedIds.map((id, i) => [id, i]));
    const keyed = segs.filter((s) => s.key && idx.has(s.key));
    if (keyed.length < 2) return html;
    const sorted = [...keyed].sort((a, b) => (idx.get(a.key!) ?? 0) - (idx.get(b.key!) ?? 0));
    let k = 0;
    const ordered = segs.map((s) => (s.key && idx.has(s.key) ? sorted[k++] : s));
    const out = ordered.flatMap((s) => s.nodes).map((n) => n.outerHTML).join("");
    return out || html;
  } catch {
    return html;
  }
}

export default function FlowWorkspace() {
  const router = useRouter();
  const { id } = useParams();
  const flowId = id as string;
  // "?pane=speech" renders this window as ONE full-bleed view — the popped-out
  // window a tab's ↗ button opens in the installed app. No header/tabs/timers;
  // Realtime keeps it in sync with the main window (same machinery partners use).
  const search = useSearchParams();
  const paneParam = search.get("pane");
  const paneView: ViewKind | null = isViewKind(paneParam) ? paneParam : null;
  // Installed-app detection (FishFlower): the pop-out affordance only shows in
  // the standalone window — a browser tab can already be torn off natively.
  // (false during SSR, so the server HTML never includes the buttons.)
  const isApp = useSyncExternalStore(subscribeDisplayMode, isStandalone, () => false);
  // The one floating always-on-top window (the platform allows a single
  // Document Picture-in-Picture window per app). It holds either the timer
  // strip or ONE popped-out view — opening a new float replaces the old one,
  // which docks back. The content is portaled from THIS React tree, so
  // hotkeys, Realtime sync, the pace chip, and auto-snapshots keep working.
  const canPip = useSyncExternalStore(noopSubscribe, hasDocPiP, () => false);
  const [pip, setPip] = useState<{ kind: PipKind; win: Window } | null>(null);
  useEffect(() => () => { pip?.win.close(); }, [pip]);
  // The view currently floating (if any) — its tab is hidden in this window.
  const pipView: ViewKind | null = pip && pip.kind !== "timers" ? pip.kind : null;
  async function openPip(kind: PipKind): Promise<boolean> {
    const dpip = window.documentPictureInPicture;
    if (!dpip) return false;
    try {
      const win = await dpip.requestWindow(
        kind === "timers" ? { width: 330, height: 190 } : { width: 860, height: 660 },
      );
      // A fresh PiP document has no styles or theme — copy both from this one.
      win.document.documentElement.className = document.documentElement.className;
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const css = Array.from(sheet.cssRules).map((r) => r.cssText).join("");
          const style = win.document.createElement("style");
          style.textContent = css;
          win.document.head.appendChild(style);
        } catch {
          // Cross-origin sheet: reference it instead of inlining.
          if (sheet.href) {
            const link = win.document.createElement("link");
            link.rel = "stylesheet";
            link.href = sheet.href;
            win.document.head.appendChild(link);
          }
        }
      }
      win.document.body.className = "flow-pipbody";
      // Guarded by window identity: when a new float replaces this one, the old
      // window's pagehide must not clear the just-set state.
      win.addEventListener("pagehide", () => setPip((p) => (p && p.win === win ? null : p)));
      setPip({ kind, win });
      return true;
    } catch {
      return false; // needs a user gesture, or the browser said no
    }
  }
  const floatTimers = () => { void openPip("timers"); };

  // Views currently living in their own popped-out window. Their tabs don't
  // render here; closing a popup returns its tab (the handles are polled —
  // there's no cross-window close event).
  const [popped, setPopped] = useState<Set<ViewKind>>(new Set());
  const popWindows = useRef<Map<ViewKind, Window>>(new Map());
  useEffect(() => {
    if (!popped.size) return;
    const iv = setInterval(() => {
      const closed: ViewKind[] = [];
      for (const [view, w] of popWindows.current) if (w.closed) closed.push(view);
      if (!closed.length) return;
      for (const v of closed) popWindows.current.delete(v);
      setPopped((prev) => { const n = new Set(prev); for (const v of closed) n.delete(v); return n; });
    }, 1000);
    return () => clearInterval(iv);
  }, [popped.size]);

  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("Partner");
  const [flow, setFlow] = useState<Flow | null>(null);
  const [loading, setLoading] = useState(true);
  // Split view: any number of side-by-side panes. Each is a view of a flow; the
  // Speech/Send panes always target the URL flow, Flow panes can be any sibling.
  const [boot] = useState(() => restoreLayout(flowId));   // saved split, restored once on mount
  const [panes, setPanes] = useState<Pane[]>(boot.panes);
  const [flexes, setFlexes] = useState<Record<string, number>>(boot.flexes);  // per-pane flex-grow weights (drag to resize)
  const [dock, setDockState] = useState<DockTab | null>(() => loadUi().dock);
  const [fullscreen, setFullscreen] = useState(false);
  const [showTimers, setShowTimersState] = useState(() => loadUi().timers);
  const [menu, setMenu] = useState<{ kind: "split" | "more"; rect: DOMRect } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [timerSnap, setTimerSnap] = useState<TimerSnap | null>(null);  // live speech clock for the Read-doc pace chip
  // Last "cut card" action, so it can be undone from a short-lived toast.
  const [cutUndo, setCutUndo] = useState<{ sendHtml: string; rows: FlowCell[]; label: string } | null>(null);
  const cutUndoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Snapshot history dialog + the short-lived "snapshot saved" confirmation.
  const [showSnaps, setShowSnaps] = useState(false);
  const [snapToast, setSnapToast] = useState("");
  const snapToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Folder-level aff/neg font colors, keyed by the folder they were loaded for
  // (a stale folder's colors simply don't match, so no reset-on-switch needed).
  // colorsOk goes false when the columns are missing (flow_colors.sql not run).
  const [folderInk, setFolderInk] = useState<FolderInk | null>(null);
  const [colorsOk, setColorsOk] = useState(true);
  const [showColors, setShowColors] = useState(false);
  // Toggle helpers that also remember the choice for next time.
  const setDock = (d: DockTab | null) => { setDockState(d); saveUi({ dock: d }); };
  const setShowTimers = (v: boolean) => {
    setShowTimersState(v);
    saveUi({ timers: v });
    if (!v && pip?.kind === "timers") pip.win.close();   // hiding the timers also closes their float
  };
  const openMenu = (kind: "split" | "more", e: React.MouseEvent) => {
    // Capture the rect now — the synthetic event's currentTarget is nulled out by
    // the time a state-updater callback runs under automatic batching.
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu((m) => (m?.kind === kind ? null : { kind, rect }));
  };
  const [snippets, setSnippets] = useState<FlowSnippet[]>([]);
  const [sendHtml, setSendHtml] = useState("");
  const [sendVersion, setSendVersion] = useState(0);
  const [siblings, setSiblings] = useState<Sibling[]>([]);
  // Outline navigator: the flow's "# " headings (reported by the solo FlowGrid),
  // the one the viewport is in, and the grid's registered jump-to-point function.
  const [tocItems, setTocItems] = useState<FlowTocItem[]>([]);
  const [tocActive, setTocActive] = useState<string | null>(null);
  const tocJump = useRef<((id: string) => void) | null>(null);
  const handleTocItems = useCallback((items: FlowTocItem[]) => setTocItems(items), []);
  const handleTocActive = useCallback((id: string | null) => setTocActive(id), []);
  const registerTocJump = useCallback((fn: ((id: string) => void) | null) => { tocJump.current = fn; }, []);

  // The App Router reuses this component when navigating between flows in the same
  // route, so reset the split back to a single pane for the new flow.
  const [prevFlowId, setPrevFlowId] = useState(flowId);
  if (prevFlowId !== flowId) {
    setPrevFlowId(flowId);
    // Restore the saved split shape for the flow we're switching to.
    const r = restoreLayout(flowId);
    setPanes(r.panes);
    setFlexes(r.flexes);
  }

  const activeInsert = useRef<EditorInsert | null>(null);
  const registerInsert = (fn: EditorInsert | null) => { activeInsert.current = fn; };
  const addPointsRef = useRef<((tags: string[]) => void) | null>(null);
  const snippetsRef = useRef<FlowSnippet[]>([]);
  const panesRef = useRef(panes);
  const paneSeq = useRef(1);
  const flexesRef = useRef(flexes);
  useEffect(() => { flexesRef.current = flexes; }, [flexes]);
  const savedFlowPanesRef = useRef<Pane[]>(panes);   // last flow-pane arrangement, restored by the Flow tab
  const sendHtmlRef = useRef("");
  const lastSendEdit = useRef(0);
  const sendSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { snippetsRef.current = snippets; }, [snippets]);
  useEffect(() => { panesRef.current = panes; }, [panes]);
  useEffect(() => { sendHtmlRef.current = sendHtml; }, [sendHtml]);
  // Remember the flow-pane layout (so the Flow tab can restore a 2-flow split after
  // you visit Speech/Send).
  useEffect(() => {
    const fp = panes.filter((p) => p.view === "flow");
    if (fp.length) savedFlowPanesRef.current = fp;
  }, [panes]);

  // Persist the pane layout (views + which flow each shows + column widths) so a
  // split survives reloads and follows you across flows. Any time it's an actual
  // split (≥2 panes) we also stash it as the remembered split a tab can rebuild.
  // Widths come from the ref (latest committed) so resizing rewrites on drag end.
  // A popped-out pane window never writes — it must not overwrite the saved layout.
  useEffect(() => {
    if (paneView) return;
    const specs = panes.map((p) => ({ view: p.view, flowId: p.flowId }));
    const widths = panes.map((p) => flexesRef.current[p.key] ?? 1);
    const patch: Partial<SavedUi> = { layout: specs, layoutFlow: flowId, widths };
    if (panes.length >= 2) { patch.split = specs; patch.splitWidths = widths; patch.splitFlow = flowId; }
    saveUi(patch);
  }, [panes, flowId, paneView]);

  // Fullscreen workspace (and popped-out pane windows): hide the site nav/rail
  // so the work surface fills the whole screen/window.
  useEffect(() => {
    document.body.classList.toggle("flow-work-full", fullscreen || !!paneView);
    return () => document.body.classList.remove("flow-work-full");
  }, [fullscreen, paneView]);

  // A popped-out window is titled by what it shows, e.g. "Blocks — Speech".
  useEffect(() => {
    if (paneView && flow) document.title = `${flow.title} — ${VIEW_LABELS[paneView]}`;
  }, [paneView, flow]);

  // Clear the pending undo/toast timers if the workspace unmounts.
  useEffect(() => () => {
    if (cutUndoTimer.current) clearTimeout(cutUndoTimer.current);
    if (snapToastTimer.current) clearTimeout(snapToastTimer.current);
  }, []);

  // --- Flow snapshots (freeze the outline at the end of a speech) ---
  function flashSnapToast(msg: string) {
    setSnapToast(msg);
    if (snapToastTimer.current) clearTimeout(snapToastTimer.current);
    snapToastTimer.current = setTimeout(() => { snapToastTimer.current = null; setSnapToast(""); }, 2600);
  }
  function snapNow(label: string) {
    const snap = takeSnap(flowId, label);
    flashSnapToast(snap ? `Snapshot saved — ${snap.label}` : "Nothing to snapshot yet");
  }

  // With the Timers open, a snapshot is taken automatically when the speech clock
  // runs out — the end-of-speech moment worth freezing. Keyed on endsAt so pausing
  // or resetting cancels it and each countdown fires at most once.
  const lastAutoSnap = useRef(0);
  useEffect(() => {
    const c = timerSnap?.main;
    if (!c?.running || c.endsAt == null) return;
    const endsAt = c.endsAt;
    // eslint-disable-next-line react-hooks/purity -- reading the clock to schedule a one-shot timer is effect work, not render logic
    const wait = endsAt - Date.now();
    if (wait <= 0) return;
    const t = setTimeout(() => {
      if (lastAutoSnap.current === endsAt) return;
      lastAutoSnap.current = endsAt;
      if (takeSnap(flowId, "End of speech")) flashSnapToast("Snapshot saved — end of speech");
    }, wait);
    return () => clearTimeout(t);
  }, [timerSnap, flowId]);

  // --- Folder aff/neg font colors ---
  // Loaded separately from the Send doc (so a missing column can't break that
  // load); saved straight to the folder row, which every flow in it reads.
  useEffect(() => {
    const fid = flow?.folder_id;
    if (!fid) return;
    let active = true;
    supabase.from("flow_folders").select("aff_color, neg_color").eq("id", fid).single().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        // Missing columns → surface the run-the-SQL hint. Anything else (e.g. a
        // collaborator who can't read the owner's folder row) just means no
        // custom colors here — not a schema problem.
        if (/column|schema cache/i.test(error.message)) setColorsOk(false);
        return;
      }
      setColorsOk(true);
      const row = data as { aff_color: string | null; neg_color: string | null };
      setFolderInk({ fid, aff: row.aff_color ?? null, neg: row.neg_color ?? null });
    });
    return () => { active = false; };
  }, [flow?.folder_id]);

  // Colors loaded for the CURRENT folder (stale ones from a previous flow don't match).
  const activeInk = folderInk && folderInk.fid === flow?.folder_id ? folderInk : null;

  function saveFolderInk(aff: string | null, neg: string | null) {
    const fid = flow?.folder_id;
    if (!fid) return;
    setFolderInk({ fid, aff, neg });
    supabase.from("flow_folders").update({ aff_color: aff, neg_color: neg }).eq("id", fid)
      .then(({ error }) => { if (error) flashSnapToast(`Couldn't save colors: ${error.message}`); });
  }

  // A pane's alternating depth colors: the flow's own side color leads (depth 0,
  // 2, …) and the opposing side's answers it (depth 1, 3, …) — aff/neg/aff on an
  // aff flow, neg/aff/neg on a neg flow. Sideless flows keep the theme defaults.
  function paneInk(fid: string): [string | null, string | null] | null {
    if (!activeInk || (!activeInk.aff && !activeInk.neg)) return null;
    const side = siblings.find((s) => s.id === fid)?.side ?? (fid === flowId ? flow?.side : null);
    if (side === "aff") return [activeInk.aff, activeInk.neg];
    if (side === "neg") return [activeInk.neg, activeInk.aff];
    return null;
  }

  // --- Global timer hotkeys (Alt+S / Alt+P / Alt+C) ---
  // FlowTimers registers a start/pause toggle; if the strip is hidden the hotkey
  // opens it and the toggle runs as soon as it mounts.
  const timerCtl = useRef<((k: TimerKey) => void) | null>(null);
  const pendingTimerKey = useRef<TimerKey | null>(null);
  const registerTimerControls = (fn: ((k: TimerKey) => void) | null) => {
    timerCtl.current = fn;
    if (fn && pendingTimerKey.current) { fn(pendingTimerKey.current); pendingTimerKey.current = null; }
  };
  function toggleTimer(k: TimerKey) {
    if (timerCtl.current) { timerCtl.current(k); return; }
    pendingTimerKey.current = k;
    setShowTimers(true);
  }
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      // e.code, not e.key — macOS Option+letter types a special character.
      const map: Record<string, TimerKey> = { KeyS: "main", KeyP: "pro", KeyC: "con" };
      const k = map[e.code];
      if (!k) return;
      e.preventDefault();
      toggleTimer(k);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- View / split controls ---
  // A tab switches to its view. Clicking it focuses that view — collapsing a split
  // down to it — so "go to Flow" always shows Flow. It only no-ops when you're
  // already showing exactly that view (a single pane of it, or for Flow the
  // all-flow arrangement), so clicking the active tab never re-mounts the editor.
  // Splits are created explicitly with the + (split) control.
  function setView(view: ViewKind) {
    const already = view === "flow"
      ? panes.length > 0 && panes.every((p) => p.view === "flow")
      : panes.length === 1 && panes[0].view === view;
    if (already) return;
    setFlexes({});
    if (view === "flow") {
      // Restore the last flow-pane arrangement (e.g. a 2-flow split), else a fresh
      // single flow pane for the URL flow.
      const fp = savedFlowPanesRef.current.filter((p) => p.view === "flow");
      setPanes(fp.length ? fp : [{ key: `p${paneSeq.current++}`, view: "flow", flowId }]);
      return;
    }
    setPanes([{ key: `p${paneSeq.current++}`, view, flowId }]);
  }
  // A tab is active when its view is visible in any pane (both light up in a split).
  const isViewShown = (view: ViewKind) => panes.some((p) => p.view === view);
  // Split EXPLICITLY: add a view (for the URL flow) or another flow as a new pane.
  function addPane(view: ViewKind, fid: string = flowId) {
    const key = `p${paneSeq.current++}`;
    setFlexes({});  // reset to equal widths when the set of panes changes
    setPanes((prev) => (prev.some((p) => p.view === view && p.flowId === fid) ? prev : [...prev, { key, view, flowId: fid }]));
  }
  function closePane(key: string) {
    if (panes.length <= 1) return;
    setFlexes({});
    const next = panes.filter((p) => p.key !== key);
    setPanes(next);
    // Explicitly closing down to one pane dismantles the split — forget it so a tab
    // click doesn't resurrect it (tab-navigation collapses keep the memory).
    if (next.length < 2) saveUi({ split: [], splitWidths: [], splitFlow: "" });
  }
  // Pop a view out (installed app only): into the floating always-on-top PiP
  // window when the engine supports it (replacing whatever floated before —
  // one float per app), else a plain popup via the "?pane=" route. Either way
  // this window stops rendering the view — its tab disappears until the
  // float/popup closes — so the doc is never showing twice.
  async function popOut(view: ViewKind) {
    if (canPip) {
      if (!(await openPip(view))) return;
    } else {
      const w = window.open(`/flow/${flowId}?pane=${view}`, `fishflower-${view}-${flowId}`, "popup=yes,width=980,height=800");
      if (!w) return;   // popup blocked — keep the tab
      w.focus();
      popWindows.current.set(view, w);
      setPopped((prev) => new Set(prev).add(view));
    }
    const gone = new Set(popped).add(view);
    setFlexes({});
    setPanes((prev) => {
      const rest = prev.filter((p) => p.view !== view);
      if (rest.length) return rest;
      // Land on a view that isn't itself popped out (or flow, if all four are).
      const fallback = (["flow", "speech", "send", "read"] as ViewKind[]).find((v) => !gone.has(v)) ?? "flow";
      return [{ key: `p${paneSeq.current++}`, view: fallback, flowId }];
    });
  }
  // Drag a divider to stretch/shrink the two panes on either side. Conserves the
  // pair's combined width, so other panes stay put. flex-grow ratios = width ratios
  // (panes have flex-basis 0).
  function startResize(e: React.PointerEvent, leftKey: string, rightKey: string) {
    e.preventDefault();
    const resizer = e.currentTarget as HTMLElement;
    const leftEl = resizer.previousElementSibling as HTMLElement | null;
    const rightEl = resizer.nextElementSibling as HTMLElement | null;
    if (!leftEl || !rightEl) return;
    const leftW0 = leftEl.offsetWidth;
    const pairPx = leftW0 + rightEl.offsetWidth;
    const startX = e.clientX;
    const combined = (flexesRef.current[leftKey] ?? 1) + (flexesRef.current[rightKey] ?? 1);
    resizer.classList.add("is-active");
    const onMove = (ev: PointerEvent) => {
      const nl = leftW0 + (ev.clientX - startX);
      const ratio = Math.max(0.12, Math.min(0.88, nl / pairPx));
      setFlexes((prev) => ({ ...prev, [leftKey]: combined * ratio, [rightKey]: combined * (1 - ratio) }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      resizer.classList.remove("is-active");
      document.body.classList.remove("flow-resizing");
      // Remember the new column widths for this layout (and the remembered split).
      const w = panesRef.current.map((p) => flexesRef.current[p.key] ?? 1);
      saveUi(panesRef.current.length >= 2 ? { widths: w, splitWidths: w } : { widths: w });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    document.body.classList.add("flow-resizing");
  }

  // --- Send doc persistence (shared across a folder's flows; per-flow if ungrouped) ---
  // The doc lives on the folder row when the flow is in one, else on the flow row,
  // so every flow in a folder opens the same Send doc. Typing autosaves; appends
  // from other flows stream back. Inbound events are ignored for ~1.5s after a
  // local change so the caret never jumps.
  function sendTarget(): [string, string] | null {
    if (!flow) return null;
    return flow.folder_id ? ["flow_folders", flow.folder_id] : ["flows", flowId];
  }
  function saveSend(html: string) {
    const t = sendTarget();
    if (!t) return;
    // Through the offline outbox so cut cards survive a dropped connection and sync
    // back automatically (coalesced per row, so a burst of edits is one write).
    enqueueUpdate(t[0], t[1], { send_html: html });
  }
  function scheduleSendSave() {
    // Throttle (not debounce) so collaborators see Send-doc edits stream in; the
    // timer saves the latest html (from the ref) when it fires.
    if (sendSaveTimer.current) return;
    sendSaveTimer.current = setTimeout(() => { sendSaveTimer.current = null; saveSend(sendHtmlRef.current); }, 600);
  }
  function applyRemoteSend(html: string) {
    sendHtmlRef.current = html;
    setSendHtml(html);
    setSendVersion((v) => v + 1);
  }
  // Local change → mirror + persist. bump=true re-syncs the editor DOM (programmatic
  // appends/removes); typing passes bump=false to preserve the caret.
  function commitSend(html: string, bump: boolean) {
    sendHtmlRef.current = html;
    setSendHtml(html);
    if (bump) setSendVersion((v) => v + 1);
    lastSendEdit.current = Date.now();
    scheduleSendSave();
  }
  const handleSendChange = (html: string) => commitSend(html, false);

  // Append an extension's block to the Send doc. cellIds (from a flow "/trigger")
  // tie each card to the flow point it created, so deleting that point removes it.
  function appendBlock(snip: FlowSnippet, cellIds?: string[]) {
    commitSend(sendHtmlRef.current + blockToHtml(snip.label, snip.points, snip.body, cellIds), true);
  }
  function onSlashBlock(trigger: string, cellIds: string[], afterIds: string[] = []) {
    const snip = findByTrigger(trigger);
    if (!snip) return;
    const blockHtml = blockToHtml(snip.label, snip.points, snip.body, cellIds);
    commitSend(insertSendBlock(sendHtmlRef.current, blockHtml, afterIds), true);
  }
  function onCellsDeleted(ids: string[]) {
    const next = removeSendCards(sendHtmlRef.current, ids);
    if (next !== sendHtmlRef.current) commitSend(next, true);
  }

  // Double-click a card in the read doc → cut it. "delete" (plan mode) removes the
  // card from the Send doc entirely; "red" (normal mode) flags it cut (red font +
  // data-cut) so it drops from the read doc but stays, in red, in the Send doc.
  // Either way the flow points the card is tied to (data-cell / data-block) are
  // deleted from the outline. `ho` is the card's heading ordinal in the read doc.
  async function cutReadCard(ho: number, mode: "delete" | "red") {
    const prevHtml = sendHtmlRef.current;
    if (!prevHtml) return;
    let doc: Document;
    try { doc = new DOMParser().parseFromString(prevHtml, "text/html"); } catch { return; }
    // The read doc emits one heading per non-empty, non-cut Send heading, in order,
    // so the Nth such heading here is the card that was double-clicked.
    const heading = Array.from(doc.querySelectorAll("h1, h2, h3, h4, h5, h6"))
      .filter((h) => (h.textContent ?? "").trim() && !h.hasAttribute("data-cut"))[ho];
    if (!heading) return;
    // The card = its heading + the following siblings up to the next heading.
    const nodes: Element[] = [heading];
    for (let n = heading.nextElementSibling; n && !/^H[1-6]$/.test(n.tagName); n = n.nextElementSibling) nodes.push(n);
    const ids = new Set<string>();
    for (const el of nodes) {
      const dc = el.getAttribute("data-cell"); if (dc) ids.add(dc);
      const db = el.getAttribute("data-block"); if (db) ids.add(db);
    }
    if (mode === "delete") {
      for (const el of nodes) el.remove();
    } else {
      for (const el of nodes) { el.setAttribute("data-cut", "1"); (el as HTMLElement).style.color = "#c0392b"; }
    }
    commitSend(doc.body.innerHTML, true);
    // Snapshot the flow rows BEFORE deleting them, so Undo can re-insert them with
    // their original ids (keeping the Send doc's data-cell references valid).
    let rows: FlowCell[] = [];
    if (ids.size) {
      const idList = [...ids];
      const { data } = await supabase.from("flow_cells").select("*").in("id", idList);
      rows = (data ?? []) as FlowCell[];
      enqueueDelete("flow_cells", idList);
    }
    armUndo(prevHtml, rows, mode === "delete" ? "Card deleted" : "Card cut");
  }

  // A 7-second "Undo" window for the last cut: restore the Send doc and re-insert
  // the deleted flow rows (same ids, so data-cell links still resolve).
  function armUndo(sendHtml: string, rows: FlowCell[], label: string) {
    if (cutUndoTimer.current) clearTimeout(cutUndoTimer.current);
    setCutUndo({ sendHtml, rows, label });
    cutUndoTimer.current = setTimeout(() => { cutUndoTimer.current = null; setCutUndo(null); }, 7000);
  }
  function undoCut() {
    const u = cutUndo;
    if (!u) return;
    if (cutUndoTimer.current) { clearTimeout(cutUndoTimer.current); cutUndoTimer.current = null; }
    setCutUndo(null);
    commitSend(u.sendHtml, true);
    if (u.rows.length) {
      const restore = u.rows.map((r) => ({
        id: r.id, flow_id: r.flow_id, col: r.col, row_index: r.row_index,
        depth: r.depth, highlighted: r.highlighted, content: r.content,
        status: r.status ?? null, updated_by: r.updated_by,
        updated_at: new Date().toISOString(),
      }));
      for (const r of restore) enqueueInsert("flow_cells", r);
    }
  }

  // Flow points were dragged into a new order — reflow the Send doc cards to match.
  function onReorder(orderedIds: string[]) {
    const next = reorderSendDoc(sendHtmlRef.current, orderedIds);
    if (next !== sendHtmlRef.current) commitSend(next, true);
  }

  // The reverse: the Send doc outline was reordered, so reorder the flow points its
  // cards are linked to. We reshuffle just the linked cells among the row_index
  // slots they already occupy (so unlinked points stay put), matching the new doc
  // order. The FlowGrid picks the change up over Realtime.
  async function reorderFlowFromDoc(orderedCellIds: string[]) {
    if (orderedCellIds.length < 2) return;
    const { data } = await supabase.from("flow_cells").select("id, row_index").in("id", orderedCellIds);
    if (!data || !data.length) return;
    const byId = new Map(data.map((r) => [r.id as string, r.row_index as number]));
    const present = orderedCellIds.filter((id) => byId.has(id));
    if (present.length < 2) return;
    const slots = present.map((id) => byId.get(id) as number).sort((a, b) => a - b);
    if (present.every((id, i) => byId.get(id) === slots[i])) return; // already in this order
    present.forEach((id, i) =>
      enqueueUpdate("flow_cells", id, { row_index: slots[i], updated_by: userId, updated_at: new Date().toISOString() }),
    );
  }

  // "/send" from the flow: append each point to the Send doc as a Heading-4 card,
  // tied to its cell id so deleting the point removes the card (and it isn't added
  // twice).
  function sendPointsToSend(cells: { id: string; content: string }[]) {
    let html = sendHtmlRef.current;
    let added = false;
    for (const c of cells) {
      if (html.includes(`data-cell="${c.id}"`)) continue;
      html += cardHtml(c.content.trim() || "(untitled point)", [], c.id);
      added = true;
    }
    if (added) commitSend(html, true);
  }

  // The "/trigger" options for the slash autocomplete: each block's shortcut +
  // name, a chip (the "---tag" speech suffix, else the trigger), and a depth so
  // sub-blocks nest under their parent. Built in tree order (parent then children).
  const slashOptions: SlashOption[] = (() => {
    const withSc = snippets.filter((s) => (s.shortcut ?? "").trim());
    const speechTag = (label: string) => { const m = /---\s*(.+?)\s*$/.exec(label); return m ? m[1] : undefined; };
    const childrenOf = new Map<string, FlowSnippet[]>();
    for (const s of withSc) if (s.parent_id) (childrenOf.get(s.parent_id) ?? childrenOf.set(s.parent_id, []).get(s.parent_id)!).push(s);
    const out: SlashOption[] = [];
    const seen = new Set<string>();
    const emit = (s: FlowSnippet, depth: number) => {
      const trig = (s.shortcut as string).trim().toLowerCase();
      if (seen.has(s.id)) return;
      seen.add(s.id);
      out.push({ trigger: trig, label: s.label, chip: speechTag(s.label) ?? trig, depth });
      for (const c of childrenOf.get(s.id) ?? []) emit(c, depth + 1);
    };
    for (const s of withSc) if (!s.parent_id) emit(s, 0);
    // Children whose parent has no shortcut (so wasn't a root above).
    for (const s of withSc) if (!seen.has(s.id)) emit(s, 1);
    return out;
  })();

  // Extensions "use" button: add points to the flow (when flowing) + queue Send doc.
  function runExtension(snip: FlowSnippet) {
    const pts = snip.points ?? [];
    const tags = pts.length ? pts.map((p) => p.tag) : [snip.label];
    if (panesRef.current.some((p) => p.view === "flow")) addPointsRef.current?.(tags);
    appendBlock(snip);
  }

  // Download the flow(s) as a .docx: every flow in this folder (outline + speech),
  // plus the folder-shared send doc. A loose flow exports on its own. Data is
  // fetched fresh so it's current; the docx library loads only on first export.
  async function exportDocx() {
    if (!flow) return;
    let docTitle = flow.title;
    let flowRows: { id: string; title: string; speech_body: string }[] =
      [{ id: flow.id, title: flow.title, speech_body: flow.speech_body }];
    if (flow.folder_id) {
      const [{ data: ff }, { data: folderRow }] = await Promise.all([
        supabase.from("flows").select("id, title, speech_body, created_at").eq("folder_id", flow.folder_id).order("created_at", { ascending: true }),
        supabase.from("flow_folders").select("name").eq("id", flow.folder_id).single(),
      ]);
      if (ff && ff.length) flowRows = ff as { id: string; title: string; speech_body: string }[];
      if (folderRow?.name) docTitle = folderRow.name as string;
    }
    const ids = flowRows.map((f) => f.id);
    const { data: cellData } = await supabase.from("flow_cells").select("*").in("flow_id", ids);
    const cells = (cellData ?? []) as FlowCell[];
    const { exportFlowDocx } = await import("@/lib/flowDocx");
    await exportFlowDocx({
      title: docTitle,
      sendHtml: sendHtmlRef.current,
      flows: flowRows.map((f) => ({ title: f.title, speechBody: f.speech_body ?? "", cells: cells.filter((c) => c.flow_id === f.id) })),
    });
  }

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const uid = session.user.id;
      if (active) { setUserId(uid); setUserName((session.user.email ?? "Partner").split("@")[0]); }
      const { data } = await supabase.from("flows").select("*").eq("id", flowId).single();
      if (!active) return;
      if (!data) { router.push("/flow"); return; }
      setFlow(data as Flow);
      setLoading(false);
      const { data: snips } = await supabase.from("flow_snippets").select(SNIP_SEL).eq("owner_id", uid).order("created_at", { ascending: false });
      if (active && snips) setSnippets(snips as FlowSnippet[]);
    }
    load();
    return () => { active = false; };
  }, [flowId, router]);

  useEffect(() => {
    if (!flow) return;
    let active = true;
    (async () => {
      // Scoped to this flow's owner explicitly — the master account's RLS can see
      // every row, so "folder_id is null" alone would tab-bar everyone's loose
      // flows. Owner-scoping also keeps the tabs coherent when the master browses
      // someone else's flow: they see that person's flows, not a global mix.
      const base = supabase
        .from("flows")
        .select("id, title, folder_id, side")
        .eq("owner_id", flow.owner_id)
        .order("created_at", { ascending: true });
      const { data } = await (flow.folder_id ? base.eq("folder_id", flow.folder_id) : base.is("folder_id", null));
      if (active && data) setSiblings(data as Sibling[]);
    })();
    return () => { active = false; };
  }, [flow]);

  // Load + stream the shared Send doc for this flow's folder (or the flow itself).
  useEffect(() => {
    if (!flow) return;
    const t: [string, string] = flow.folder_id ? ["flow_folders", flow.folder_id] : ["flows", flowId];
    let active = true;
    supabase.from(t[0]).select("send_html").eq("id", t[1]).single().then(({ data }) => {
      if (!active || !data) return;
      if (Date.now() - lastSendEdit.current < 1500) return;
      applyRemoteSend((data as { send_html: string | null }).send_html ?? "");
    });
    const channel = supabase
      .channel(`flow_send:${t[0]}:${t[1]}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: t[0], filter: `id=eq.${t[1]}` },
        (payload) => {
          // Folder rows also carry the aff/neg font colors — apply those before
          // the local-edit guard (they're never typed here, so no caret to protect).
          if (t[0] === "flow_folders") {
            const row = payload.new as { aff_color?: string | null; neg_color?: string | null };
            if ("aff_color" in row || "neg_color" in row) {
              setFolderInk({ fid: t[1], aff: row.aff_color ?? null, neg: row.neg_color ?? null });
            }
          }
          if (Date.now() - lastSendEdit.current < 1500) return;
          const next = (payload.new as { send_html?: string }).send_html ?? "";
          if (next !== sendHtmlRef.current) applyRemoteSend(next);
        }
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
      if (sendSaveTimer.current) clearTimeout(sendSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow?.folder_id, flowId]);

  const findByTrigger = (trigger: string) =>
    snippetsRef.current.find((s) => (s.shortcut ?? "").trim().toLowerCase() === trigger);

  // Flow slash: return the point tags (FlowGrid inserts them at the current indent;
  // it then calls onSlashBlock with the new cell ids to queue the Send doc).
  function resolveSlashPoints(trigger: string): string[] | null {
    const snip = findByTrigger(trigger);
    if (!snip) return null;
    const pts = snip.points ?? [];
    return pts.length ? pts.map((p) => p.tag) : [snip.label];
  }

  // Speech slash: just the Heading-4 tags as text (no Send doc queue).
  function resolveSlashText(trigger: string): string | null {
    const snip = findByTrigger(trigger);
    if (!snip) return null;
    const pts = snip.points ?? [];
    return pts.length ? pts.map((p) => p.tag).join("\n") : snip.label;
  }

  // Send doc slash: the block's HTML (centered H3 title + H4 points) spliced in place.
  function resolveSlashHtml(trigger: string): string | null {
    const snip = findByTrigger(trigger);
    return snip ? blockToHtml(snip.label, snip.points, snip.body) : null;
  }

  // Alt+←/→ switches between flows in the same folder. A popped-out pane window
  // keeps its "?pane=" mode across the switch (it stays a single-view window).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight") && siblings.length > 1) {
        e.preventDefault();
        const i = siblings.findIndex((f) => f.id === flowId);
        const next = siblings[(i + (e.key === "ArrowRight" ? 1 : -1) + siblings.length) % siblings.length];
        if (next && next.id !== flowId) router.push(`/flow/${next.id}${paneView ? `?pane=${paneView}` : ""}`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [siblings, flowId, router, paneView]);

  // "?" opens the keyboard-shortcut overlay (but not while you're typing).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "?") return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      setShowShortcuts((s) => !s);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Double-tap Shift toggles the command palette (Ctrl+K is hijacked by the browser
  // on the web). A "lone" Shift tap = Shift pressed and released with no other key
  // in between, so typing capitals never triggers it. Works while typing in a cell.
  useEffect(() => {
    let lastTap = 0;
    let other = false;   // another key was pressed during this Shift hold
    const down = (e: KeyboardEvent) => { other = e.key !== "Shift"; };
    const up = (e: KeyboardEvent) => {
      if (e.key !== "Shift") return;
      if (other) { other = false; return; }   // not a lone Shift tap
      const now = Date.now();
      if (now - lastTap < 400) { lastTap = 0; setShowPalette((s) => !s); }
      else lastTap = now;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  if (loading || !flow) {
    return (
      <div className="flow-loading">
        <div className="gh-loading-dots"><span /><span /><span /></div>
      </div>
    );
  }

  // Popped-out pane window: the whole window is this one view, full-bleed —
  // no header, tabs, timers, dock, or legend. Edits sync with the main window
  // over the same Realtime channels partners use. (flow-work--full reuses the
  // fullscreen chrome-hiding; the body class is set in the effect above.)
  if (paneView) {
    return (
      <div className="flow-work flow-work--full flow-work--pane">
        <div className="flow-pane__body flow-pane__body--pop">
          {paneView === "flow" && (
            <FlowGrid flowId={flowId} userId={userId} userName={userName} registerInsert={registerInsert} registerAddPoints={(fn) => { addPointsRef.current = fn; }} resolveSlashPoints={resolveSlashPoints} onSlashBlock={onSlashBlock} onCellsDeleted={onCellsDeleted} slashOptions={slashOptions} onSendPoints={sendPointsToSend} onReorder={onReorder} depthColors={paneInk(flowId)} />
          )}
          {paneView === "speech" && (
            <FlowSpeech flowId={flowId} initialBody={flow.speech_body} registerInsert={registerInsert} resolveSlashText={resolveSlashText} slashOptions={slashOptions} userId={userId} userName={userName} />
          )}
          {paneView === "send" && (
            <SendDoc html={sendHtml} version={sendVersion} onChange={handleSendChange} resolveSlashHtml={resolveSlashHtml} slashOptions={slashOptions} flowId={flowId} userId={userId} userName={userName} onReorderCards={reorderFlowFromDoc} />
          )}
          {paneView === "read" && (
            <ReadDocView sendHtml={sendHtml} timer={timerSnap} onCutCard={cutReadCard} />
          )}
        </div>
        {cutUndo && (
          <div className="flow-undo" role="status">
            <span>{cutUndo.label}</span>
            <button className="flow-undo__btn" onClick={undoCut}>Undo</button>
          </div>
        )}
      </div>
    );
  }

  // The outline navigator needs the solo Flow pane (it lives in the margin the
  // centered pane leaves free); only that pane's grid feeds it.
  const soloFlow = panes.length === 1 && panes[0].view === "flow";
  const tocMinDepth = tocItems.length ? Math.min(...tocItems.map((h) => h.depth)) : 0;

  // Everything reachable from the command palette (Ctrl/Cmd+K): views, splits,
  // tools, and a jump to any other flow in this folder. Views living in a
  // popped-out window are omitted — this window doesn't render them.
  // A view is "out" when it lives in another window — a fallback popup (popped)
  // or the floating PiP window (pipView). Out views render nowhere in here.
  const isOut = (v: ViewKind) => popped.has(v) || v === pipView;
  const inWindowViews = (["flow", "speech", "send", "read"] as ViewKind[]).filter((v) => !isOut(v));
  const paletteCommands: PaletteCommand[] = [
    ...(isOut("flow") ? [] : [{ trigger: "flow outline points", label: "Go to Flow", group: "View", run: () => setView("flow") }]),
    ...(isOut("speech") ? [] : [{ trigger: "speech write", label: "Go to Speech", group: "View", run: () => setView("speech") }]),
    ...(isOut("send") ? [] : [{ trigger: "send doc cards", label: "Go to Send doc", group: "View", run: () => setView("send") }]),
    ...(isOut("read") ? [] : [{ trigger: "read doc speech ready", label: "Go to Read doc", group: "View", run: () => setView("read") }]),
    ...(isOut("flow") ? [] : [{ trigger: "split add flow", label: "Split: add Flow", group: "Split", run: () => addPane("flow") }]),
    ...(isOut("speech") ? [] : [{ trigger: "split add speech", label: "Split: add Speech", group: "Split", run: () => addPane("speech") }]),
    ...(isOut("send") ? [] : [{ trigger: "split add send doc", label: "Split: add Send doc", group: "Split", run: () => addPane("send") }]),
    ...(isOut("read") ? [] : [{ trigger: "split add read doc", label: "Split: add Read doc", group: "Split", run: () => addPane("read") }]),
    { trigger: "timers clock prep speech", label: showTimers ? "Hide timers" : "Show timers", group: "Tools", run: () => setShowTimers(!showTimers) },
    ...(isApp && canPip && pip?.kind !== "timers" ? [{ trigger: "float timers mini window always on top pip", label: "Float timers", group: "Tools", run: () => { setShowTimersState(true); saveUi({ timers: true }); floatTimers(); } }] : []),
    { trigger: "speech timer start pause toggle clock", label: "Start/pause speech timer", group: "Tools", hint: "⌥S", run: () => toggleTimer("main") },
    { trigger: "pro prep timer start pause", label: "Start/pause Pro prep", group: "Tools", hint: "⌥P", run: () => toggleTimer("pro") },
    { trigger: "con prep timer start pause", label: "Start/pause Con prep", group: "Tools", hint: "⌥C", run: () => toggleTimer("con") },
    { trigger: "snapshot take freeze mark speech flow history", label: "Take flow snapshot", group: "Tools", run: () => snapNow("Snapshot") },
    { trigger: "snapshots history speech scrub view", label: "View flow snapshots", group: "Tools", run: () => setShowSnaps(true) },
    ...(flow.folder_id ? [{ trigger: "aff neg font colors folder ink", label: "Aff & neg colors", group: "Tools", run: () => setShowColors(true) }] : []),
    { trigger: "extensions blocks library panel", label: dock === "extensions" ? "Close Extensions" : "Open Extensions", group: "Tools", run: () => setDock(dock === "extensions" ? null : "extensions") },
    { trigger: "share collaborators invite partner", label: dock === "share" ? "Close Share" : "Open Share", group: "Tools", run: () => setDock(dock === "share" ? null : "share") },
    { trigger: "fullscreen focus", label: fullscreen ? "Exit fullscreen" : "Fullscreen", group: "Tools", run: () => setFullscreen((f) => !f) },
    { trigger: "keyboard shortcuts help", label: "Keyboard shortcuts", group: "Tools", hint: "?", run: () => setShowShortcuts(true) },
    { trigger: "export download docx word save flow speech send doc", label: "Export to .docx", group: "Tools", run: () => exportDocx() },
    { trigger: "extensions library manage full page", label: "Open Extensions library", group: "Tools", run: () => router.push("/flow/extensions") },
    ...siblings.flatMap((s) => s.id === flowId ? [] : [{
      trigger: `flow ${s.title}`, label: `Open flow: ${s.title}`, group: "Flows", run: () => router.push(`/flow/${s.id}`),
    }]),
    // Jump straight to a section heading in the flow (mirrors the outline panel).
    ...(soloFlow ? tocItems.map((h) => ({
      trigger: `heading section jump ${h.text}`, label: `Jump to: ${h.text || "Untitled heading"}`, group: "Outline", run: () => tocJump.current?.(h.id),
    })) : []),
  ];

  return (
    <div className={`flow-work ${fullscreen ? "flow-work--full" : ""}`}>
      <header className="flow-work__head">
        <h1 className="flow-work__title">{flow.title}</h1>
        {siblings.length > 1 && (
          <div className="flow-foldertabs" role="tablist" aria-label="Flows in this folder">
            {siblings.map((s) => (
              <button
                key={s.id}
                className={`flow-foldertab ${s.id === flowId ? "is-active" : ""}`}
                onClick={() => s.id !== flowId && router.push(`/flow/${s.id}`)}
                title={s.title}
              >
                {s.title}
              </button>
            ))}
          </div>
        )}
        <div className="flow-work__tabs" role="group" aria-label="View">
          {/* A popped-out view's tab doesn't render — it's back when its window closes. */}
          {inWindowViews.map((v) => (
            <span className="flow-tabwrap" key={v}>
              <button className={`flow-tab ${isViewShown(v) ? "is-active" : ""}`} onClick={() => setView(v)}>{VIEW_LABELS[v]}</button>
              {/* Installed app only: hover a tab to pop that view into its own window. */}
              {isApp && (
                <button className="flow-tab__pop" onClick={() => popOut(v)} title={`Open ${VIEW_LABELS[v]} in its own window`} aria-label={`Pop out ${VIEW_LABELS[v]}`}>
                  <SquareArrowOutUpRight size={10} />
                </button>
              )}
            </span>
          ))}
          <button
            className={`flow-tab flow-tab--split ${menu?.kind === "split" ? "is-active" : ""}`}
            onClick={(e) => openMenu("split", e)}
            title="Open another view or flow side-by-side"
            aria-label="Split view"
          ><Columns2 size={15} /></button>
        </div>
        <div className="flow-work__actions">
          <SyncStatus />
          <button
            className={`flow-pill flow-pill--icon ${menu?.kind === "more" || dock || showTimers ? "is-active" : ""}`}
            onClick={(e) => openMenu("more", e)}
            title="Tools & panels"
            aria-label="Tools and panels"
          ><Ellipsis size={15} /></button>
        </div>
      </header>

      {showTimers && pip?.kind !== "timers" && (
        <FlowTimers flowId={flowId} onState={setTimerSnap} registerControls={registerTimerControls} onFloat={isApp && canPip ? floatTimers : undefined} />
      )}
      {/* The floating always-on-top window: the timer strip, or one popped-out
          view — same live components, portaled across. */}
      {pip && createPortal(
        pip.kind === "timers" ? (
          <div className="flow-shell flow-pip flow-pip--timers">
            <FlowTimers flowId={flowId} onState={setTimerSnap} registerControls={registerTimerControls} />
          </div>
        ) : (
          <div className="flow-shell flow-pip flow-pip--pane">
            <div className="flow-pane__body flow-pane__body--pop">
              {pip.kind === "flow" && (
                <FlowGrid flowId={flowId} userId={userId} userName={userName} registerInsert={registerInsert} registerAddPoints={(fn) => { addPointsRef.current = fn; }} resolveSlashPoints={resolveSlashPoints} onSlashBlock={onSlashBlock} onCellsDeleted={onCellsDeleted} slashOptions={slashOptions} onSendPoints={sendPointsToSend} onReorder={onReorder} depthColors={paneInk(flowId)} />
              )}
              {pip.kind === "speech" && (
                <FlowSpeech flowId={flowId} initialBody={flow.speech_body} registerInsert={registerInsert} resolveSlashText={resolveSlashText} slashOptions={slashOptions} userId={userId} userName={userName} />
              )}
              {pip.kind === "send" && (
                <SendDoc html={sendHtml} version={sendVersion} onChange={handleSendChange} resolveSlashHtml={resolveSlashHtml} slashOptions={slashOptions} flowId={flowId} userId={userId} userName={userName} onReorderCards={reorderFlowFromDoc} />
              )}
              {pip.kind === "read" && (
                <ReadDocView sendHtml={sendHtml} timer={timerSnap} onCutCard={cutReadCard} />
              )}
            </div>
          </div>
        ),
        pip.win.document.body,
      )}

      <div className="flow-work__body">
        {/* Outline navigator: the flow's "# " headings, clickable, overlaid on
            the grey gutter the centered solo pane leaves free (an overlay, so
            appearing never shifts the flow). Hidden in splits and with the dock
            open (no gutter) and on narrow screens (CSS) — the toolbar's Outline
            dropdown covers those. */}
        {soloFlow && !dock && tocItems.length > 0 && (
          <nav className="flow-toc" aria-label="Flow outline">
            <div className="flow-toc__title">Outline</div>
            {tocItems.map((h) => (
              <button
                key={h.id}
                className={`flow-toc__item ${tocActive === h.id ? "is-active" : ""}`}
                style={{ paddingLeft: 10 + Math.min(h.depth - tocMinDepth, 4) * 12 }}
                onClick={() => tocJump.current?.(h.id)}
                title={h.text || "Untitled heading"}
              >
                {h.text || "Untitled"}
              </button>
            ))}
          </nav>
        )}
        <div className="flow-work__panes">
          {panes.map((pane, i) => {
            const title =
              pane.view === "speech" ? "Speech" :
              pane.view === "send" ? "Send doc" :
              pane.view === "read" ? "Read doc" :
              (pane.flowId === flowId ? flow.title : siblings.find((s) => s.id === pane.flowId)?.title ?? "Flow");
            return (
              <Fragment key={pane.key}>
              {i > 0 && (
                <div
                  className="flow-pane__resizer"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize panes"
                  onPointerDown={(e) => startResize(e, panes[i - 1].key, pane.key)}
                />
              )}
              <section className={`flow-pane ${panes.length === 1 ? "flow-pane--solo" : ""}`} data-view={pane.view} style={{ flexGrow: panes.length === 1 ? undefined : (flexes[pane.key] ?? 1) }}>
                {panes.length > 1 && (
                  <div className="flow-pane__head">
                    <span className="flow-pane__title" title={title}>{title}</span>
                    <button className="flow-pane__close" onClick={() => closePane(pane.key)} aria-label="Close pane" title="Close pane"><X size={15} /></button>
                  </div>
                )}
                <div className="flow-pane__body">
                  {pane.view === "flow" && (
                    <FlowGrid flowId={pane.flowId} userId={userId} userName={userName} registerInsert={registerInsert} registerAddPoints={(fn) => { addPointsRef.current = fn; }} resolveSlashPoints={resolveSlashPoints} onSlashBlock={onSlashBlock} onCellsDeleted={onCellsDeleted} slashOptions={slashOptions} onSendPoints={sendPointsToSend} onReorder={onReorder} depthColors={paneInk(pane.flowId)} onTocItems={soloFlow ? handleTocItems : undefined} onTocActive={soloFlow ? handleTocActive : undefined} registerTocJump={soloFlow ? registerTocJump : undefined} />
                  )}
                  {pane.view === "speech" && (
                    <FlowSpeech flowId={flowId} initialBody={flow.speech_body} registerInsert={registerInsert} resolveSlashText={resolveSlashText} slashOptions={slashOptions} userId={userId} userName={userName} />
                  )}
                  {pane.view === "send" && (
                    <SendDoc html={sendHtml} version={sendVersion} onChange={handleSendChange} resolveSlashHtml={resolveSlashHtml} slashOptions={slashOptions} flowId={flowId} userId={userId} userName={userName} onReorderCards={reorderFlowFromDoc} />
                  )}
                  {pane.view === "read" && (
                    <ReadDocView sendHtml={sendHtml} timer={timerSnap} onCutCard={cutReadCard} />
                  )}
                </div>
              </section>
              </Fragment>
            );
          })}
        </div>

        {dock && (
          <FlowDock
            tab={dock}
            onTab={setDock}
            onClose={() => setDock(null)}
            userId={userId}
            onUse={runExtension}
            snippets={snippets}
            setSnippets={setSnippets}
            flowId={flowId}
            ownerId={flow.owner_id}
          />
        )}
      </div>

      {menu && (
        <>
          <div className="flow-menu__scrim" onClick={() => setMenu(null)} role="presentation" />
          <div
            className="flow-menu"
            style={menu.kind === "more"
              ? { top: menu.rect.bottom + 6, left: menu.rect.right, transform: "translateX(-100%)" }
              : { top: menu.rect.bottom + 6, left: menu.rect.left }}
            role="menu"
          >
            {menu.kind === "split" ? (
              <>
                <div className="flow-menu__label">Add view</div>
                {/* Views living in a popped-out window can't be added here too. */}
                {inWindowViews.map((v) => (
                  <button key={v} className="flow-menu__item" role="menuitem" onClick={() => { addPane(v); setMenu(null); }}>{VIEW_LABELS[v]}</button>
                ))}
                {siblings.filter((s) => !panes.some((p) => p.view === "flow" && p.flowId === s.id)).length > 0 && (
                  <>
                    <div className="flow-menu__label">Add flow</div>
                    {siblings.filter((s) => !panes.some((p) => p.view === "flow" && p.flowId === s.id)).map((s) => (
                      <button key={s.id} className="flow-menu__item" role="menuitem" onClick={() => { addPane("flow", s.id); setMenu(null); }} title={s.title}>{s.title}</button>
                    ))}
                  </>
                )}
              </>
            ) : (
              <>
                <button className={`flow-menu__item ${dock === "extensions" ? "is-on" : ""}`} role="menuitem" onClick={() => { setDock(dock === "extensions" ? null : "extensions"); setMenu(null); }}>
                  <span>Extensions</span>{dock === "extensions" && <span className="flow-menu__check">✓</span>}
                </button>
                <button className={`flow-menu__item ${dock === "share" ? "is-on" : ""}`} role="menuitem" onClick={() => { setDock(dock === "share" ? null : "share"); setMenu(null); }}>
                  <span>Share</span>{dock === "share" && <span className="flow-menu__check">✓</span>}
                </button>
                <button className={`flow-menu__item ${showTimers ? "is-on" : ""}`} role="menuitem" onClick={() => { setShowTimers(!showTimers); setMenu(null); }}>
                  <span>Timers</span>{showTimers && <span className="flow-menu__check">✓</span>}
                </button>
                <button className="flow-menu__item" role="menuitem" onClick={() => { setShowSnaps(true); setMenu(null); }}>
                  <span>Flow snapshots</span>
                </button>
                {flow.folder_id && (
                  <button className="flow-menu__item" role="menuitem" onClick={() => { setShowColors(true); setMenu(null); }}>
                    <span>Aff &amp; neg colors</span>
                  </button>
                )}
                <div className="flow-menu__sep" />
                <button className="flow-menu__item" role="menuitem" onClick={() => { setShowPalette(true); setMenu(null); }}>
                  <span>Command palette</span><span className="flow-menu__kbd">⇧⇧</span>
                </button>
                <button className="flow-menu__item" role="menuitem" onClick={() => { setFullscreen((f) => !f); setMenu(null); }}>
                  {fullscreen ? "Exit fullscreen" : "Fullscreen"}
                </button>
                <button className="flow-menu__item" role="menuitem" onClick={() => { setShowShortcuts(true); setMenu(null); }}>
                  <span>Keyboard shortcuts</span><span className="flow-menu__kbd">?</span>
                </button>
                <button className="flow-menu__item" role="menuitem" onClick={() => { exportDocx(); setMenu(null); }}>
                  <span>Export to .docx</span>
                </button>
              </>
            )}
          </div>
        </>
      )}

      {showShortcuts && <FlowShortcuts onClose={() => setShowShortcuts(false)} />}

      {showPalette && <FlowPalette commands={paletteCommands} onClose={() => setShowPalette(false)} />}

      {showSnaps && <FlowSnapshots flowId={flowId} onClose={() => setShowSnaps(false)} />}

      {showColors && (
        <FolderColors
          aff={activeInk?.aff ?? null}
          neg={activeInk?.neg ?? null}
          supported={colorsOk}
          onSave={saveFolderInk}
          onClose={() => setShowColors(false)}
        />
      )}

      {/* Persistent shortcut legend — quick-navigate hints, like the reference.
          Solo pane only: in a split the left pane's bottom corner is real content
          (and its slash dropdown), so the legend would sit on top of it. */}
      {panes.length === 1 && (
      <ul className="flow-legend" aria-hidden>
        <li><kbd>⇧⇧</kbd> palette</li>
        <li><kbd>?</kbd> shortcuts</li>
        <li><kbd>⌥ ←→</kbd> switch flow</li>
        <li><kbd>⌥ S·P·C</kbd> timers</li>
        <li><kbd>⌃F</kbd> find</li>
        <li><kbd>⇧ ↑↓</kbd> move point</li>
        <li><kbd>⇥</kbd> indent</li>
        <li><kbd># ␣</kbd> heading</li>
      </ul>
      )}

      {cutUndo && (
        <div className="flow-undo" role="status">
          <span>{cutUndo.label}</span>
          <button className="flow-undo__btn" onClick={undoCut}>Undo</button>
        </div>
      )}

      {snapToast && !cutUndo && (
        <div className="flow-undo" role="status">
          <span>{snapToast}</span>
        </div>
      )}
    </div>
  );
}
