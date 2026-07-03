"use client";

import { useEffect, useState } from "react";
import { Camera, ChevronDown, ChevronRight, Copy, Trash2, Check } from "lucide-react";
import { listSnaps, takeSnap, deleteSnap, type FlowSnap } from "@/lib/flowSnaps";
import { FLOW_DEPTH_COLORS, nodeLabel } from "@/app/flow/shared";

// When in the round it was taken: time for today's snapshots, date + time after.
function fmtWhen(at: number): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${time}`;
}

// Snapshot history dialog: freeze the flow at the end of each speech, then scrub
// back through the frozen copies. Read-only — the live flow is never touched.
export default function FlowSnapshots({ flowId, onClose }: { flowId: string; onClose: () => void }) {
  const [snaps, setSnaps] = useState<FlowSnap[]>(() => listSnaps(flowId));
  const [open, setOpen] = useState<string | null>(snaps[0]?.id ?? null);
  const [label, setLabel] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function take() {
    const snap = takeSnap(flowId, label);
    if (!snap) return;
    setSnaps(listSnaps(flowId));
    setOpen(snap.id);
    setLabel("");
  }

  function del(id: string) {
    setSnaps(deleteSnap(flowId, id));
    if (open === id) setOpen(null);
  }

  // Same clipboard shape as the outline's Copy: tab-indented text + HTML carrying
  // the depth colors and each point's 1./a./i. label, so a snapshot pastes back
  // into a flow (or the Speech doc) numbered the way it was frozen.
  async function copySnap(s: FlowSnap) {
    const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const min = Math.min(...s.cells.map((c) => c.depth));
    const counters: number[] = [];
    const lines = s.cells.map((c) => {
      counters[c.depth] = (counters[c.depth] || 0) + 1;
      counters.length = c.depth + 1;
      return { c, line: `${nodeLabel(counters[c.depth], c.depth)} ${c.content}`.trim() };
    });
    const text = lines.map(({ c, line }) => "\t".repeat(c.depth - min) + line).join("\n");
    const html = lines
      .map(({ c, line }) => `<div style="margin-left:${(c.depth - min) * 24}px;color:${FLOW_DEPTH_COLORS[c.depth % 2]}">${esc(line) || "<br>"}</div>`)
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
    setCopiedId(s.id);
    setTimeout(() => setCopiedId((p) => (p === s.id ? null : p)), 1600);
  }

  return (
    <div className="flow-rtcal-backdrop" onClick={onClose} role="presentation">
      <div className="flow-rtcal flow-snaps" role="dialog" aria-modal="true" aria-label="Flow snapshots" onClick={(e) => e.stopPropagation()}>
        <span className="flow-rtcal__step">Flow snapshots</span>
        <h3>The flow, speech by speech</h3>
        <p className="flow-rtcal__sub">
          Freeze a copy at the end of each speech to look back at how the round developed.
          Saved on this device. With the Timers open, one is taken automatically when the speech clock runs out.
        </p>

        <div className="flow-snaps__take">
          <input
            className="flow-snaps__label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") take(); }}
            placeholder="Label — e.g. After con rebuttal"
            aria-label="Snapshot label"
          />
          <button className="db-btn db-btn--accent db-btn--sm" onClick={take}>
            <Camera size={14} /> Take snapshot
          </button>
        </div>

        {snaps.length === 0 ? (
          <p className="flow-snaps__empty">
            No snapshots yet. Take one when a speech ends — the flow keeps moving, the snapshot doesn&apos;t.
          </p>
        ) : (
          <div className="flow-snaps__list">
            {snaps.map((s) => (
              <div key={s.id} className={`flow-snaps__item ${open === s.id ? "is-open" : ""}`}>
                <div className="flow-snaps__row">
                  <button
                    className="flow-snaps__head"
                    onClick={() => setOpen((o) => (o === s.id ? null : s.id))}
                    aria-expanded={open === s.id}
                  >
                    {open === s.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    <span className="flow-snaps__name">{s.label}</span>
                    <span className="flow-snaps__meta">{fmtWhen(s.at)} · {s.cells.length} {s.cells.length === 1 ? "point" : "points"}</span>
                  </button>
                  <button className="flow-snaps__act" onClick={() => copySnap(s)} title="Copy the snapshot's points (paste into a flow or the Speech doc)" aria-label="Copy snapshot">
                    {copiedId === s.id ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                  <button className="flow-snaps__act flow-snaps__act--del" onClick={() => del(s.id)} title="Delete snapshot" aria-label="Delete snapshot">
                    <Trash2 size={13} />
                  </button>
                </div>
                {open === s.id && (
                  <div className="flow-snaps__preview">
                    {(() => {
                      const counters: number[] = [];
                      return s.cells.map((c) => {
                        counters[c.depth] = (counters[c.depth] || 0) + 1;
                        counters.length = c.depth + 1;
                        return (
                          <div key={c.id} className="flow-snaps__pt" style={{ marginLeft: c.depth * 18, color: FLOW_DEPTH_COLORS[c.depth % 2] }}>
                            <span className="flow-snaps__num">{nodeLabel(counters[c.depth], c.depth)}</span>
                            <span className={c.highlighted ? "flow-snaps__hl" : undefined}>{c.content || "(empty)"}</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flow-rtcal__actions">
          <button className="db-btn db-btn--glass db-btn--sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
