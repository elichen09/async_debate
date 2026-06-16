"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface ShareDialogProps {
  flowId: string;
  ownerId: string;
  userId: string;
  onClose: () => void;
}

interface Collaborator {
  user_id: string;
  profile: { username: string; display_name: string } | null;
}

// Per-flow sharing: the owner invites partners by @username (mirrors the round
// pro_id/con_id model). Collaborators get full read/write via RLS.
export default function ShareDialog({ flowId, ownerId, userId, onClose }: ShareDialogProps) {
  const [collabs, setCollabs] = useState<Collaborator[]>([]);
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isOwner = userId === ownerId;

  async function load() {
    const { data } = await supabase
      .from("flow_collaborators")
      .select("user_id, profile:profiles!user_id(username, display_name)")
      .eq("flow_id", flowId);
    if (data) setCollabs(data as unknown as Collaborator[]);
  }

  useEffect(() => {
    let active = true;
    supabase
      .from("flow_collaborators")
      .select("user_id, profile:profiles!user_id(username, display_name)")
      .eq("flow_id", flowId)
      .then(({ data }) => { if (active && data) setCollabs(data as unknown as Collaborator[]); });
    return () => { active = false; };
  }, [flowId]);

  async function add() {
    const name = username.trim().replace(/^@/, "");
    if (!name) return;
    setError(""); setBusy(true);
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", name)
      .single();
    if (!profile) { setError(`No user @${name}`); setBusy(false); return; }
    if (profile.id === ownerId) { setError("That's the owner."); setBusy(false); return; }
    const { error: insErr } = await supabase
      .from("flow_collaborators")
      .insert({ flow_id: flowId, user_id: profile.id });
    setBusy(false);
    if (insErr) { setError(insErr.code === "23505" ? "Already shared." : insErr.message); return; }
    setUsername("");
    load();
  }

  async function remove(uid: string) {
    setCollabs((prev) => prev.filter((c) => c.user_id !== uid));
    await supabase.from("flow_collaborators").delete().eq("flow_id", flowId).eq("user_id", uid);
  }

  return (
    <div className="flow-modal-backdrop" onClick={onClose}>
      <div className="flow-modal db-card" onClick={(e) => e.stopPropagation()}>
        <div className="flow-snip__head">
          <span className="flow-panel__title">Share flow</span>
          <button className="flow-icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        {isOwner && (
          <>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <input
                className="db-input"
                placeholder="@username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") add(); }}
                style={{ height: 42 }}
              />
              <button className="db-btn db-btn--accent" onClick={add} disabled={busy || !username.trim()} style={{ height: 42, flexShrink: 0 }}>
                {busy ? "…" : "Add"}
              </button>
            </div>
            {error && <p style={{ fontSize: 12, color: "var(--loss)", margin: "8px 0 0" }}>⚑ {error}</p>}
          </>
        )}

        <div className="flow-share__list">
          {collabs.length === 0 ? (
            <p className="flow-snip__empty">Not shared with anyone yet.</p>
          ) : (
            collabs.map((c) => (
              <div className="flow-share__row" key={c.user_id}>
                <span>@{c.profile?.username ?? "user"}</span>
                {isOwner && (
                  <button className="flow-icon-btn" onClick={() => remove(c.user_id)} aria-label="Remove">×</button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
