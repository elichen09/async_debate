"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { parseAtSections, rowsFor, triggerNamePart } from "@/lib/docxImport";
import { useConfirm } from "@/app/components/flow/ConfirmProvider";
import type { FlowSnippet, FlowSnippetFolder, ExtensionPoint } from "@/app/flow/shared";

const SEL = "id, owner_id, label, body, points, shortcut, parent_id, folder_id, sort_order, created_at";

type SortBy = "recent" | "az";
// What the cursor is hovering over while dragging, for the drop highlight.
type DropTarget = { kind: "card-group"; id: string } | { kind: "folder"; id: string | null } | null;

// Full-page library for managing all of a user's extensions (debate blocks):
// search, sort, organize into (collapsible) folders, nest one block under
// another, import an AT .docx, add by hand, assign shortcuts, delete.
export default function ExtensionsPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [userId, setUserId] = useState("");
  const [snippets, setSnippets] = useState<FlowSnippet[]>([]);
  const [folders, setFolders] = useState<FlowSnippetFolder[]>([]);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set()); // collapsed until expanded
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      if (!active) return;
      setUserId(session.user.id);
      const [snips, folds] = await Promise.all([
        supabase.from("flow_snippets").select(SEL).eq("owner_id", session.user.id),
        supabase.from("flow_snippet_folders").select("*").eq("owner_id", session.user.id),
      ]);
      if (!active) return;
      if (snips.data) setSnippets(snips.data as FlowSnippet[]);
      if (folds.data) setFolders(folds.data as FlowSnippetFolder[]);
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
  // Set a block's trigger AND re-chain every descendant's trigger under it, since
  // triggers chain a parent's onto the child's ("arctic:russiawar"). Each child's
  // own segment comes from its label (triggerNamePart), so renaming a parent
  // cascades to the whole subtree.
  function recomputeSubtree(rootId: string, rootTrigger: string) {
    const updates: { id: string; shortcut: string | null }[] = [];
    const walk = (nodeId: string, trig: string) => {
      updates.push({ id: nodeId, shortcut: trig || null });
      for (const c of snippets.filter((s) => s.parent_id === nodeId)) {
        const own = triggerNamePart(c.label);
        walk(c.id, trig ? (own ? `${trig}:${own}` : trig) : own);
      }
    };
    walk(rootId, rootTrigger);
    setSnippets((prev) => prev.map((s) => { const u = updates.find((x) => x.id === s.id); return u ? { ...s, shortcut: u.shortcut } : s; }));
    Promise.all(updates.map((u) => supabase.from("flow_snippets").update({ shortcut: u.shortcut }).eq("id", u.id)));
  }
  // Manual trigger edit: use the typed value for this block, re-chain its subtree.
  function saveShortcut(id: string, shortcut: string | null) {
    recomputeSubtree(id, shortcut ?? "");
  }
  async function saveName(id: string, name: string) {
    setRenamingId(null);
    const clean = name.trim() || "Extension";
    setSnippets((p) => p.map((s) => (s.id === id ? { ...s, label: clean } : s)));
    await supabase.from("flow_snippets").update({ label: clean }).eq("id", id);
    // Recompute this block's trigger from its new name (chained under its parent's
    // current trigger) and cascade to all descendants.
    const node = snippets.find((s) => s.id === id);
    const parent = node?.parent_id ? snippets.find((s) => s.id === node.parent_id) : null;
    const prefix = (parent?.shortcut ?? "").trim();
    const own = triggerNamePart(clean);
    const trig = prefix ? (own ? `${prefix}:${own}` : prefix) : own;
    recomputeSubtree(id, trig);
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

  // --- Folders -------------------------------------------------------------
  async function newFolder() {
    if (!userId) return;
    const ord = folders.length ? Math.max(...folders.map((f) => f.sort_order)) + 1 : 0;
    const { data } = await supabase.from("flow_snippet_folders").insert({ owner_id: userId, name: "New folder", sort_order: ord }).select("*").single();
    if (data) setFolders((p) => [...p, data as FlowSnippetFolder]);
  }
  async function renameFolder(id: string, name: string) {
    setRenamingFolderId(null);
    const clean = name.trim() || "Folder";
    setFolders((p) => p.map((f) => (f.id === id ? { ...f, name: clean } : f)));
    await supabase.from("flow_snippet_folders").update({ name: clean }).eq("id", id);
  }
  async function deleteFolder(id: string) {
    const ok = await confirm({
      title: "Delete this folder?",
      message: "Its blocks move back to Ungrouped (they aren't deleted).",
      confirmLabel: "Delete folder",
      tone: "danger",
    });
    if (!ok) return;
    setSnippets((p) => p.map((s) => (s.folder_id === id ? { ...s, folder_id: null } : s)));
    setFolders((p) => p.filter((f) => f.id !== id));
    await supabase.from("flow_snippets").update({ folder_id: null }).eq("folder_id", id);
    await supabase.from("flow_snippet_folders").delete().eq("id", id);
  }

  // --- Drag & drop ---------------------------------------------------------
  const q = query.trim().toLowerCase();
  const matches = (s: FlowSnippet) => !q || s.label.toLowerCase().includes(q) || s.body.toLowerCase().includes(q);
  const sortFn = (a: FlowSnippet, b: FlowSnippet) =>
    sortBy === "az" ? a.label.localeCompare(b.label) : b.created_at.localeCompare(a.created_at);
  const byId = new Map(snippets.map((s) => [s.id, s]));
  const isChild = (s: FlowSnippet) => !!(s.parent_id && byId.has(s.parent_id));
  const childrenOf = (id: string) => snippets.filter((s) => s.parent_id === id).sort(sortFn);
  const topLevelIn = (folderId: string | null) =>
    snippets.filter((s) => !isChild(s) && (s.folder_id ?? null) === folderId).sort(sortFn);

  // Is `id` inside the subtree rooted at `ancestorId`? (Blocks a block being
  // dropped into its own descendant, which would orphan the subtree.)
  function isDescendant(id: string, ancestorId: string): boolean {
    let cur = byId.get(id);
    const seen = new Set<string>();
    while (cur?.parent_id && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.parent_id === ancestorId) return true;
      cur = byId.get(cur.parent_id);
    }
    return false;
  }

  async function patch(id: string, p: Partial<FlowSnippet>) {
    setSnippets((prev) => prev.map((s) => (s.id === id ? { ...s, ...p } : s)));
    await supabase.from("flow_snippets").update(p).eq("id", id);
  }

  // Drop a block onto another block → nest the dragged block under it.
  function groupUnder(srcId: string, targetId: string) {
    if (srcId === targetId || isDescendant(targetId, srcId)) return;
    const target = byId.get(targetId);
    if (!target) return;
    patch(srcId, { parent_id: targetId, folder_id: target.folder_id ?? null });
    setExpanded((prev) => new Set(prev).add(targetId));
  }
  // Drop onto a folder (or Ungrouped) → move to its top level (ungroup).
  function moveToFolder(srcId: string, folderId: string | null) {
    patch(srcId, { folder_id: folderId, parent_id: null });
  }

  function onCardDrop(e: React.DragEvent, target: FlowSnippet) {
    e.preventDefault();
    e.stopPropagation();
    const src = dragId;
    setDragId(null); setDropTarget(null);
    if (src) groupUnder(src, target.id);
  }
  function onFolderDrop(e: React.DragEvent, folderId: string | null) {
    e.preventDefault();
    const src = dragId;
    setDragId(null); setDropTarget(null);
    if (src) moveToFolder(src, folderId);
  }

  function toggle(id: string) {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function card(s: FlowSnippet, child = false) {
    const count = s.points?.length ?? 0;
    const kids = childrenOf(s.id);
    const open = expanded.has(s.id);
    const dt = dropTarget;
    const cls = [
      "extcard",
      child ? "extcard--child" : "",
      dragId === s.id ? "is-drag" : "",
      dt && dt.kind === "card-group" && dt.id === s.id ? "is-drop-group" : "",
    ].filter(Boolean).join(" ");
    return (
      <article
        className={cls}
        key={s.id}
        draggable={!q}
        onDragStart={(e) => { e.stopPropagation(); setDragId(s.id); e.dataTransfer.effectAllowed = "move"; }}
        onDragEnd={() => { setDragId(null); setDropTarget(null); }}
        onDragOver={(e) => {
          if (!dragId || dragId === s.id) return;
          e.preventDefault(); e.stopPropagation();
          setDropTarget({ kind: "card-group", id: s.id });
        }}
        onDrop={(e) => onCardDrop(e, s)}
      >
        <div className="extcard__top">
          {!q && <span className="extcard__grip" title="Drag onto another block to nest it · drag onto a folder to move it in">⠿</span>}
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
            key={s.shortcut ?? "none"}
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

  function toggleFolder(id: string) {
    setOpenFolders((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function folderSection(folder: FlowSnippetFolder | null) {
    const fid = folder ? folder.id : null;
    const blocks = topLevelIn(fid);
    if (folder === null && blocks.length === 0 && folders.length > 0) return null; // hide empty Ungrouped only when folders exist
    const isDropping = dropTarget?.kind === "folder" && dropTarget.id === fid;
    const showHead = folder || folders.length > 0;
    // Real folders are collapsible (collapsed until expanded); Ungrouped is always open.
    const open = folder ? openFolders.has(folder.id) : true;
    return (
      <section
        className={`extfolder ${isDropping ? "is-drop" : ""}`}
        key={folder ? folder.id : "ungrouped"}
        onDragOver={(e) => { if (dragId) { e.preventDefault(); setDropTarget({ kind: "folder", id: fid }); } }}
        onDrop={(e) => onFolderDrop(e, fid)}
      >
        {showHead && (
        <header className="extfolder__head">
          {folder ? (
            <button className="extfolder__chev" onClick={() => toggleFolder(folder.id)} aria-label={open ? "Collapse folder" : "Expand folder"}>{open ? "▾" : "▸"}</button>
          ) : (
            <span className="extfolder__icon">▢</span>
          )}
          <span className="extfolder__icon">{folder ? "📁" : ""}</span>
          {folder && renamingFolderId === folder.id ? (
            <input className="extcard__rename" defaultValue={folder.name} autoFocus onBlur={(e) => renameFolder(folder.id, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenamingFolderId(null); }} />
          ) : (
            <h2 className="extfolder__name" onClick={() => folder && toggleFolder(folder.id)} onDoubleClick={() => folder && setRenamingFolderId(folder.id)} title={folder ? "Click to expand · double-click to rename" : undefined}>
              {folder ? folder.name : "Ungrouped"}
            </h2>
          )}
          <span className="extfolder__count">{blocks.length}</span>
          {folder && (
            <span className="extfolder__tools">
              <button className="extcard__del" onClick={() => setRenamingFolderId(folder.id)}>Rename</button>
              <button className="extcard__del" onClick={() => deleteFolder(folder.id)}>Delete</button>
            </span>
          )}
        </header>
        )}
        {open && (blocks.length === 0 ? (
          <p className="extfolder__empty">Drag blocks here</p>
        ) : (
          <div className="extlib__grid">{blocks.map((s) => card(s))}</div>
        ))}
      </section>
    );
  }

  // Search → flat matches (no folders/drag). Otherwise folders + Ungrouped.
  const flat = snippets.filter(matches).sort(sortFn);
  const sortedFolders = [...folders].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));

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
        <select className="extlib__sort" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
          <option value="recent">Recent</option>
          <option value="az">A–Z</option>
        </select>
        <button className="db-btn db-btn--glass db-btn--sm" onClick={newFolder}>+ Folder</button>
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

      {snippets.length === 0 ? (
        <div className="extlib__empty">
          <p className="extlib__empty-title">No blocks yet</p>
          <p className="extlib__empty-sub">Import an AT file (.docx) to turn its sections into reusable blocks, or add one by hand.</p>
        </div>
      ) : q ? (
        flat.length === 0 ? (
          <div className="extlib__empty"><p className="extlib__empty-title">No matches for “{query}”</p></div>
        ) : (
          <div className="extlib__grid">{flat.map((s) => card(s))}</div>
        )
      ) : (
        <div className="extlib__folders">
          {sortedFolders.map((f) => folderSection(f))}
          {folderSection(null)}
          {!q && <p className="extlib__hint">Drag a block onto another block to nest it · drag onto a folder to move it in</p>}
        </div>
      )}
    </div>
  );
}
