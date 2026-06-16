"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { FlowSnippet } from "@/app/flow/shared";

interface SnippetLibraryProps {
  userId: string;
  onClose: () => void;
  // Insert the snippet body into whatever editor was last focused.
  onInsert: (text: string) => void;
}

// A personal, reusable library of prewritten blocks ("extensions"). Private to
// the user; clicking one drops its text into the active grid cell or speech doc.
export default function SnippetLibrary({ userId, onClose, onInsert }: SnippetLibraryProps) {
  const [snippets, setSnippets] = useState<FlowSnippet[]>([]);
  const [label, setLabel] = useState("");
  const [body, setBody] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .from("flow_snippets")
      .select("id, owner_id, label, body, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }) => { if (active && data) setSnippets(data as FlowSnippet[]); });
    return () => { active = false; };
  }, [userId]);

  async function add() {
    if (!body.trim()) return;
    setAdding(true);
    const { data } = await supabase
      .from("flow_snippets")
      .insert({ owner_id: userId, label: label.trim() || "Snippet", body })
      .select("id, owner_id, label, body, created_at")
      .single();
    setAdding(false);
    if (data) {
      setSnippets((prev) => [data as FlowSnippet, ...prev]);
      setLabel(""); setBody("");
    }
  }

  async function del(id: string) {
    setSnippets((prev) => prev.filter((s) => s.id !== id));
    await supabase.from("flow_snippets").delete().eq("id", id);
  }

  return (
    <aside className="flow-snip">
      <div className="flow-snip__head">
        <span className="flow-panel__title">Extensions</span>
        <button className="flow-icon-btn" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="flow-snip__add">
        <input
          className="db-input"
          placeholder="Label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={{ height: 38, fontSize: 13 }}
        />
        <textarea
          className="db-textarea"
          placeholder="Prewritten text…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={{ minHeight: 64, fontSize: 13 }}
        />
        <button className="db-btn db-btn--accent db-btn--sm" onClick={add} disabled={adding || !body.trim()}>
          {adding ? "…" : "Save extension"}
        </button>
      </div>

      <div className="flow-snip__list">
        {snippets.length === 0 ? (
          <p className="flow-snip__empty">No saved extensions yet.</p>
        ) : (
          snippets.map((s) => (
            <div className="flow-snip__item" key={s.id}>
              <button
                className="flow-snip__insert"
                title={s.body}
                onMouseDown={(e) => e.preventDefault()} // keep caret in the active editor
                onClick={() => onInsert(s.body)}
              >
                <span className="flow-snip__label">{s.label}</span>
                <span className="flow-snip__preview">{s.body}</span>
              </button>
              <button className="flow-icon-btn flow-snip__del" onClick={() => del(s.id)} aria-label="Delete">×</button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
