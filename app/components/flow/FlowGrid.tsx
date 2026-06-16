"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { FLOW_COLUMNS, type FlowCell, type EditorInsert } from "@/app/flow/shared";

interface FlowGridProps {
  flowId: string;
  userId: string;
  registerInsert: (fn: EditorInsert | null) => void;
}

// The flow sheet. Columns share a vertical axis (row_index is a float shared
// across all 8 columns), so a response placed at a card's row lines up with it —
// no empty-box padding. Tab/→ responds in the next column at the same row; Enter
// stacks a new card below (a fractional row between this one and the next).
// Edits persist on blur and stream via Supabase Realtime.
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
      .select("id, flow_id, col, row_index, content, updated_by, updated_at")
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

  function setLocal(id: string, content: string) {
    setCells((prev) => prev.map((c) => (c.id === id ? { ...c, content } : c)));
  }

  async function saveCell(id: string, content: string) {
    await supabase
      .from("flow_cells")
      .update({ content, updated_by: userId, updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  async function insertCell(col: number, row: number, focus = true) {
    const { data } = await supabase
      .from("flow_cells")
      .insert({ flow_id: flowId, col, row_index: row, content: "", updated_by: userId })
      .select("id, flow_id, col, row_index, content, updated_by, updated_at")
      .single();
    if (data) {
      if (focus) focusId.current = (data as FlowCell).id;
      setCells((prev) => (prev.some((c) => c.id === data.id) ? prev : [...prev, data as FlowCell]));
    }
  }

  // A fractional row between `row` and the next-lowest distinct row anywhere in
  // the sheet — so stacking below a card keeps later rows (and their alignment).
  function rowBelow(row: number): number {
    const rows = [...new Set(cellsRef.current.map((c) => c.row_index))].sort((a, b) => a - b);
    const below = rows.find((r) => r > row);
    return below !== undefined ? (row + below) / 2 : row + 1;
  }

  // Enter: new card directly below in the same column.
  function addBelow(col: number, row: number) { insertCell(col, rowBelow(row)); }

  // Tab / →: respond in the next column, aligned to this card's row.
  function respond(col: number, row: number) {
    if (col >= FLOW_COLUMNS.length - 1) return;
    const target = col + 1;
    const existing = cellsRef.current.find((c) => c.col === target && c.row_index === row);
    if (existing) { focusId.current = existing.id; setCells((p) => [...p]); return; }
    insertCell(target, row);
  }

  // Column header +: append a card at the bottom of that column.
  function appendToColumn(col: number) {
    const colRows = cellsRef.current.filter((c) => c.col === col).map((c) => c.row_index);
    insertCell(col, colRows.length ? Math.max(...colRows) + 1 : 0);
  }

  async function delCard(id: string) {
    setCells((prev) => prev.filter((c) => c.id !== id));
    await supabase.from("flow_cells").delete().eq("id", id);
  }

  function makeInsert(id: string): EditorInsert {
    return (text: string) => {
      const el = activeEl.current;
      const current = cellsRef.current.find((c) => c.id === id)?.content ?? "";
      const pos = el ? (el.selectionStart ?? current.length) : current.length;
      const next = current.slice(0, pos) + text + current.slice(pos);
      setLocal(id, next);
      saveCell(id, next);
    };
  }

  function autoGrow(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  // Map each distinct row value to a consecutive grid line (row 1 = headers).
  const rowsSorted = [...new Set(cells.map((c) => c.row_index))].sort((a, b) => a - b);
  const rowToGrid = new Map(rowsSorted.map((r, i) => [r, i + 2]));

  return (
    <div className="flow-grid">
      {FLOW_COLUMNS.map((col, ci) => (
        <div
          key={`h${ci}`}
          className={`flow-col__head flow-col__head--${col.side}`}
          style={{ gridColumn: ci + 1, gridRow: 1 }}
        >
          <span title={col.full}>{col.label}</span>
          <button className="flow-col__add" onClick={() => appendToColumn(ci)} aria-label={`Add card to ${col.full}`}>+</button>
        </div>
      ))}

      {cells.map((cell) => {
        const side = FLOW_COLUMNS[cell.col]?.side ?? "pro";
        const gridRow = rowToGrid.get(cell.row_index) ?? 2;
        return (
          <div
            key={cell.id}
            className={`flow-card flow-card--${side}`}
            style={{ gridColumn: cell.col + 1, gridRow }}
          >
            <textarea
              className="flow-card__text"
              value={cell.content}
              rows={1}
              ref={(el) => {
                autoGrow(el);
                if (el && focusId.current === cell.id) { el.focus(); focusId.current = null; }
              }}
              onChange={(e) => { setLocal(cell.id, e.target.value); autoGrow(e.target); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  saveCell(cell.id, (e.target as HTMLTextAreaElement).value);
                  addBelow(cell.col, cell.row_index);
                } else if (e.key === "Tab" && !e.shiftKey) {
                  e.preventDefault();
                  saveCell(cell.id, (e.target as HTMLTextAreaElement).value);
                  respond(cell.col, cell.row_index);
                }
              }}
              onFocus={(e) => {
                editingId.current = cell.id;
                activeEl.current = e.target;
                registerInsert(makeInsert(cell.id));
              }}
              onBlur={(e) => {
                editingId.current = null;
                saveCell(cell.id, e.target.value);
              }}
            />
            {cell.col < FLOW_COLUMNS.length - 1 && (
              <button className="flow-card__respond" onClick={() => respond(cell.col, cell.row_index)} title="Respond (Tab)" aria-label="Respond in next column">›</button>
            )}
            <button className="flow-card__del" onClick={() => delCard(cell.id)} aria-label="Delete card">×</button>
          </div>
        );
      })}
    </div>
  );
}
