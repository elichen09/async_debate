"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fuzzyRank } from "@/lib/fuzzy";
import { GripVertical, ChevronRight, ChevronDown, Flag, ListPlus, IndentDecrease, IndentIncrease, Highlighter, AlertTriangle, X, Trash2, EyeOff, Eye } from "lucide-react";
import { useConfirm } from "@/app/components/flow/ConfirmProvider";
import { FLOW_DRAG_MIME, FLOW_DEPTH_COLORS, type FlowCell, type EditorInsert, type FlowDragPayload } from "@/app/flow/shared";

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A short, stable color per collaborator (keyed off their user id) for presence.
const PRESENCE_COLORS = ["#e0704f", "#6f9bea", "#5fbf8f", "#c98bdb", "#e0b84f", "#5fc7d6"];
function colorFor(uid: string): string {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return PRESENCE_COLORS[h % PRESENCE_COLORS.length];
}
// A broadcast cursor message: who's editing which point right now.
type CursorMsg = { uid: string; name: string; color: string; cellId: string | null };
type RemoteEditor = { uid: string; name: string; color: string };
const PRESENCE_TTL = 6000;     // drop a collaborator if we haven't heard from them in 6s
const PRESENCE_BEAT = 2000;    // re-announce our point every 2s
const nowMs = () => Date.now();

interface FlowGridProps {
  flowId: string;
  userId: string;
  userName?: string;          // shown to collaborators on the point you're editing
  registerInsert: (fn: EditorInsert | null) => void;
  registerAddPoints?: (fn: ((tags: string[]) => void) | null) => void;
  // Returns the point tags for a "/trigger" (or null). Does NOT queue the Send doc;
  // onSlashBlock does that once the new cells (and their ids) exist.
  resolveSlashPoints?: (trigger: string) => string[] | null;
  // After a "/trigger" inserts its points, queue the block into the Send doc tagged
  // with the cell ids it created (so deleting a point can remove its card).
  // afterIds = the flow points following the insertion, so the Send doc can place
  // the new block before the first of those that already has a card (matching order).
  onSlashBlock?: (trigger: string, cellIds: string[], afterIds: string[]) => void;
  // Cells were deleted — drop any Send doc cards tied to them.
  onCellsDeleted?: (cellIds: string[]) => void;
  // Available "/trigger" options, for the slash autocomplete dropdown.
  slashOptions?: { trigger: string; label: string }[];
  // Send one or more flow points to the Send doc as Heading-4 cards (via "/send").
  onSendPoints?: (cells: { id: string; content: string }[]) => void;
  // Points were reordered (drag) — reflow the Send doc cards to match this order.
  onReorder?: (orderedCellIds: string[]) => void;
}

const SEL = "id, flow_id, col, row_index, depth, highlighted, content, status, updated_by, updated_at";
const INDENT = 26; // px per outline level

// Flag — the one status mark. Set manually (⚑ button) or with "/flag".
const FLAG_COLOR = "#ef6f6f";

function toAlpha(n: number): string {
  let s = "";
  while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}
function toRoman(n: number): string {
  const map: [number, string][] = [[1000,"m"],[900,"cm"],[500,"d"],[400,"cd"],[100,"c"],[90,"xc"],[50,"l"],[40,"xl"],[10,"x"],[9,"ix"],[5,"v"],[4,"iv"],[1,"i"]];
  let r = "";
  for (const [v, s] of map) while (n >= v) { r += s; n -= v; }
  return r;
}
// Numbering cycles by depth: 1. / a. / i. / 1. / a. / i. …
function nodeLabel(count: number, depth: number): string {
  const k = depth % 3;
  if (k === 0) return `${count}.`;
  if (k === 1) return `${toAlpha(count)}.`;
  return `${toRoman(count)}.`;
}

// A debate flow as a nested outline: Enter adds a sibling point, Tab indents it
// into a response, Shift+Tab outdents, and highlighting marks key cards. Numbers
// and colors alternate by depth. Edits persist on blur and stream via Realtime.
export default function FlowGrid({ flowId, userId, userName = "Partner", registerInsert, registerAddPoints, resolveSlashPoints, onSlashBlock, onCellsDeleted, slashOptions = [], onSendPoints, onReorder }: FlowGridProps) {
  const confirm = useConfirm();
  const [cells, setCells] = useState<FlowCell[]>([]);
  const [loadError, setLoadError] = useState("");
  const cellsRef = useRef<FlowCell[]>([]);
  const editingId = useRef<string | null>(null);
  const activeEl = useRef<HTMLTextAreaElement | null>(null);
  const focusId = useRef<string | null>(null);
  // Per-cell pending autosaves (debounced); flushed on unmount so switching tabs
  // mid-type never drops what you wrote.
  const pending = useRef<Map<string, string>>(new Map());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Multi-line selection (click a number / Shift-click a range) for copy/paste.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchorRef = useRef<string | null>(null);
  // Drag across the numbers to select a range; the click that ends the drag is skipped.
  const selDrag = useRef<{ anchor: string; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  // Points hidden from view to declutter (not persisted — a focus aid, like collapse).
  const [hiddenPts, setHiddenPts] = useState<Set<string>>(new Set());
  // Collapsed subtrees (local view state), status filter, and drag-reorder.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const [extDrop, setExtDrop] = useState(false);   // a point from another pane is hovering this flow
  // Slash autocomplete: which cell is typing a "/trigger" and the partial text.
  const [slash, setSlash] = useState<{ id: string; query: string } | null>(null);
  const [slashActive, setSlashActive] = useState(0);
  // Live presence: which cell each collaborator is editing (cellId -> editors).
  const [remoteEditors, setRemoteEditors] = useState<Record<string, RemoteEditor[]>>({});
  const presenceRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const subscribedRef = useRef(false);
  const selfNameRef = useRef(userName);     // latest name, read by each heartbeat
  const currentCellRef = useRef<string | null>(null);
  // uid -> last-known {cell, name, color, when}. Pruned by TTL so a partner that
  // navigates away (or disconnects) clears even if we miss their "leave".
  const editorsRef = useRef<Map<string, { cellId: string; name: string; color: string; ts: number }>>(new Map());
  const editorsSigRef = useRef("");          // last rendered presence signature, to skip no-op re-renders
  useEffect(() => { selfNameRef.current = userName; }, [userName]);

  // End a number drag-select on pointer-up anywhere; flag it so the trailing click
  // (which would otherwise toggle the last number) is ignored.
  useEffect(() => {
    const onUp = () => {
      if (selDrag.current?.moved) suppressClick.current = true;
      selDrag.current = null;
    };
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, []);

  useEffect(() => { cellsRef.current = cells; }, [cells]);

  // Flush any queued saves when the component unmounts (e.g. tab switch). `pending`
  // is the same Map throughout the component's life, so capturing it here is safe.
  useEffect(() => {
    const pend = pending.current;
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      for (const [id, content] of pend) {
        // .then() so the request is actually sent (an un-awaited builder never fires).
        supabase.from("flow_cells").update({ content, updated_by: userId, updated_at: new Date().toISOString() }).eq("id", id).then(() => {});
      }
      pend.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    supabase
      .from("flow_cells")
      .select(SEL)
      .eq("flow_id", flowId)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) { setLoadError(error.message); return; }
        if (data) setCells(data as FlowCell[]);
      });

    const channel = supabase
      .channel(`flow_cells:${flowId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "flow_cells", filter: `flow_id=eq.${flowId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as { id: string };
            setCells((prev) => prev.filter((c) => c.id !== old.id));
            return;
          }
          const row = payload.new as FlowCell;
          if (row.id === editingId.current) return;
          setCells((prev) => {
            const i = prev.findIndex((c) => c.id === row.id);
            if (i === -1) return [...prev, row];
            const next = prev.slice();
            next[i] = row;
            return next;
          });
        }
      )
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [flowId]);

  // Rebuild the cellId -> editors map from what we've heard, dropping anyone whose
  // last heartbeat is older than the TTL.
  function rebuildEditors() {
    const cutoff = nowMs() - PRESENCE_TTL;
    const map: Record<string, RemoteEditor[]> = {};
    for (const [uid, e] of editorsRef.current) {
      if (e.ts < cutoff) { editorsRef.current.delete(uid); continue; }
      (map[e.cellId] ||= []).push({ uid, name: e.name, color: e.color });
    }
    // Skip the state update (and the re-render it triggers) when nothing changed,
    // so the 2s heartbeat doesn't re-run every textarea's auto-grow and jolt scroll.
    const sig = Object.keys(map).sort().map((k) => `${k}:${map[k].map((e) => e.uid).sort().join(",")}`).join("|");
    if (sig === editorsSigRef.current) return;
    editorsSigRef.current = sig;
    setRemoteEditors(map);
  }

  // Broadcast which point we're on right now (read fresh from refs).
  function sendCursor() {
    if (!subscribedRef.current) return;
    presenceRef.current?.send({
      type: "broadcast",
      event: "cursor",
      payload: { uid: userId, name: selfNameRef.current, color: colorFor(userId), cellId: currentCellRef.current } as CursorMsg,
    });
  }

  // Live presence via Realtime BROADCAST + heartbeat (more reliable here than
  // presence-tracking): announce our point on focus and every couple seconds; a
  // partner's badge expires by TTL if their heartbeats stop. Nothing persisted.
  useEffect(() => {
    if (!userId) return;
    const editors = editorsRef.current;        // stable Map instance, safe to use in cleanup
    const ch = supabase.channel(`flow_presence:${flowId}`);
    ch.on("broadcast", { event: "cursor" }, ({ payload }) => {
      const p = payload as CursorMsg;
      if (!p || p.uid === userId) return;        // ignore our own echo
      if (!p.cellId) editorsRef.current.delete(p.uid);
      else editorsRef.current.set(p.uid, { cellId: p.cellId, name: p.name, color: p.color, ts: nowMs() });
      rebuildEditors();
    });
    ch.subscribe((status) => { if (status === "SUBSCRIBED") { subscribedRef.current = true; sendCursor(); } });
    presenceRef.current = ch;
    const beat = setInterval(() => { sendCursor(); rebuildEditors(); }, PRESENCE_BEAT);
    return () => {
      clearInterval(beat);
      subscribedRef.current = false;
      // Tell everyone we're gone, then drop the channel.
      ch.send({ type: "broadcast", event: "cursor", payload: { uid: userId, name: selfNameRef.current, color: colorFor(userId), cellId: null } as CursorMsg });
      presenceRef.current = null;
      editors.clear();
      setRemoteEditors({});
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId, userId]);

  // Tell collaborators which point we're on (null when we leave the editor).
  function trackCell(cellId: string | null) {
    currentCellRef.current = cellId;
    sendCursor();
  }

  const sorted = () => [...cellsRef.current].sort((a, b) => a.row_index - b.row_index);

  function setLocal(id: string, patch: Partial<FlowCell>) {
    setCells((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function saveContent(id: string, content: string) {
    pending.current.delete(id);
    await supabase.from("flow_cells").update({ content, updated_by: userId, updated_at: new Date().toISOString() }).eq("id", id);
  }

  // Throttled autosave while typing (flush every ~250ms), so a partner sees edits
  // stream in — not only after you pause.
  function scheduleSave(id: string, content: string) {
    pending.current.set(id, content);
    if (saveTimer.current) return;
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const batch = Array.from(pending.current.entries());
      pending.current.clear();
      for (const [cid, c] of batch) saveContent(cid, c);
    }, 250);
  }
  async function saveMeta(id: string, patch: { depth?: number; highlighted?: boolean; status?: string | null }) {
    await supabase.from("flow_cells").update({ ...patch, updated_by: userId, updated_at: new Date().toISOString() }).eq("id", id);
  }

  function setStatus(id: string, status: string | null) {
    setLocal(id, { status });
    saveMeta(id, { status });
  }
  // A point's id plus all of its deeper descendants (the subtree under it).
  function subtreeIds(id: string): string[] {
    const list = sorted();
    const i = list.findIndex((c) => c.id === id);
    if (i < 0) return [id];
    const out = [id];
    for (let j = i + 1; j < list.length && list[j].depth > list[i].depth; j++) out.push(list[j].id);
    return out;
  }
  // Flagging a point flags its whole subtree (sub-points) too; unflag clears them.
  function toggleFlag(cell: FlowCell) {
    const v = cell.status === "flag" ? null : "flag";
    for (const id of subtreeIds(cell.id)) setStatus(id, v);
  }

  async function insertNode(row: number, depth: number, content = "", focus = true): Promise<string | null> {
    const { data } = await supabase
      .from("flow_cells")
      .insert({ flow_id: flowId, col: 0, row_index: row, depth, content, updated_by: userId })
      .select(SEL)
      .single();
    if (data) {
      if (focus) focusId.current = (data as FlowCell).id;
      setCells((prev) => (prev.some((c) => c.id === data.id) ? prev : [...prev, data as FlowCell]));
      return (data as FlowCell).id;
    }
    return null;
  }

  // Insert an extension's tags as responses at the current point: the first tag
  // fills this point, the rest follow as siblings at the SAME indent (depth).
  // Returns the ids of every cell it filled/created, in tag order.
  async function insertBlock(cell: FlowCell, tags: string[]): Promise<string[]> {
    if (!tags.length) return [];
    setLocal(cell.id, { content: tags[0] });
    saveContent(cell.id, tags[0]);
    const ids = [cell.id];
    const list = sorted();
    const idx = list.findIndex((c) => c.id === cell.id);
    const next = list[idx + 1];
    const lo = cell.row_index;
    const hi = next ? next.row_index : cell.row_index + 1;
    const rest = tags.slice(1);
    for (let i = 0; i < rest.length; i++) {
      const row = lo + ((hi - lo) * (i + 1)) / (rest.length + 1);
      const id = await insertNode(row, cell.depth, rest[i], false);
      if (id) ids.push(id);
    }
    return ids;
  }

  // Append a batch of points (e.g. an extension's Heading-4 tags) at the bottom.
  async function addPoints(tags: string[]) {
    let row = cellsRef.current.length ? Math.max(...cellsRef.current.map((c) => c.row_index)) : -1;
    for (const tag of tags) {
      row += 1;
      await insertNode(row, 0, tag, false);
    }
  }

  // Expose addPoints to the workspace (for inserting extensions into the flow).
  useEffect(() => {
    registerAddPoints?.(addPoints);
    return () => registerAddPoints?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId]);

  // Enter: new sibling right below, at the same depth.
  function addSibling(cell: FlowCell) {
    const list = sorted();
    const idx = list.findIndex((c) => c.id === cell.id);
    const next = list[idx + 1];
    const row = next ? (cell.row_index + next.row_index) / 2 : cell.row_index + 1;
    insertNode(row, cell.depth);
  }

  // Add a sub-point nested one level inside this point.
  function addChild(cell: FlowCell) {
    const list = sorted();
    const idx = list.findIndex((c) => c.id === cell.id);
    const next = list[idx + 1];
    const row = next ? (cell.row_index + next.row_index) / 2 : cell.row_index + 1;
    insertNode(row, cell.depth + 1);
  }

  // Tab: indent (cap at one deeper than the node above). Shift+Tab: outdent.
  function reIndent(cell: FlowCell, dir: 1 | -1) {
    const list = sorted();
    const idx = list.findIndex((c) => c.id === cell.id);
    const prev = list[idx - 1];
    const maxDepth = prev ? prev.depth + 1 : 0;
    const newDepth = dir === 1 ? Math.min(cell.depth + 1, maxDepth) : Math.max(cell.depth - 1, 0);
    if (newDepth === cell.depth) return;
    setLocal(cell.id, { depth: newDepth });
    saveMeta(cell.id, { depth: newDepth });
  }

  function toggleHighlight(cell: FlowCell) {
    const v = !cell.highlighted;
    setLocal(cell.id, { highlighted: v });
    saveMeta(cell.id, { highlighted: v });
  }

  async function clearAll() {
    if (!cellsRef.current.length) return;
    const ok = await confirm({
      title: "Clear the whole flow?",
      message: "This removes every point for everyone on it.",
      confirmLabel: "Clear flow",
      tone: "danger",
    });
    if (!ok) return;
    const ids = cellsRef.current.map((c) => c.id);
    setCells([]);
    onCellsDeleted?.(ids);
    await supabase.from("flow_cells").delete().eq("flow_id", flowId);
  }

  async function delNode(cell: FlowCell, focusPrev = false) {
    if (focusPrev) {
      const list = sorted();
      const idx = list.findIndex((c) => c.id === cell.id);
      if (list[idx - 1]) focusId.current = list[idx - 1].id;
    }
    setCells((prev) => prev.filter((c) => c.id !== cell.id));
    onCellsDeleted?.([cell.id]);
    await supabase.from("flow_cells").delete().eq("id", cell.id);
  }

  // Delete every selected point along with its sub-points. Removes for everyone and
  // drops the Send doc cards tied to them. Confirmed, since it's bulk + irreversible.
  async function deleteSelected() {
    if (!selected.size) return;
    const ids = new Set<string>();
    for (const sid of selected) for (const d of subtreeIds(sid)) ids.add(d);
    const idArr = [...ids];
    const ok = await confirm({
      title: idArr.length === 1 ? "Delete this point?" : `Delete ${idArr.length} points?`,
      message: "They're removed for everyone on this flow.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    setCells((prev) => prev.filter((c) => !ids.has(c.id)));
    onCellsDeleted?.(idArr);
    clearSelection();
    await supabase.from("flow_cells").delete().in("id", idArr);
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  // Drag to drop point(s) as siblings right after the target, re-flowing row_index
  // and shifting depths together. Moves the dragged point's whole subtree — OR, if
  // you drag a point that's part of a multi-selection, the entire selection (each
  // with its subtree) is grouped and moved together.
  function moveSubtree(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const list = sorted();
    if (!list.some((c) => c.id === draggedId)) return;
    const target = list.find((c) => c.id === targetId);
    if (!target) return;
    // Roots to move: the whole selection (if dragging a selected point), else just
    // the dragged point. Expand each root to include its subtree.
    const rootIds = selected.size > 1 && selected.has(draggedId)
      ? list.filter((c) => selected.has(c.id)).map((c) => c.id)
      : [draggedId];
    const moveSet = new Set<string>();
    for (const rid of rootIds) {
      const ri = list.findIndex((c) => c.id === rid);
      if (ri < 0) continue;
      const rd = list[ri].depth;
      moveSet.add(rid);
      for (let i = ri + 1; i < list.length && list[i].depth > rd; i++) moveSet.add(list[i].id);
    }
    if (moveSet.has(targetId)) return; // can't drop the group into itself
    const moving = list.filter((c) => moveSet.has(c.id)); // document order
    const ti = list.findIndex((c) => c.id === targetId);
    let hi = target.row_index + 1;
    for (let i = ti + 1; i < list.length; i++) { if (!moveSet.has(list[i].id)) { hi = list[i].row_index; break; } }
    const lo = target.row_index;
    const n = moving.length;
    // Only reposition (row_index) — points keep their own indentation level.
    const updates = moving.map((c, k) => ({
      id: c.id,
      row_index: lo + ((hi - lo) * (k + 1)) / (n + 1),
    }));
    setCells((prev) => prev.map((c) => { const u = updates.find((x) => x.id === c.id); return u ? { ...c, row_index: u.row_index } : c; }));
    for (const u of updates) {
      supabase.from("flow_cells").update({ row_index: u.row_index, updated_by: userId, updated_at: new Date().toISOString() }).eq("id", u.id).then(() => {});
    }
    // Tell the Send doc the new top-to-bottom point order so its cards reflow to match.
    const newOrder = list
      .map((c) => { const u = updates.find((x) => x.id === c.id); return u ? { id: c.id, row_index: u.row_index } : { id: c.id, row_index: c.row_index }; })
      .sort((a, b) => a.row_index - b.row_index)
      .map((c) => c.id);
    onReorder?.(newOrder);
    if (rootIds.length > 1) clearSelection();
  }

  // The set of points a drag carries: the dragged point's subtree, or — if it's
  // part of a multi-selection — every selected point with its subtree, in order.
  function dragGroup(draggedId: string): FlowCell[] {
    const list = sorted();
    const rootIds = selected.size > 1 && selected.has(draggedId)
      ? list.filter((c) => selected.has(c.id)).map((c) => c.id)
      : [draggedId];
    const set = new Set<string>();
    for (const rid of rootIds) {
      const ri = list.findIndex((c) => c.id === rid);
      if (ri < 0) continue;
      set.add(rid);
      for (let i = ri + 1; i < list.length && list[i].depth > list[ri].depth; i++) set.add(list[i].id);
    }
    return list.filter((c) => set.has(c.id));
  }

  // On drag start, stash the group on the native dataTransfer so a *different* pane
  // (another flow, or the Speech tab) can read it: JSON for flow→flow inserts, plus
  // colored HTML / tab-indented text for the Speech doc (mirrors Copy). Depths are
  // normalized so the shallowest point is 0.
  function startDrag(e: React.DragEvent, cell: FlowCell) {
    setDragId(cell.id);
    e.dataTransfer.effectAllowed = "copyMove";
    const group = dragGroup(cell.id);
    if (!group.length) return;
    const min = Math.min(...group.map((c) => c.depth));
    const payload: FlowDragPayload = {
      sourceFlowId: flowId,
      points: group.map((c) => ({ content: c.content, depth: c.depth - min, highlighted: c.highlighted, status: c.status ?? null })),
    };
    const text = group.map((c) => "\t".repeat(c.depth - min) + c.content).join("\n");
    const html = group.map((c) => {
      const color = FLOW_DEPTH_COLORS[c.depth % 2];
      const indent = (c.depth - min) * 24;
      return `<div style="margin-left:${indent}px;color:${color}">${escHtml(c.content) || "<br>"}</div>`;
    }).join("");
    try {
      e.dataTransfer.setData(FLOW_DRAG_MIME, JSON.stringify(payload));
      e.dataTransfer.setData("text/plain", text);
      e.dataTransfer.setData("text/html", html);
    } catch { /* some browsers block setData on certain types */ }
  }

  // Drop a group dragged from another flow: insert its points as new cells. On a
  // target node they land just after that node's whole subtree, nested under the
  // target's depth; dropped in empty space they append at the bottom.
  async function insertExternal(payload: FlowDragPayload, afterCell: FlowCell | null) {
    if (!payload?.points?.length) return;
    if (payload.sourceFlowId === flowId && !afterCell) return; // no-op self-append
    const list = sorted();
    let baseDepth = 0, lo: number, hi: number;
    if (afterCell) {
      baseDepth = afterCell.depth;
      const ti = list.findIndex((c) => c.id === afterCell.id);
      let end = ti;
      for (let j = ti + 1; j < list.length && list[j].depth > afterCell.depth; j++) end = j;
      lo = list[end].row_index;
      hi = list[end + 1] ? list[end + 1].row_index : lo + 1;
    } else {
      lo = list.length ? Math.max(...list.map((c) => c.row_index)) : -1;
      hi = lo + 1;
    }
    const n = payload.points.length;
    const rows = payload.points.map((p, k) => ({
      flow_id: flowId,
      col: 0,
      row_index: lo + ((hi - lo) * (k + 1)) / (n + 1),
      depth: Math.max(0, baseDepth + p.depth),
      content: p.content,
      highlighted: !!p.highlighted,
      status: p.status ?? null,
      updated_by: userId,
    }));
    const { data } = await supabase.from("flow_cells").insert(rows).select(SEL);
    if (data) setCells((prev) => [...prev, ...(data as FlowCell[])]);
  }

  // Read a cross-pane drop payload off the event (returns null for non-flow drags).
  function readDrag(e: React.DragEvent): FlowDragPayload | null {
    const raw = e.dataTransfer.getData(FLOW_DRAG_MIME);
    if (!raw) return null;
    try { return JSON.parse(raw) as FlowDragPayload; } catch { return null; }
  }

  // Click a point's number to select it; Shift-click selects a range.
  function selectLabel(cell: FlowCell, shift: boolean) {
    const ids = sorted().map((c) => c.id);
    if (shift && anchorRef.current) {
      const a = ids.indexOf(anchorRef.current);
      const b = ids.indexOf(cell.id);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelected(new Set(ids.slice(lo, hi + 1)));
        return;
      }
    }
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(cell.id)) n.delete(cell.id); else n.add(cell.id);
      return n;
    });
    anchorRef.current = cell.id;
  }
  function clearSelection() { setSelected(new Set()); anchorRef.current = null; }

  // Select every point from anchor to the given one (inclusive), document order.
  function selectRange(aId: string, bId: string) {
    const ids = sorted().map((c) => c.id);
    const a = ids.indexOf(aId), b = ids.indexOf(bId);
    if (a === -1 || b === -1) return;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    setSelected(new Set(ids.slice(lo, hi + 1)));
  }
  // Pointer-down on a number starts a drag-select; entering other numbers extends it.
  function startSelectDrag(cell: FlowCell) { suppressClick.current = false; selDrag.current = { anchor: cell.id, moved: false }; anchorRef.current = cell.id; }
  function extendSelectDrag(cell: FlowCell) {
    const d = selDrag.current;
    if (!d || cell.id === d.anchor) return;
    d.moved = true;
    selectRange(d.anchor, cell.id);
  }
  // Hide the selected points (and their sub-points) from view; Show brings them back.
  function hideSelected() {
    if (!selected.size) return;
    setHiddenPts((prev) => {
      const n = new Set(prev);
      for (const sid of selected) for (const d of subtreeIds(sid)) n.add(d);
      return n;
    });
    clearSelection();
  }
  function showHidden() { setHiddenPts(new Set()); }

  // Copy the selected points (or the whole flow if none selected) to the clipboard.
  // We write BOTH plain text (tab-indented, for Docs/Word) and rich HTML whose
  // lines carry the same two indent colors as the outline — so pasting into the
  // (rich) Speech tab keeps the color-coding. DEPTH_COLORS mirrors --c0/--c1 CSS.
  async function copyFlow() {
    const list = sorted();
    const chosen = selected.size ? list.filter((c) => selected.has(c.id)) : list;
    if (!chosen.length) return;
    const min = Math.min(...chosen.map((c) => c.depth));
    const text = chosen.map((c) => "\t".repeat(c.depth - min) + c.content).join("\n");
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const DEPTH_COLORS = ["#ffa987", "#9cc3ff"];
    const html = chosen
      .map((c) => {
        const color = DEPTH_COLORS[c.depth % 2];
        const indent = (c.depth - min) * 24;
        return `<div style="margin-left:${indent}px;color:${color}">${esc(c.content) || "<br>"}</div>`;
      })
      .join("");
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
    } catch {
      try { await navigator.clipboard.writeText(text); } catch { /* blocked */ }
    }
  }

  // "/send" (typed at the end of a point, e.g. "China econ /send") sends to the
  // Send doc as Heading-4 cards. `base` is the line's text with the "/send" command
  // stripped off. Targets: every selected point PLUS the line you typed it on (with
  // its base text); if nothing's selected, just this line. The "/send" command is
  // then removed from the line, leaving its real text behind.
  function runSend(cell: FlowCell, base: string) {
    const list = sorted();
    const ids = new Set(selected);
    if (base) ids.add(cell.id);
    const targets = list
      .filter((c) => ids.has(c.id))
      .map((c) => ({ id: c.id, content: c.id === cell.id ? base : c.content }));
    if (targets.length) onSendPoints?.(targets);
    setLocal(cell.id, { content: base });
    saveContent(cell.id, base);
    setSlash(null);
    clearSelection();
  }

  // "/flag" (typed at the end of a point) flags it — plus any selected points —
  // then strips the command, leaving the text. `base` is the line without "/flag".
  function runFlag(cell: FlowCell, base: string) {
    const ids = new Set<string>();
    for (const sid of selected) for (const d of subtreeIds(sid)) ids.add(d);
    for (const d of subtreeIds(cell.id)) ids.add(d);
    for (const id of ids) setStatus(id, "flag");
    setLocal(cell.id, { content: base });
    saveContent(cell.id, base);
    setSlash(null);
    clearSelection();
  }

  // Finish a "/trigger" from the autocomplete: fill the point with the full trigger
  // (the user then presses Enter to fire it) and close the dropdown.
  function completeSlash(cell: FlowCell, trigger: string) {
    const val = `/${trigger}`;
    setLocal(cell.id, { content: val });
    saveContent(cell.id, val);
    setSlash(null);
  }

  function makeInsert(id: string): EditorInsert {
    return (text: string) => {
      const el = activeEl.current;
      const current = cellsRef.current.find((c) => c.id === id)?.content ?? "";
      const pos = el ? (el.selectionStart ?? current.length) : current.length;
      const nextVal = current.slice(0, pos) + text + current.slice(pos);
      setLocal(id, { content: nextVal });
      saveContent(id, nextVal);
    };
  }

  function autoGrow(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  // Triggers matching what's typed after "/" (dedup, capped) for the dropdown.
  const slashMatches = slash ? fuzzyRank(slash.query, slashOptions).slice(0, 50) : [];

  // Walk the ordered list, tracking a per-depth counter to build 1./a./i. labels.
  const ordered = [...cells].sort((a, b) => a.row_index - b.row_index);
  const counters: number[] = [];
  const labeled = ordered.map((cell, i) => {
    counters[cell.depth] = (counters[cell.depth] || 0) + 1;
    counters.length = cell.depth + 1; // reset deeper counters under a new parent
    const hasKids = i + 1 < ordered.length && ordered[i + 1].depth > cell.depth;
    return { cell, label: nodeLabel(counters[cell.depth], cell.depth), hasKids };
  });

  // Hide points inside a collapsed parent, then apply the status filter.
  const hidden = new Set<string>();
  let hideUnder = -1;
  for (let i = 0; i < ordered.length; i++) {
    const cell = ordered[i];
    if (hideUnder >= 0 && cell.depth > hideUnder) { hidden.add(cell.id); continue; }
    hideUnder = -1;
    if (collapsed.has(cell.id) && labeled[i].hasKids) hideUnder = cell.depth;
  }
  const visible = labeled.filter(({ cell }) => !hidden.has(cell.id) && !hiddenPts.has(cell.id) && (!flaggedOnly || cell.status === "flag"));
  const anyCollapsed = collapsed.size > 0;

  return (
    <div
      className={`flow-outline ${extDrop ? "is-extdrop" : ""}`}
      onKeyDown={(e) => {
        // Del / Backspace clears the selected points — but never while typing in a cell.
        if ((e.key === "Delete" || e.key === "Backspace") && selected.size) {
          const t = e.target as HTMLElement;
          if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
          e.preventDefault();
          deleteSelected();
        }
      }}
      onDragOver={(e) => { if (!dragId && e.dataTransfer.types.includes(FLOW_DRAG_MIME)) { e.preventDefault(); setExtDrop(true); } }}
      onDragLeave={(e) => { if (e.target === e.currentTarget) setExtDrop(false); }}
      onDrop={(e) => {
        // Node drops stop propagation, so this only fires for empty-area drops → append.
        if (!dragId) { const p = readDrag(e); if (p) { e.preventDefault(); insertExternal(p, null); } }
        setExtDrop(false);
      }}
    >
      {loadError && (
        <p className="flow-outline__error">
          <AlertTriangle size={13} /> Couldn’t load the flow: {loadError}. If this mentions “depth”,
          “highlighted”, or “status”, run the flow_cells migrations in Supabase
          (flows.sql and flow_cell_status.sql).
        </p>
      )}
      {!loadError && labeled.length === 0 && (
        <button className="flow-outline__add" onClick={() => insertNode(0, 0)}>+ Add your first point</button>
      )}
      {labeled.length > 0 && (
        <div className="flow-outline__bar">
          <button className="db-btn db-btn--glass db-btn--sm" onClick={copyFlow}>
            {selected.size ? `Copy ${selected.size}` : "Copy"}
          </button>
          {selected.size > 0 && (
            <>
              <button className="db-btn db-btn--glass db-btn--sm" onClick={hideSelected} title="Hide selected points from view">
                <EyeOff size={13} /> Hide {selected.size}
              </button>
              <button className="db-btn db-btn--glass db-btn--sm flow-outline__del" onClick={deleteSelected} title="Delete selected points (Del)">
                <Trash2 size={13} /> Delete {selected.size}
              </button>
              <button className="db-btn db-btn--glass db-btn--sm" onClick={clearSelection}>Deselect</button>
            </>
          )}
          {hiddenPts.size > 0 && (
            <button className="db-btn db-btn--glass db-btn--sm" onClick={showHidden} title="Show points you've hidden">
              <Eye size={13} /> Show {hiddenPts.size} hidden
            </button>
          )}
          <button className={`db-btn db-btn--glass db-btn--sm ${flaggedOnly ? "is-active" : ""}`} onClick={() => setFlaggedOnly((f) => !f)} title="Show only flagged points">
            <Flag size={13} /> {flaggedOnly ? "Showing flagged" : "Only flagged"}
          </button>
          <button className="db-btn db-btn--glass db-btn--sm" onClick={() => (anyCollapsed ? setCollapsed(new Set()) : setCollapsed(new Set(labeled.filter((l) => l.hasKids).map((l) => l.cell.id))))}>
            {anyCollapsed ? "Expand all" : "Collapse all"}
          </button>
          <span className="flow-outline__bar-hint">Click or drag the numbers to select, then hide, delete, or drag the handle to move them</span>
          <button className="db-btn db-btn--glass db-btn--sm" onClick={clearAll}>Clear flow</button>
        </div>
      )}
      {visible.map(({ cell, label, hasKids }) => (
        <div
          key={cell.id}
          className={`flow-node flow-node--c${cell.depth % 2} ${cell.highlighted ? "flow-node--hl" : ""} ${selected.has(cell.id) ? "is-sel" : ""} ${remoteEditors[cell.id]?.length ? "is-remote" : ""} ${cell.status === "flag" ? "flow-node--flag" : ""} ${dropId === cell.id ? "is-drop" : ""} ${dragId === cell.id || (dragId && selected.size > 1 && selected.has(dragId) && selected.has(cell.id)) ? "is-drag" : ""}`}
          style={{ marginLeft: cell.depth * INDENT, ...(remoteEditors[cell.id]?.length ? { boxShadow: `inset 0 0 0 1.5px ${remoteEditors[cell.id][0].color}` } : cell.status === "flag" ? { boxShadow: `inset 3px 0 0 ${FLAG_COLOR}` } : {}) }}
          onDragOver={(e) => {
            if (dragId) { if (dragId !== cell.id) { e.preventDefault(); setDropId(cell.id); } }
            else if (e.dataTransfer.types.includes(FLOW_DRAG_MIME)) { e.preventDefault(); setDropId(cell.id); }
          }}
          onDrop={(e) => {
            e.preventDefault(); e.stopPropagation();
            if (dragId) moveSubtree(dragId, cell.id);            // same flow → reorder
            else { const p = readDrag(e); if (p) insertExternal(p, cell); }  // another pane → insert after
            setDragId(null); setDropId(null); setExtDrop(false);
          }}
        >
          <span
            className="flow-node__drag"
            draggable
            title="Drag to move this point — reorder here, or across panes into another flow or the Speech tab"
            onDragStart={(e) => startDrag(e, cell)}
            onDragEnd={() => { setDragId(null); setDropId(null); setExtDrop(false); }}
          ><GripVertical size={14} /></span>
          {hasKids ? (
            <button className="flow-node__fold" onClick={() => toggleCollapse(cell.id)} aria-label={collapsed.has(cell.id) ? "Expand" : "Collapse"} title={collapsed.has(cell.id) ? "Expand" : "Collapse"}>{collapsed.has(cell.id) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}</button>
          ) : (
            <span className="flow-node__fold flow-node__fold--leaf" />
          )}
          <span
            className="flow-node__label"
            role="button"
            tabIndex={0}
            title="Click to select • Shift-click for a range • Drag down the numbers to select many"
            onPointerDown={() => startSelectDrag(cell)}
            onPointerEnter={() => extendSelectDrag(cell)}
            onClick={(e) => { if (suppressClick.current) { suppressClick.current = false; return; } selectLabel(cell, e.shiftKey); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectLabel(cell, false); } }}
          >{label}</span>
          {cell.status === "flag" && (
            <span className="flow-node__statustag" style={{ background: FLAG_COLOR }}><Flag size={10} /></span>
          )}
          <textarea
            className="flow-node__text"
            value={cell.content}
            rows={1}
            ref={(el) => {
              autoGrow(el);
              if (el && focusId.current === cell.id) { el.focus(); focusId.current = null; }
            }}
            onChange={(e) => {
              const v = e.target.value;
              setLocal(cell.id, { content: v });
              autoGrow(e.target);
              scheduleSave(cell.id, v);
              // Show the trigger dropdown while the whole point is a "/partial".
              const sm = /^\/(\S*)$/.exec(v);
              if (sm) { setSlash({ id: cell.id, query: sm[1].toLowerCase() }); setSlashActive(0); }
              else if (slash) setSlash(null);
            }}
            onKeyDown={(e) => {
              const ta = e.target as HTMLTextAreaElement;
              const dropOpen = slash?.id === cell.id && slashMatches.length > 0;
              if (dropOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                e.preventDefault();
                setSlashActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + slashMatches.length) % slashMatches.length);
                return;
              }
              if (dropOpen && e.key === "Escape") { e.preventDefault(); setSlash(null); return; }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                // "/send" at the end of the line (or alone) → push this line (and any
                // selected points) to the Send doc; strip the command off the line.
                if (/(^|\s)\/send\s*$/i.test(ta.value)) {
                  runSend(cell, ta.value.replace(/(^|\s)\/send\s*$/i, "").trim());
                  return;
                }
                // "/flag" → flag this line (and any selected points), strip the command.
                if (/(^|\s)\/flag\s*$/i.test(ta.value)) {
                  runFlag(cell, ta.value.replace(/(^|\s)\/flag\s*$/i, "").trim());
                  return;
                }
                const m = /^\/(\S+)$/.exec(ta.value.trim());
                const trigger = m?.[1].toLowerCase();
                // Slash command: "/topshelf" + Enter inserts the block as responses
                // here, at this point's indent, and queues its cards to the Send doc.
                if (m && trigger) {
                  const tags = resolveSlashPoints?.(trigger);
                  if (tags && tags.length) {
                    setSlash(null);
                    // Points that follow this one (in flow order) — the Send doc
                    // inserts the new block before the first of these that already
                    // has a card, so the doc order mirrors the outline order.
                    const list = sorted();
                    const idx = list.findIndex((c) => c.id === cell.id);
                    const afterIds = list.slice(idx + 1).map((c) => c.id);
                    insertBlock(cell, tags).then((ids) => onSlashBlock?.(trigger, ids, afterIds));
                    return;
                  }
                }
                // Not yet a complete trigger but the dropdown is open → autocomplete
                // to the highlighted suggestion instead of making a new point.
                if (dropOpen) { completeSlash(cell, slashMatches[slashActive]?.trigger ?? slashMatches[0].trigger); return; }
                // Enter on an empty sub-point pops back out a level (Docs-style).
                if (ta.value === "" && cell.depth > 0) { reIndent(cell, -1); return; }
                saveContent(cell.id, ta.value);
                addSibling(cell);
              } else if (e.key === "Tab") {
                // Tab completes the highlighted suggestion when the dropdown is open.
                if (dropOpen) { e.preventDefault(); completeSlash(cell, slashMatches[slashActive]?.trigger ?? slashMatches[0].trigger); return; }
                e.preventDefault();
                saveContent(cell.id, ta.value);
                reIndent(cell, e.shiftKey ? -1 : 1);
              } else if ((e.metaKey || e.ctrlKey) && (e.key === "e" || e.key === "E")) {
                e.preventDefault();
                toggleHighlight(cell);
              } else if (e.key === "Backspace" && ta.value === "" && ta.selectionStart === 0) {
                e.preventDefault();
                delNode(cell, true);
              }
            }}
            onFocus={(e) => {
              editingId.current = cell.id;
              activeEl.current = e.target;
              registerInsert(makeInsert(cell.id));
              trackCell(cell.id);
            }}
            onBlur={(e) => {
              editingId.current = null;
              saveContent(cell.id, e.target.value);
              trackCell(null);
              // Close the dropdown unless focus moved into one of its options.
              setTimeout(() => setSlash((s) => (s?.id === cell.id ? null : s)), 120);
            }}
          />
          {remoteEditors[cell.id]?.length > 0 && (
            <div className="flow-node__editors">
              {remoteEditors[cell.id].map((ed) => (
                <span key={ed.uid} className="flow-node__editor" style={{ background: ed.color }}>{ed.name}</span>
              ))}
            </div>
          )}
          {slash?.id === cell.id && slashMatches.length > 0 && (
            <ul className="flow-slash" role="listbox">
              {slashMatches.map((o, i) => (
                <li key={o.trigger} role="option" aria-selected={i === slashActive}>
                  <button
                    type="button"
                    ref={i === slashActive ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                    className={`flow-slash__opt ${i === slashActive ? "is-active" : ""}`}
                    onMouseDown={(e) => { e.preventDefault(); completeSlash(cell, o.trigger); }}
                  >
                    <span className="flow-slash__trig">/{o.trigger}</span>
                    <span className="flow-slash__label">{o.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flow-node__tools">
            <button className={`flow-node__btn ${cell.status === "flag" ? "is-flag" : ""}`} onClick={() => toggleFlag(cell)} title="Flag (or type /flag)" aria-label="Flag"><Flag size={13} /></button>
            <button className="flow-node__btn flow-node__btn--sub" onClick={() => addChild(cell)} title="Add sub-point inside" aria-label="Add sub-point"><ListPlus size={13} /></button>
            <button className="flow-node__btn" onClick={() => reIndent(cell, -1)} title="Outdent (Shift+Tab)" aria-label="Outdent"><IndentDecrease size={13} /></button>
            <button className="flow-node__btn" onClick={() => reIndent(cell, 1)} title="Indent (Tab)" aria-label="Indent"><IndentIncrease size={13} /></button>
            <button className="flow-node__btn" onClick={() => toggleHighlight(cell)} title="Highlight (Ctrl+E)" aria-label="Highlight"><Highlighter size={13} /></button>
            <button className="flow-node__btn" onClick={() => delNode(cell)} title="Delete" aria-label="Delete"><X size={13} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}
