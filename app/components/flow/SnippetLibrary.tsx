"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { parseAtSections } from "@/lib/docxImport";
import type { FlowSnippet, ExtensionPoint } from "@/app/flow/shared";

const SEL = "id, owner_id, label, body, points, shortcut, created_at";

interface SnippetLibraryProps {
  userId: string;
  onClose: () => void;
  onUse: (snippet: FlowSnippet) => void;   // add to flow + queue into Send doc
  snippets: FlowSnippet[];
  setSnippets: React.Dispatch<React.SetStateAction<FlowSnippet[]>>;
}

// Extensions library. Import an "AT:" .docx → one extension per header section
// (its Heading-4 items are the points). Using one breaks it into flow points and
// queues its cards into the Send doc. Assign a key shortcut to fire it hands-free.
export default function SnippetLibrary({ userId, onClose, onUse, snippets, setSnippets }: SnippetLibraryProps) {
  const [label, setLabel] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [capturingId, setCapturingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!capturingId) return;
    function onKey(e: KeyboardEvent) {
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      if (!(e.ctrlKey || e.altKey || e.metaKey)) { setError("Shortcuts need Alt, Ctrl, or Cmd."); return; }
      const mods: string[] = [];
      if (e.ctrlKey) mods.push("ctrl");
      if (e.altKey) mods.push("alt");
      if (e.metaKey) mods.push("meta");
      if (e.shiftKey) mods.push("shift");
      saveShortcut(capturingId!, [...mods, e.key.toLowerCase()].join("+"));
      setCapturingId(null);
      setError("");
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturingId]);

  async function add() {
    if (!body.trim()) return;
    setBusy(true);
    const { data } = await supabase
      .from("flow_snippets")
      .insert({ owner_id: userId, label: label.trim() || "Extension", body })
      .select(SEL)
      .single();
    setBusy(false);
    if (data) { setSnippets((prev) => [data as FlowSnippet, ...prev]); setLabel(""); setBody(""); }
  }

  async function del(id: string) {
    setSnippets((prev) => prev.filter((s) => s.id !== id));
    await supabase.from("flow_snippets").delete().eq("id", id);
  }

  async function saveShortcut(id: string, shortcut: string | null) {
    setSnippets((prev) => prev.map((s) => (s.id === id ? { ...s, shortcut } : s)));
    await supabase.from("flow_snippets").update({ shortcut }).eq("id", id);
  }

  async function importAt(file: File) {
    setError(""); setBusy(true);
    let sections: { label: string; body: string; points: ExtensionPoint[] }[] = [];
    try {
      sections = await parseAtSections(await file.arrayBuffer());
    } catch {
      setError("Couldn't read that .docx."); setBusy(false); return;
    }
    if (!sections.length) { setError("No sections found — needs Heading 1-3 section titles and Heading 4 tags."); setBusy(false); return; }
    const { data } = await supabase
      .from("flow_snippets")
      .insert(sections.map((s) => ({ owner_id: userId, label: s.label, body: s.body, points: s.points })))
      .select(SEL);
    setBusy(false);
    if (data) setSnippets((prev) => [...(data as FlowSnippet[]), ...prev]);
  }

  return (
    <aside className="flow-snip">
      <div className="flow-snip__head">
        <span className="flow-panel__title">Extensions</span>
        <button className="flow-icon-btn" onClick={onClose} aria-label="Close">×</button>
      </div>

      <button className="flow-rail__import" onClick={() => fileRef.current?.click()} disabled={busy}>
        ⬆ Import AT doc (.docx)
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".docx"
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) importAt(f); e.target.value = ""; }}
      />

      <div className="flow-snip__add">
        <input className="db-input" placeholder="Name (optional)" value={label} onChange={(e) => setLabel(e.target.value)} style={{ height: 38, fontSize: 13 }} />
        <textarea className="db-textarea" placeholder="Card text…" value={body} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 64, fontSize: 13 }} />
        <button className="db-btn db-btn--accent db-btn--sm" onClick={add} disabled={busy || !body.trim()}>
          {busy ? "…" : "Save extension"}
        </button>
      </div>

      {error && <p className="flow-snip__error">⚑ {error}</p>}

      <div className="flow-snip__list">
        {snippets.length === 0 ? (
          <p className="flow-snip__empty">No saved extensions yet.</p>
        ) : (
          snippets.map((s) => (
            <div className="flow-snip__item" key={s.id}>
              <button className="flow-snip__insert" title={s.body} onClick={() => onUse(s)}>
                <span className="flow-snip__label">
                  {s.label}
                  {s.points && s.points.length > 1 ? ` · ${s.points.length} pts` : ""}
                </span>
                <span className="flow-snip__preview">{s.body}</span>
              </button>
              <div className="flow-snip__row2">
                <button
                  className={`flow-snip__shortcut ${capturingId === s.id ? "is-capturing" : ""}`}
                  onClick={() => setCapturingId(capturingId === s.id ? null : s.id)}
                  title="Set keyboard shortcut"
                >
                  {capturingId === s.id ? "press keys…" : s.shortcut ? `⌨ ${s.shortcut}` : "⌨ set shortcut"}
                </button>
                {s.shortcut && capturingId !== s.id && (
                  <button className="flow-icon-btn" onClick={() => saveShortcut(s.id, null)} title="Clear shortcut" aria-label="Clear shortcut">×</button>
                )}
              </div>
              <button className="flow-icon-btn flow-snip__del" onClick={() => del(s.id)} aria-label="Delete">×</button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
