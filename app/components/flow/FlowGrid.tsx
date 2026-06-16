"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { FlowCell, EditorInsert } from "@/app/flow/shared";

interface FlowGridProps {
  flowId: string;
  userId: string;
  registerInsert: (fn: EditorInsert | null) => void;
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
export default function FlowGrid({ flowId, userId, registerInsert }: FlowGridProps) {
  const [cells, setCells] = useState<FlowCell[]>([]);
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
      .then(({ data }) => { if (active && data) setCells(data as FlowCell[]); });

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

  async function insertNode(row: number, depth: number) {
    const { data } = await supabase
      .from("flow_cells")
      .insert({ flow_id: flowId, col: 0, row_index: row, depth, content: "", updated_by: userId })
      .select(SEL)
      .single();
    if (data) {
      focusId.current = (data as FlowCell).id;
      setCells((prev) => (prev.some((c) => c.id === data.id) ? prev : [...prev, data as FlowCell]));
    }
  }

  // Enter: new sibling right below, at the same depth.
  function addSibling(cell: FlowCell) {
    const list = sorted();
    const idx = list.findIndex((c) => c.id === cell.id);
    const next = list[idx + 1];
    const row = next ? (cell.row_index + next.row_index) / 2 : cell.row_index + 1;
    insertNode(row, cell.depth);
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
      {labeled.length === 0 && <p className="flow-outline__empty">Empty — start typing your first point.</p>}
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
            <button className="flow-node__btn" onClick={() => toggleHighlight(cell)} title="Highlight (Ctrl+E)" aria-label="Highlight">▤</button>
            <button className="flow-node__btn" onClick={() => delNode(cell)} title="Delete" aria-label="Delete">×</button>
          </div>
        </div>
      ))}
    </div>
  );
}
