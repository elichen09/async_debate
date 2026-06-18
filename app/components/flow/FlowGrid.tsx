"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { FlowCell, EditorInsert } from "@/app/flow/shared";

interface FlowGridProps {
  flowId: string;
  userId: string;
  registerInsert: (fn: EditorInsert | null) => void;
  registerAddPoints?: (fn: ((tags: string[]) => void) | null) => void;
  // Returns the point tags for a "/trigger" (and queues the Send doc), or null.
  resolveSlashPoints?: (trigger: string) => string[] | null;
}

const SEL = "id, flow_id, col, row_index, depth, highlighted, content, updated_by, updated_at";
const INDENT = 26; // px per outline level

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
export default function FlowGrid({ flowId, userId, registerInsert, registerAddPoints, resolveSlashPoints }: FlowGridProps) {
  const [cells, setCells] = useState<FlowCell[]>([]);
  const [loadError, setLoadError] = useState("");
  const cellsRef = useRef<FlowCell[]>([]);
  const editingId = useRef<string | null>(null);
  const activeEl = useRef<HTMLTextAreaElement | null>(null);
  const focusId = useRef<string | null>(null);

  useEffect(() => { cellsRef.current = cells; }, [cells]);

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

  const sorted = () => [...cellsRef.current].sort((a, b) => a.row_index - b.row_index);

  function setLocal(id: string, patch: Partial<FlowCell>) {
    setCells((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function saveContent(id: string, content: string) {
    await supabase.from("flow_cells").update({ content, updated_by: userId, updated_at: new Date().toISOString() }).eq("id", id);
  }
  async function saveMeta(id: string, patch: { depth?: number; highlighted?: boolean }) {
    await supabase.from("flow_cells").update({ ...patch, updated_by: userId, updated_at: new Date().toISOString() }).eq("id", id);
  }

  async function insertNode(row: number, depth: number, content = "", focus = true) {
    const { data } = await supabase
      .from("flow_cells")
      .insert({ flow_id: flowId, col: 0, row_index: row, depth, content, updated_by: userId })
      .select(SEL)
      .single();
    if (data) {
      if (focus) focusId.current = (data as FlowCell).id;
      setCells((prev) => (prev.some((c) => c.id === data.id) ? prev : [...prev, data as FlowCell]));
    }
  }

  // Insert an extension's tags as responses at the current point: the first tag
  // fills this point, the rest follow as siblings at the SAME indent (depth).
  async function insertBlock(cell: FlowCell, tags: string[]) {
    if (!tags.length) return;
    setLocal(cell.id, { content: tags[0] });
    saveContent(cell.id, tags[0]);
    const list = sorted();
    const idx = list.findIndex((c) => c.id === cell.id);
    const next = list[idx + 1];
    const lo = cell.row_index;
    const hi = next ? next.row_index : cell.row_index + 1;
    const rest = tags.slice(1);
    for (let i = 0; i < rest.length; i++) {
      const row = lo + ((hi - lo) * (i + 1)) / (rest.length + 1);
      await insertNode(row, cell.depth, rest[i], false);
    }
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
    if (!window.confirm("Clear the whole flow? This removes every point for everyone on it.")) return;
    setCells([]);
    await supabase.from("flow_cells").delete().eq("flow_id", flowId);
  }

  async function delNode(cell: FlowCell, focusPrev = false) {
    if (focusPrev) {
      const list = sorted();
      const idx = list.findIndex((c) => c.id === cell.id);
      if (list[idx - 1]) focusId.current = list[idx - 1].id;
    }
    setCells((prev) => prev.filter((c) => c.id !== cell.id));
    await supabase.from("flow_cells").delete().eq("id", cell.id);
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

  // Walk the ordered list, tracking a per-depth counter to build 1./a./i. labels.
  const ordered = [...cells].sort((a, b) => a.row_index - b.row_index);
  const counters: number[] = [];
  const labeled = ordered.map((cell) => {
    counters[cell.depth] = (counters[cell.depth] || 0) + 1;
    counters.length = cell.depth + 1; // reset deeper counters under a new parent
    return { cell, label: nodeLabel(counters[cell.depth], cell.depth) };
  });

  return (
    <div className="flow-outline">
      {loadError && (
        <p className="flow-outline__error">
          ⚑ Couldn’t load the flow: {loadError}. If this mentions “depth” or
          “highlighted”, run the flow_cells migration in Supabase.
        </p>
      )}
      {!loadError && labeled.length === 0 && (
        <button className="flow-outline__add" onClick={() => insertNode(0, 0)}>+ Add your first point</button>
      )}
      {labeled.length > 0 && (
        <div className="flow-outline__bar">
          <button className="db-btn db-btn--glass db-btn--sm" onClick={clearAll}>Clear flow</button>
        </div>
      )}
      {labeled.map(({ cell, label }) => (
        <div
          key={cell.id}
          className={`flow-node flow-node--c${cell.depth % 2} ${cell.highlighted ? "flow-node--hl" : ""}`}
          style={{ marginLeft: cell.depth * INDENT }}
        >
          <span className="flow-node__label">{label}</span>
          <textarea
            className="flow-node__text"
            value={cell.content}
            rows={1}
            ref={(el) => {
              autoGrow(el);
              if (el && focusId.current === cell.id) { el.focus(); focusId.current = null; }
            }}
            onChange={(e) => { setLocal(cell.id, { content: e.target.value }); autoGrow(e.target); }}
            onKeyDown={(e) => {
              const ta = e.target as HTMLTextAreaElement;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                // Slash command: "/topshelf" + Enter inserts the block as responses
                // here, at this point's indent.
                const m = /^\/(\S+)$/.exec(ta.value.trim());
                if (m) {
                  const tags = resolveSlashPoints?.(m[1].toLowerCase());
                  if (tags && tags.length) { insertBlock(cell, tags); return; }
                }
                // Enter on an empty sub-point pops back out a level (Docs-style).
                if (ta.value === "" && cell.depth > 0) { reIndent(cell, -1); return; }
                saveContent(cell.id, ta.value);
                addSibling(cell);
              } else if (e.key === "Tab") {
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
            }}
            onBlur={(e) => {
              editingId.current = null;
              saveContent(cell.id, e.target.value);
            }}
          />
          <div className="flow-node__tools">
            <button className="flow-node__btn flow-node__btn--sub" onClick={() => addChild(cell)} title="Add sub-point inside" aria-label="Add sub-point">↳+</button>
            <button className="flow-node__btn" onClick={() => reIndent(cell, -1)} title="Outdent (Shift+Tab)" aria-label="Outdent">←</button>
            <button className="flow-node__btn" onClick={() => reIndent(cell, 1)} title="Indent (Tab)" aria-label="Indent">→</button>
            <button className="flow-node__btn" onClick={() => toggleHighlight(cell)} title="Highlight (Ctrl+E)" aria-label="Highlight">▤</button>
            <button className="flow-node__btn" onClick={() => delNode(cell)} title="Delete" aria-label="Delete">×</button>
          </div>
        </div>
      ))}
    </div>
  );
}
