"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { parseAtSections } from "@/lib/docxImport";
import type { FlowSnippet, ExtensionPoint } from "@/app/flow/shared";

const SEL = "id, owner_id, label, body, points, shortcut, created_at";

// Full-page library for managing all of a user's extensions (debate blocks):
// search, sort, import an AT .docx, add by hand, assign shortcuts, delete.
export default function ExtensionsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [snippets, setSnippets] = useState<FlowSnippet[]>([]);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "az">("recent");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      if (!active) return;
      setUserId(session.user.id);
      const { data } = await supabase.from("flow_snippets").select(SEL).eq("owner_id", session.user.id).order("created_at", { ascending: false });
      if (active && data) setSnippets(data as FlowSnippet[]);
    })();
    return () => { active = false; };
  }, [router]);

  const slug = (v: string) => v.replace(/[^a-z0-9]/gi, "").toLowerCase();

  async function add() {
    if (!body.trim() || !userId) return;
    setBusy(true);
    const { data } = await supabase.from("flow_snippets").insert({ owner_id: userId, label: label.trim() || "Extension", body }).select(SEL).single();
    setBusy(false);
    if (data) { setSnippets((p) => [data as FlowSnippet, ...p]); setLabel(""); setBody(""); setAdding(false); }
  }
  async function del(id: string) {
    setSnippets((p) => p.filter((s) => s.id !== id));
    await supabase.from("flow_snippets").delete().eq("id", id);
  }
  async function saveShortcut(id: string, shortcut: string | null) {
    setSnippets((p) => p.map((s) => (s.id === id ? { ...s, shortcut } : s)));
    await supabase.from("flow_snippets").update({ shortcut }).eq("id", id);
  }
  async function saveName(id: string, name: string) {
    setRenamingId(null);
    const clean = name.trim() || "Extension";
    setSnippets((p) => p.map((s) => (s.id === id ? { ...s, label: clean } : s)));
    await supabase.from("flow_snippets").update({ label: clean }).eq("id", id);
  }
  async function importAt(file: File) {
    setError(""); setBusy(true);
    let sections: { label: string; body: string; points: ExtensionPoint[] }[] = [];
    try { sections = await parseAtSections(await file.arrayBuffer()); }
    catch { setError("Couldn't read that .docx."); setBusy(false); return; }
    if (!sections.length) { setError("No sections found — needs Heading 1-3 titles and Heading 4 tags."); setBusy(false); return; }
    const { data } = await supabase.from("flow_snippets").insert(sections.map((s) => ({ owner_id: userId, label: s.label, body: s.body, points: s.points }))).select(SEL);
    setBusy(false);
    if (data) setSnippets((p) => [...(data as FlowSnippet[]), ...p]);
  }

  const q = query.trim().toLowerCase();
  const view = snippets
    .filter((s) => !q || s.label.toLowerCase().includes(q) || s.body.toLowerCase().includes(q))
    .slice()
    .sort((a, b) => (sortBy === "az" ? a.label.localeCompare(b.label) : b.created_at.localeCompare(a.created_at)));

  return (
    <div className="extlib">
      <header className="extlib__head">
        <Link href="/flow" className="extlib__back">← Flows</Link>
        <h1 className="extlib__title">Extensions</h1>
        <p className="extlib__sub">
          {snippets.length === 0 ? "Your block library" : `${snippets.length} block${snippets.length === 1 ? "" : "s"} in your library`}
        </p>
      </header>

      <div className="extlib__toolbar">
        <input className="extlib__search" placeholder="Search blocks…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="extlib__sort" value={sortBy} onChange={(e) => setSortBy(e.target.value as "recent" | "az")}>
          <option value="recent">Recent</option>
          <option value="az">A–Z</option>
        </select>
        <button className="db-btn db-btn--glass db-btn--sm" onClick={() => fileRef.current?.click()} disabled={busy}>⬆ Import AT doc</button>
        <button className="db-btn db-btn--accent db-btn--sm" onClick={() => setAdding((a) => !a)}>+ New block</button>
        <input ref={fileRef} type="file" accept=".docx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importAt(f); e.target.value = ""; }} />
      </div>

      {adding && (
        <div className="extlib__add">
          <input className="extlib__addname" placeholder="Block name" value={label} onChange={(e) => setLabel(e.target.value)} />
          <textarea className="extlib__addbody" placeholder="Card text…" value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="extlib__addbtns">
            <button className="db-btn db-btn--accent db-btn--sm" onClick={add} disabled={busy || !body.trim()}>{busy ? "…" : "Save block"}</button>
            <button className="db-btn db-btn--ghost db-btn--sm" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      {error && <p className="extlib__error">⚑ {error}</p>}

      {view.length === 0 ? (
        <div className="extlib__empty">
          <p className="extlib__empty-title">{snippets.length === 0 ? "No blocks yet" : `No matches for “${query}”`}</p>
          {snippets.length === 0 && <p className="extlib__empty-sub">Import an AT file (.docx) to turn its sections into reusable blocks, or add one by hand.</p>}
        </div>
      ) : (
        <div className="extlib__grid">
          {view.map((s) => {
            const count = s.points?.length ?? 0;
            return (
              <article className="extcard" key={s.id}>
                <div className="extcard__top">
                  {renamingId === s.id ? (
                    <input
                      className="extcard__rename"
                      defaultValue={s.label}
                      autoFocus
                      onBlur={(e) => saveName(s.id, e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenamingId(null); }}
                    />
                  ) : (
                    <h2 className="extcard__name" onDoubleClick={() => setRenamingId(s.id)} title="Double-click to rename">{s.label}</h2>
                  )}
                  {count > 0 && <span className="extcard__count">{count} pt{count === 1 ? "" : "s"}</span>}
                </div>
                <p className="extcard__preview">{s.body || "No text"}</p>
                <div className="extcard__foot">
                  <span className="extcard__slash">/</span>
                  <input
                    className="extcard__trigger"
                    defaultValue={s.shortcut ?? ""}
                    placeholder="trigger"
                    title="Slash trigger — type /trigger + Enter in a flow point"
                    onBlur={(e) => saveShortcut(s.id, slug(e.target.value) || null)}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  />
                  <span className="extcard__spacer" />
                  <button className="extcard__del" onClick={() => setRenamingId(s.id)} aria-label="Rename block">Rename</button>
                  <button className="extcard__del" onClick={() => del(s.id)} aria-label="Delete block">Delete</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
