"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

interface Tournament {
  id: string;
  name: string;
  size: 4 | 8;
  status: "registration" | "active" | "complete";
  topic: string | null;
  created_by: string;
  winner_id: string | null;
  created_at: string;
}

interface Participant {
  tournament_id: string;
  user_id: string;
}

export default function TournamentsPage() {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      setUserId(session.user.id);

      const [{ data: t }, { data: p }] = await Promise.all([
        supabase.from("tournaments").select("*").order("created_at", { ascending: false }),
        supabase.from("tournament_participants").select("tournament_id, user_id"),
      ]);

      setTournaments((t || []) as Tournament[]);
      setParticipants(p || []);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: "80px 20px" }}>
      <p className="db-card" style={{ padding: "24px 32px", color: "var(--ink-soft)" }}>Loading…</p>
    </div>
  );

  const statusLabel = (s: string) =>
    ({ registration: "Open", active: "Live", complete: "Ended" } as Record<string, string>)[s] ?? s;
  const statusColor = (s: string) =>
    s === "registration" ? "var(--accent)" : s === "active" ? "var(--pro)" : "var(--muted)";

  return (
    <div className="db-container db-page">
      <style>{`.db-shell { background-image: url("/4.png") !important; }`}</style>
      <div className="db-card db-rise" style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 24, margin: "0 0 4px", color: "var(--ink)" }}>Tournaments</h1>
          <p style={{ color: "var(--ink-soft)", margin: 0, fontSize: 13 }}>
            {tournaments.length} tournament{tournaments.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button onClick={() => router.push("/tournaments/create")} style={createBtn}>+ New</button>
      </div>

      {tournaments.length === 0 && (
        <div className="db-card db-rise" style={{ textAlign: "center", padding: "40px 24px" }}>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: 14 }}>No tournaments yet. Create the first one!</p>
        </div>
      )}

      {tournaments.map((t, i) => {
        const count = participants.filter(p => p.tournament_id === t.id).length;
        const joined = participants.some(p => p.tournament_id === t.id && p.user_id === userId);
        return (
          <Link key={t.id} href={`/tournaments/${t.id}`} style={{ textDecoration: "none" }}>
            <div
              className="db-card db-card--interactive db-rise"
              style={{ marginBottom: 10, "--i": String(i + 1) } as React.CSSProperties}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{t.name}</span>
                    {joined && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Joined
                      </span>
                    )}
                  </div>
                  {t.topic && (
                    <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.topic}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--muted)" }}>
                    <span>{t.size}-person bracket</span>
                    <span>{count}/{t.size} players</span>
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: statusColor(t.status), textTransform: "uppercase", letterSpacing: "0.09em", flexShrink: 0, marginLeft: 14 }}>
                  {statusLabel(t.status)}
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

const createBtn: React.CSSProperties = {
  height: 38, padding: "0 16px",
  background: "var(--accent)", color: "var(--accent-ink)",
  border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
};
