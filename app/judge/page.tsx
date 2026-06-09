"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { CSSProperties } from "react";

interface Round {
  id: string;
  topic: string;
  created_at: string;
  pro: { username: string; elo: number };
  con: { username: string; elo: number };
}

export default function JudgeDashboard() {
  const router = useRouter();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [claimedRounds, setClaimedRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [isBanned, setIsBanned] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const uid = session.user.id;

      const { data: profile } = await supabase
        .from("profiles").select("is_banned_from_judging").eq("id", uid).single();
      if (profile?.is_banned_from_judging) { setIsBanned(true); setLoading(false); return; }

      const [{ data: unclaimed }, { data: claimed }] = await Promise.all([
        supabase.from("rounds").select(`id, topic, created_at, pro:profiles!pro_id(username, elo), con:profiles!con_id(username, elo)`)
          .eq("status", "judging").is("judge_id", null).neq("pro_id", uid).neq("con_id", uid).order("created_at", { ascending: true }),
        supabase.from("rounds").select(`id, topic, created_at, pro:profiles!pro_id(username, elo), con:profiles!con_id(username, elo)`)
          .eq("status", "judging").eq("judge_id", uid).order("created_at", { ascending: true }),
      ]);

      setRounds((unclaimed || []) as unknown as Round[]);
      setClaimedRounds((claimed || []) as unknown as Round[]);
      setLoading(false);
    }
    load();
  }, []);

  async function handleClaim(roundId: string) {
    setClaiming(roundId);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase.from("rounds").update({ judge_id: session.user.id }).eq("id", roundId);
    router.push(`/judge/${roundId}`);
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100dvh - 44px)" }}>
      <div className="db-card" style={{ padding: "28px 40px", textAlign: "center" }}>
        <div className="gh-loading-dots"><span /><span /><span /></div>
      </div>
    </div>
  );

  if (isBanned) return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "0 clamp(24px, 5vw, 48px) 100px" }}>
      <div style={{ paddingTop: "clamp(20px, 4vh, 36px)" }}>
        <button onClick={() => router.push("/dashboard")} style={backBtn}>← Back</button>
      </div>
      <h1 style={{ ...heroTitle, marginTop: "clamp(20px, 4vh, 32px)" }}>Judge</h1>
      <div style={rule}><div style={ruleDot} /><div style={ruleLine} /></div>
      <p style={{ fontSize: 15, color: "oklch(0.70 0.20 28)", textShadow: "0 1px 5px rgba(0,0,0,0.35)" }}>
        Judging privileges removed.
      </p>
      <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", marginTop: 8, textShadow: "0 1px 5px rgba(0,0,0,0.35)" }}>
        Your ballot was reported. Contact an admin to appeal.
      </p>
    </div>
  );

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "0 clamp(24px, 5vw, 48px) 100px" }}>

      <div style={{ paddingTop: "clamp(20px, 4vh, 36px)" }}>
        <button onClick={() => router.push("/dashboard")} style={backBtn}>← Back</button>
      </div>

      <section style={{ paddingTop: "clamp(20px, 4vh, 32px)" }}>
        <h1 className="ab-hero-line" style={{ '--i': '0', ...heroTitle } as CSSProperties}>Judge</h1>
        <p className="ab-hero-line" style={{ '--i': '1', fontSize: 14, color: "rgba(255,255,255,0.50)", margin: "12px 0 0", maxWidth: "48ch", lineHeight: 1.65, textShadow: "0 1px 5px rgba(0,0,0,0.35)" } as CSSProperties}>
          Judge rounds you are not a participant in. Faulty ballots can be reported — repeated reports remove judging access.
        </p>
      </section>

      <div style={rule}><div style={ruleDot} /><div style={ruleLine} /></div>

      {/* Claimed rounds */}
      {claimedRounds.length > 0 && (
        <section style={{ marginBottom: "clamp(28px, 5vh, 44px)" }}>
          <p style={eyebrow}>Your claimed rounds</p>
          {claimedRounds.map((r, idx) => (
            <div
              key={r.id}
              className="ab-step-in"
              style={{ '--i': String(idx), borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "18px 0" } as CSSProperties}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: "0 0 5px", fontSize: 15, fontWeight: 500, color: "#fff", textShadow: "0 1px 8px rgba(0,0,0,0.38)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.topic}
                  </p>
                  <p style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,255,255,0.38)", letterSpacing: "0.04em" }}>
                    @{r.pro?.username} (Pro {r.pro?.elo}) · @{r.con?.username} (Con {r.con?.elo})
                  </p>
                </div>
              </div>
              <button onClick={() => router.push(`/judge/${r.id}`)} className="db-btn db-btn--accent db-btn--sm">
                Continue judging →
              </button>
            </div>
          ))}
          <div style={rule}><div style={{ ...ruleDot, background: "rgba(255,255,255,0.20)" }} /><div style={ruleLine} /></div>
        </section>
      )}

      {/* Available rounds */}
      <section>
        <p style={eyebrow}>
          {rounds.length === 0
            ? "No rounds waiting"
            : `${rounds.length} round${rounds.length !== 1 ? "s" : ""} awaiting judgment`}
        </p>

        {rounds.length === 0 && claimedRounds.length === 0 && (
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.40)", textShadow: "0 1px 5px rgba(0,0,0,0.35)" }}>
            Check back later — no rounds are available to judge right now.
          </p>
        )}

        {rounds.map((r, idx) => (
          <div
            key={r.id}
            className="ab-step-in"
            style={{ '--i': String(idx), borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "18px 0" } as CSSProperties}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: "0 0 5px", fontSize: 15, fontWeight: 500, color: "#fff", textShadow: "0 1px 8px rgba(0,0,0,0.38)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.topic}
                </p>
                <p style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,255,255,0.38)", letterSpacing: "0.04em" }}>
                  @{r.pro?.username} (Pro {r.pro?.elo}) · @{r.con?.username} (Con {r.con?.elo})
                </p>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,255,255,0.30)", flexShrink: 0 }}>
                {new Date(r.created_at).toLocaleDateString()}
              </span>
            </div>
            <button
              onClick={() => handleClaim(r.id)}
              disabled={claiming === r.id}
              className="db-btn db-btn--accent db-btn--sm"
            >
              {claiming === r.id ? "Claiming…" : "Claim round →"}
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}

const backBtn: CSSProperties = { background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 13, color: "rgba(255,255,255,0.65)", padding: "8px 0", textShadow: "0 1px 4px rgba(0,0,0,0.35)" };
const heroTitle: CSSProperties = { fontFamily: "var(--font-display)", fontSize: "clamp(56px, 12vw, 110px)", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", margin: 0, lineHeight: 0.92, textShadow: "0 2px 20px rgba(0,0,0,0.45), 0 8px 40px rgba(0,0,0,0.22)" };
const eyebrow: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)", margin: "0 0 4px", textShadow: "0 1px 4px rgba(0,0,0,0.30)" };
const rule: CSSProperties = { display: "flex", alignItems: "center", gap: 12, margin: "clamp(28px, 5vh, 44px) 0" };
const ruleDot: CSSProperties = { width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 };
const ruleLine: CSSProperties = { flex: 1, height: 1, background: "rgba(255,255,255,0.15)" };
