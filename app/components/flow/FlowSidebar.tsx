"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { type Flow, type FlowFolder } from "@/app/flow/shared";

// Left rail: lists the user's flows (owned + shared), organized into folders,
// with +aff / +neg create buttons. Lives in the /flow layout so it persists
// across flow switches. Active flow is highlighted via the route param. Mounting
// this also toggles the html.flow-route class that auto-hides the site nav rail.
export default function FlowSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const activeId = (params?.id as string) ?? "";
  const [userId, setUserId] = useState("");
  const [flows, setFlows] = useState<Flow[]>([]);
  const [folders, setFolders] = useState<FlowFolder[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // Auto-hide the site's vertical nav rail while in the flow workspace.
  useEffect(() => {
    document.documentElement.classList.add("flow-route");
    return () => document.documentElement.classList.remove("flow-route");
  }, []);

  // Refetch whenever the route changes (covers create/navigate).
  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const uid = session.user.id;
      if (!active) return;
      setUserId(uid);

      const [{ data: owned }, { data: shared }, { data: folderData }] = await Promise.all([
        supabase.from("flows").select("*").eq("owner_id", uid),
        supabase.from("flow_collaborators").select("flows(*)").eq("user_id", uid),
        supabase.from("flow_folders").select("*").eq("owner_id", uid),
      ]);

      const sharedFlows = (shared ?? [])
        .map((r) => (r as unknown as { flows: Flow | Flow[] | null }).flows)
        .flatMap((f) => (Array.isArray(f) ? f : f ? [f] : []));
      const merged = new Map<string, Flow>();
      for (const f of [...(owned ?? []), ...sharedFlows] as Flow[]) merged.set(f.id, f);
      if (!active) return;
      setFlows([...merged.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
      setFolders(((folderData ?? []) as FlowFolder[]).sort((a, b) => a.created_at.localeCompare(b.created_at)));
    }
    load();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  async function createFlow(side: "aff" | "neg") {
    if (creating) return;
    setError("");
    setCreating(true);
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    const uid = user?.id;
    if (authErr || !uid) {
      setError("Your session expired — please sign out and sign back in.");
      setCreating(false);
      return;
    }

    const { data: flow, error: insErr } = await supabase
      .from("flows")
      .insert({ owner_id: uid, title: side === "aff" ? "New Aff" : "New Neg", side })
      .select("*")
      .single();
    if (insErr || !flow) {
      console.error("createFlow failed:", insErr);
      setError(insErr?.message ?? "Could not create flow.");
      setCreating(false);
      return;
    }
    // Seed one card in the first column so the sheet is usable immediately;
    // Enter stacks below, Tab responds in the next column.
    await supabase.from("flow_cells").insert(
      { flow_id: flow.id, col: 0, row_index: 0, content: "", updated_by: uid }
    );
    setCreating(false);
    router.push(`/flow/${flow.id}`);
  }

  async function createFolder() {
    const { data: { user } } = await supabase.auth.getUser();
    const uid = user?.id;
    if (!uid) { setError("Your session expired — please sign out and sign back in."); return; }
    const { data, error: e } = await supabase
      .from("flow_folders")
      .insert({ owner_id: uid, name: "New folder" })
      .select("*")
      .single();
    if (e || !data) { setError(e?.message ?? "Could not create folder."); return; }
    setFolders((prev) => [...prev, data as FlowFolder]);
    setRenamingFolder((data as FlowFolder).id);
  }

  async function saveTitle(id: string, title: string) {
    setRenaming(null);
    const clean = title.trim() || "Untitled";
    setFlows((prev) => prev.map((f) => (f.id === id ? { ...f, title: clean } : f)));
    await supabase.from("flows").update({ title: clean }).eq("id", id);
  }

  async function saveFolderName(id: string, name: string) {
    setRenamingFolder(null);
    const clean = name.trim() || "Folder";
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: clean } : f)));
    await supabase.from("flow_folders").update({ name: clean }).eq("id", id);
  }

  async function deleteFolder(id: string) {
    setFolders((prev) => prev.filter((f) => f.id !== id));
    setFlows((prev) => prev.map((f) => (f.folder_id === id ? { ...f, folder_id: null } : f)));
    await supabase.from("flow_folders").delete().eq("id", id);
  }

  async function moveFlow(flowId: string, folderId: string | null) {
    setFlows((prev) => prev.map((f) => (f.id === flowId ? { ...f, folder_id: folderId } : f)));
    await supabase.from("flows").update({ folder_id: folderId }).eq("id", flowId);
  }

  async function deleteFlow(flowId: string) {
    if (!window.confirm("Delete this flow? Its grid, speech, and shares are removed for everyone.")) return;
    setFlows((prev) => prev.filter((f) => f.id !== flowId));
    await supabase.from("flows").delete().eq("id", flowId);
    if (activeId === flowId) router.push("/flow");
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  const myFolderIds = new Set(folders.map((f) => f.id));
  const flowsIn = (folderId: string) => flows.filter((f) => f.folder_id === folderId);
  const ungrouped = flows.filter((f) => !f.folder_id || !myFolderIds.has(f.folder_id));

  function renderFlow(f: Flow) {
    return (
      <div key={f.id} className={`flow-rail__item ${f.id === activeId ? "is-active" : ""}`}>
        {renaming === f.id ? (
          <input
            className="flow-rail__rename"
            defaultValue={f.title}
            autoFocus
            onBlur={(e) => saveTitle(f.id, e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          />
        ) : (
          <>
            <button
              className="flow-rail__link"
              onClick={() => router.push(`/flow/${f.id}`)}
              onDoubleClick={() => f.owner_id === userId && setRenaming(f.id)}
              title="Double-click to rename"
            >
              <span className={`flow-rail__dot flow-rail__dot--${f.side ?? "other"}`} />
              {f.title}
            </button>
            {f.owner_id === userId && folders.length > 0 && (
              <select
                className="flow-rail__move"
                value={f.folder_id && myFolderIds.has(f.folder_id) ? f.folder_id : ""}
                onChange={(e) => moveFlow(f.id, e.target.value || null)}
                onClick={(e) => e.stopPropagation()}
                title="Move to folder"
                aria-label="Move to folder"
              >
                <option value="">No folder</option>
                {folders.map((fo) => <option key={fo.id} value={fo.id}>{fo.name}</option>)}
              </select>
            )}
            {f.owner_id === userId && (
              <button
                className="flow-icon-btn flow-rail__del"
                onClick={(e) => { e.stopPropagation(); deleteFlow(f.id); }}
                title="Delete flow"
                aria-label="Delete flow"
              >×</button>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <nav className="flow-rail" aria-label="Flows">
      <div className="flow-rail__top">
        <p className="flow-rail__brand">Flows</p>
        <button className="flow-icon-btn" onClick={createFolder} title="New folder" aria-label="New folder">＋▢</button>
      </div>

      <div className="flow-rail__list">
        {folders.map((fo) => {
          const items = flowsIn(fo.id);
          const isCollapsed = collapsed.has(fo.id);
          return (
            <div key={fo.id} className="flow-rail__folder">
              <div className="flow-rail__folder-head">
                <button className="flow-rail__caret" onClick={() => toggleCollapse(fo.id)} aria-label="Toggle folder">
                  {isCollapsed ? "▸" : "▾"}
                </button>
                {renamingFolder === fo.id ? (
                  <input
                    className="flow-rail__rename"
                    defaultValue={fo.name}
                    autoFocus
                    onBlur={(e) => saveFolderName(fo.id, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  />
                ) : (
                  <button
                    className="flow-rail__folder-name"
                    onClick={() => toggleCollapse(fo.id)}
                    onDoubleClick={() => setRenamingFolder(fo.id)}
                    title="Double-click to rename"
                  >
                    {fo.name}
                  </button>
                )}
                <span className="flow-rail__count">{items.length}</span>
                <button className="flow-icon-btn flow-rail__folder-del" onClick={() => deleteFolder(fo.id)} aria-label="Delete folder">×</button>
              </div>
              {!isCollapsed && <div className="flow-rail__folder-body">{items.map(renderFlow)}</div>}
            </div>
          );
        })}

        {ungrouped.length > 0 && (
          <div className="flow-rail__group">
            {folders.length > 0 && <p className="flow-rail__group-label">No folder</p>}
            {ungrouped.map(renderFlow)}
          </div>
        )}
      </div>

      {error && <p className="flow-rail__error">⚑ {error}</p>}
      <div className="flow-rail__create">
        <button className="flow-rail__new" onClick={() => createFlow("aff")} disabled={creating}>+ aff</button>
        <button className="flow-rail__new" onClick={() => createFlow("neg")} disabled={creating}>+ neg</button>
      </div>
    </nav>
  );
}
