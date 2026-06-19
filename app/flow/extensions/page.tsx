"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { parseAtSections, rowsFor } from "@/lib/docxImport";
import type { FlowSnippet, ExtensionPoint } from "@/app/flow/shared";

const SEL = "id, owner_id, label, body, points, shortcut, parent_id, created_at";

// Full-page library for managing all of a user's extensions (debate blocks):
// search, sort, import an AT .docx, add by hand, assign shortcuts, delete.
export default function ExtensionsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [snippets, setSnippets] = useState<FlowSnippet[]>([]);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "az">("recent");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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

  // Triggers may contain ":" to chain sub-blocks (e.g. "arctic:topshelf").
  const slug = (v: string) => v.replace(/[^a-z0-9:]/gi, "").toLowerCase();

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
    let sections: { label: string; body: string; points: ExtensionPoint[]; level: number }[] = [];
    try { sections = await parseAtSections(await file.arrayBuffer()); }
    catch { setError("Couldn't read that .docx."); setBusy(false); return; }
    if (!sections.length) { setError("No sections found — needs Heading 1-3 titles and Heading 4 tags."); setBusy(false); return; }
    const { data } = await supabase.from("flow_snippets").insert(rowsFor(sections, userId)).select(SEL);
    setBusy(false);
    if (data) setSnippets((p) => [...(data as FlowSnippet[]), ...p]);
  }

  const q = query.trim().toLowerCase();
  const matches = (s: FlowSnippet) => !q || s.label.toLowerCase().includes(q) || s.body.toLowerCase().includes(q);
  const sortFn = (a: FlowSnippet, b: FlowSnippet) => (sortBy === "az" ? a.label.localeCompare(b.label) : b.created_at.localeCompare(a.created_at));
  const byId = new Map(snippets.map((s) => [s.id, s]));
  const isChild = (s: FlowSnippet) => !!(s.parent_id && byId.has(s.parent_id));
  const childrenOf = (id: string) => snippets.filter((s) => s.parent_id === id).sort(sortFn);
  // No query → hierarchy: top-level blocks, expand to reveal sub-blocks. Query → flat.
  const list = q ? snippets.filter(matches).sort(sortFn) : snippets.filter((s) => !isChild(s)).sort(sortFn);

  function toggle(id: string) {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function card(s: FlowSnippet, child = false) {
    const count = s.points?.length ?? 0;
    const kids = childrenOf(s.id);
    const open = expanded.has(s.id);
    return (
      <article className={`extcard ${child ? "extcard--child" : ""}`} key={s.id}>
        <div className="extcard__top">
          {!q && kids.length > 0 && (
            <button className="extcard__chev" onClick={() => toggle(s.id)} aria-label={open ? "Collapse" : "Expand"}>{open ? "▾" : "▸"}</button>
          )}
          {renamingId === s.id ? (
            <input className="extcard__rename" defaultValue={s.label} autoFocus onBlur={(e) => saveName(s.id, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenamingId(null); }} />
          ) : (
            <h2 className="extcard__name" onDoubleClick={() => setRenamingId(s.id)} title="Double-click to rename">{s.label}</h2>
          )}
          {count > 0 && <span className="extcard__count">{count} pt{count === 1 ? "" : "s"}</span>}
          {!q && kids.length > 0 && <span className="extcard__count extcard__count--sub">{kids.length} sub</span>}
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
        {!q && open && kids.length > 0 && (
          <div className="extcard__children">{kids.map((k) => card(k, true))}</div>
        )}
      </article>
    );
  }

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

      {list.length === 0 ? (
        <div className="extlib__empty">
          <p className="extlib__empty-title">{snippets.length === 0 ? "No blocks yet" : `No matches for “${query}”`}</p>
          {snippets.length === 0 && <p className="extlib__empty-sub">Import an AT file (.docx) to turn its sections into reusable blocks, or add one by hand.</p>}
        </div>
      ) : (
        <div className="extlib__grid">
          {list.map((s) => card(s))}
        </div>
      )}
    </div>
  );
}
