"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import type { CSSProperties } from "react";

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

const statusLabel = (s: string) =>
  ({ registration: "Open", active: "Live", complete: "Ended" } as Record<string, string>)[s] ?? s;

const statusColor = (s: string) =>
  s === "registration" ? "var(--accent)" : s === "active" ? "#fff" : "rgba(255,255,255,0.35)";

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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100dvh - 44px)" }}>
      <div className="db-card" style={{ padding: "28px 40px", textAlign: "center" }}>
        <div className="gh-loading-dots"><span /><span /><span /></div>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 clamp(24px, 5vw, 48px) 100px" }}>
      <style>{`.db-shell { background-image: url("/4.png") !important; }`}</style>

      <div style={{ paddingTop: "clamp(20px, 4vh, 36px)" }}>
        <button onClick={() => router.push("/dashboard")} style={backBtn}>← Back</button>
      </div>

      <section style={{ paddingTop: "clamp(20px, 4vh, 32px)", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div>
          <h1 className="ab-hero-line" style={{ '--i': '0', ...heroTitle } as CSSProperties}>Tournaments</h1>
          <p className="ab-hero-line" style={{ '--i': '1', fontSize: 14, color: "rgba(255,255,255,0.50)", margin: "10px 0 0", textShadow: "0 1px 5px rgba(0,0,0,0.35)" } as CSSProperties}>
            {tournaments.length} tournament{tournaments.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button onClick={() => router.push("/tournaments/create")} className="db-btn db-btn--accent">
          + New tournament
        </button>
      </section>

      <div style={rule}><div style={ruleDot} /><div style={ruleLine} /></div>

      {tournaments.length === 0 ? (
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", textShadow: "0 1px 5px rgba(0,0,0,0.35)" }}>
          No tournaments yet. Create the first one.
        </p>
      ) : (
        <div>
          {tournaments.map((t, i) => {
            const count = participants.filter(p => p.tournament_id === t.id).length;
            const joined = participants.some(p => p.tournament_id === t.id && p.user_id === userId);
            return (
              <Link key={t.id} href={`/tournaments/${t.id}`} style={{ textDecoration: "none" }}>
                <div
                  className="ab-step-in"
                  style={{
                    '--i': String(Math.min(i, 6)),
                    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                    gap: 20, padding: "20px 0",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    cursor: "pointer",
                  } as CSSProperties}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                      <span style={{ fontSize: "clamp(15px, 2vw, 17px)", fontWeight: 600, color: "#fff", textShadow: "0 1px 8px rgba(0,0,0,0.38)" }}>
                        {t.name}
                      </span>
                      {joined && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--accent)", textShadow: "0 1px 4px rgba(0,0,0,0.30)" }}>
                          Joined
                        </span>
                      )}
                    </div>
                    {t.topic && (
                      <p style={{ margin: "0 0 5px", fontSize: 13, color: "rgba(255,255,255,0.45)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textShadow: "0 1px 5px rgba(0,0,0,0.30)" }}>
                        {t.topic}
                      </p>
                    )}
                    <p style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,255,255,0.35)", letterSpacing: "0.04em" }}>
                      {t.size}-person bracket · {count}/{t.size} players
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: statusColor(t.status), textShadow: "0 1px 4px rgba(0,0,0,0.30)" }}>
                      {statusLabel(t.status)}
                    </span>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.28)" }}>→</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

const backBtn: CSSProperties = { background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 13, color: "rgba(255,255,255,0.65)", padding: "8px 0", textShadow: "0 1px 4px rgba(0,0,0,0.35)" };
const heroTitle: CSSProperties = { fontFamily: "var(--font-display)", fontSize: "clamp(48px, 10vw, 96px)", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", margin: 0, lineHeight: 0.92, textShadow: "0 2px 20px rgba(0,0,0,0.45), 0 8px 40px rgba(0,0,0,0.22)" };
const rule: CSSProperties = { display: "flex", alignItems: "center", gap: 12, margin: "clamp(28px, 5vh, 44px) 0" };
const ruleDot: CSSProperties = { width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 };
const ruleLine: CSSProperties = { flex: 1, height: 1, background: "rgba(255,255,255,0.15)" };
