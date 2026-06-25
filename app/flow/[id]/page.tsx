"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { blockToHtml, cardHtml } from "@/lib/richText";
import FlowGrid from "@/app/components/flow/FlowGrid";
import FlowSpeech from "@/app/components/flow/FlowSpeech";
import SendDoc from "@/app/components/flow/SendDoc";
import ReadDocView from "@/app/components/flow/ReadDocView";
import FlowTimers, { type TimerSnap } from "@/app/components/flow/FlowTimers";
import FlowDock from "@/app/components/flow/FlowDock";
import FlowShortcuts from "@/app/components/flow/FlowShortcuts";
import FlowPalette, { type PaletteCommand } from "@/app/components/flow/FlowPalette";
import { Columns2, Ellipsis, X } from "lucide-react";
import type { EditorInsert, Flow, FlowSnippet, FlowCell, SlashOption } from "@/app/flow/shared";

const SNIP_SEL = "id, owner_id, label, body, points, shortcut, parent_id, created_at";
type Sibling = { id: string; title: string; folder_id: string | null };
type ViewKind = "flow" | "speech" | "send" | "read";
type DockTab = "extensions" | "share";
type Pane = { key: string; view: ViewKind; flowId: string };

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
  // Toggle helpers that also remember the choice for next time.
  const setDock = (d: DockTab | null) => { setDockState(d); saveUi({ dock: d }); };
  const setShowTimers = (v: boolean) => { setShowTimersState(v); saveUi({ timers: v }); };
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
  useEffect(() => {
    const specs = panes.map((p) => ({ view: p.view, flowId: p.flowId }));
    const widths = panes.map((p) => flexesRef.current[p.key] ?? 1);
    const patch: Partial<SavedUi> = { layout: specs, layoutFlow: flowId, widths };
    if (panes.length >= 2) { patch.split = specs; patch.splitWidths = widths; patch.splitFlow = flowId; }
    saveUi(patch);
  }, [panes, flowId]);

  // Fullscreen workspace: hide the site nav/rail so panes fill the whole screen.
  useEffect(() => {
    document.body.classList.toggle("flow-work-full", fullscreen);
    return () => document.body.classList.remove("flow-work-full");
  }, [fullscreen]);

  // Clear the pending undo timer if the workspace unmounts.
  useEffect(() => () => { if (cutUndoTimer.current) clearTimeout(cutUndoTimer.current); }, []);

  // --- View / split controls ---
  // A tab brings its view on screen. If that view belonged to your last split, the
  // whole split is rebuilt (so clicking away to Speech and back to Flow restores a
  // Flow + Send doc split); otherwise it's a single pane for the URL flow.
  function setView(view: ViewKind) {
    if (panes.some((p) => p.view === view)) return;   // already on screen — don't churn the panes
    const ui = loadUi();
    if (ui.split.length >= 2 && ui.split.some((s) => s.view === view)) {
      const r = specsToPanes(ui.split, ui.splitWidths, ui.splitFlow, flowId);
      setPanes(r.panes); setFlexes(r.flexes);
      return;
    }
    setFlexes({});
    if (view === "flow") {
      const restore = savedFlowPanesRef.current.length ? savedFlowPanesRef.current : [{ key: `p${paneSeq.current++}`, view: "flow" as ViewKind, flowId }];
      setPanes(restore);
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
  async function saveSend(html: string) {
    const t = sendTarget();
    if (!t) return;
    // Must await: a PostgREST builder only sends its request when it's then()'d.
    const { error } = await supabase.from(t[0]).update({ send_html: html }).eq("id", t[1]);
    if (error) console.error("Send doc save failed:", error.message);
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
      const { error } = await supabase.from("flow_cells").delete().in("id", idList);
      if (error) console.error("Cut flow points failed:", error.message);
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
      }));
      supabase.from("flow_cells").insert(restore).then(({ error }) => {
        if (error) console.error("Undo cut failed:", error.message);
      });
    }
  }

  // Flow points were dragged into a new order — reflow the Send doc cards to match.
  function onReorder(orderedIds: string[]) {
    const next = reorderSendDoc(sendHtmlRef.current, orderedIds);
    if (next !== sendHtmlRef.current) commitSend(next, true);
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
      const base = supabase.from("flows").select("id, title, folder_id").order("created_at", { ascending: true });
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

  // Alt+←/→ switches between flows in the same folder.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight") && siblings.length > 1) {
        e.preventDefault();
        const i = siblings.findIndex((f) => f.id === flowId);
        const next = siblings[(i + (e.key === "ArrowRight" ? 1 : -1) + siblings.length) % siblings.length];
        if (next && next.id !== flowId) router.push(`/flow/${next.id}`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [siblings, flowId, router]);

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

  // Everything reachable from the command palette (Ctrl/Cmd+K): views, splits,
  // tools, and a jump to any other flow in this folder.
  const paletteCommands: PaletteCommand[] = [
    { trigger: "flow outline points", label: "Go to Flow", group: "View", run: () => setView("flow") },
    { trigger: "speech write", label: "Go to Speech", group: "View", run: () => setView("speech") },
    { trigger: "send doc cards", label: "Go to Send doc", group: "View", run: () => setView("send") },
    { trigger: "read doc speech ready", label: "Go to Read doc", group: "View", run: () => setView("read") },
    { trigger: "split add flow", label: "Split: add Flow", group: "Split", run: () => addPane("flow") },
    { trigger: "split add speech", label: "Split: add Speech", group: "Split", run: () => addPane("speech") },
    { trigger: "split add send doc", label: "Split: add Send doc", group: "Split", run: () => addPane("send") },
    { trigger: "split add read doc", label: "Split: add Read doc", group: "Split", run: () => addPane("read") },
    { trigger: "timers clock prep speech", label: showTimers ? "Hide timers" : "Show timers", group: "Tools", run: () => setShowTimers(!showTimers) },
    { trigger: "extensions blocks library panel", label: dock === "extensions" ? "Close Extensions" : "Open Extensions", group: "Tools", run: () => setDock(dock === "extensions" ? null : "extensions") },
    { trigger: "share collaborators invite partner", label: dock === "share" ? "Close Share" : "Open Share", group: "Tools", run: () => setDock(dock === "share" ? null : "share") },
    { trigger: "fullscreen focus", label: fullscreen ? "Exit fullscreen" : "Fullscreen", group: "Tools", run: () => setFullscreen((f) => !f) },
    { trigger: "keyboard shortcuts help", label: "Keyboard shortcuts", group: "Tools", hint: "?", run: () => setShowShortcuts(true) },
    { trigger: "export download docx word save flow speech send doc", label: "Export to .docx", group: "Tools", run: () => exportDocx() },
    { trigger: "extensions library manage full page", label: "Open Extensions library", group: "Tools", run: () => router.push("/flow/extensions") },
    ...siblings.flatMap((s) => s.id === flowId ? [] : [{
      trigger: `flow ${s.title}`, label: `Open flow: ${s.title}`, group: "Flows", run: () => router.push(`/flow/${s.id}`),
    }]),
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
          <button className={`flow-tab ${isViewShown("flow") ? "is-active" : ""}`} onClick={() => setView("flow")}>Flow</button>
          <button className={`flow-tab ${isViewShown("speech") ? "is-active" : ""}`} onClick={() => setView("speech")}>Speech</button>
          <button className={`flow-tab ${isViewShown("send") ? "is-active" : ""}`} onClick={() => setView("send")}>Send doc</button>
          <button className={`flow-tab ${isViewShown("read") ? "is-active" : ""}`} onClick={() => setView("read")}>Read doc</button>
          <button
            className={`flow-tab flow-tab--split ${menu?.kind === "split" ? "is-active" : ""}`}
            onClick={(e) => openMenu("split", e)}
            title="Open another view or flow side-by-side"
            aria-label="Split view"
          ><Columns2 size={15} /></button>
        </div>
        <div className="flow-work__actions">
          <button
            className={`flow-pill flow-pill--icon ${menu?.kind === "more" || dock || showTimers ? "is-active" : ""}`}
            onClick={(e) => openMenu("more", e)}
            title="Tools & panels"
            aria-label="Tools and panels"
          ><Ellipsis size={15} /></button>
        </div>
      </header>

      {showTimers && <FlowTimers flowId={flowId} onState={setTimerSnap} />}

      <div className="flow-work__body">
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
                    <FlowGrid flowId={pane.flowId} userId={userId} userName={userName} registerInsert={registerInsert} registerAddPoints={(fn) => { addPointsRef.current = fn; }} resolveSlashPoints={resolveSlashPoints} onSlashBlock={onSlashBlock} onCellsDeleted={onCellsDeleted} slashOptions={slashOptions} onSendPoints={sendPointsToSend} onReorder={onReorder} />
                  )}
                  {pane.view === "speech" && (
                    <FlowSpeech flowId={flowId} initialBody={flow.speech_body} registerInsert={registerInsert} resolveSlashText={resolveSlashText} slashOptions={slashOptions} userId={userId} userName={userName} />
                  )}
                  {pane.view === "send" && (
                    <SendDoc html={sendHtml} version={sendVersion} onChange={handleSendChange} resolveSlashHtml={resolveSlashHtml} slashOptions={slashOptions} flowId={flowId} userId={userId} userName={userName} />
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
                <button className="flow-menu__item" role="menuitem" onClick={() => { addPane("flow"); setMenu(null); }}>Flow</button>
                <button className="flow-menu__item" role="menuitem" onClick={() => { addPane("speech"); setMenu(null); }}>Speech</button>
                <button className="flow-menu__item" role="menuitem" onClick={() => { addPane("send"); setMenu(null); }}>Send doc</button>
                <button className="flow-menu__item" role="menuitem" onClick={() => { addPane("read"); setMenu(null); }}>Read doc</button>
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

      {/* Persistent shortcut legend — quick-navigate hints, like the reference. */}
      <ul className="flow-legend" aria-hidden>
        <li><kbd>⇧⇧</kbd> palette</li>
        <li><kbd>?</kbd> shortcuts</li>
        <li><kbd>⌥ ←→</kbd> switch flow</li>
        <li><kbd>⇥</kbd> indent</li>
      </ul>

      {cutUndo && (
        <div className="flow-undo" role="status">
          <span>{cutUndo.label}</span>
          <button className="flow-undo__btn" onClick={undoCut}>Undo</button>
        </div>
      )}
    </div>
  );
}
