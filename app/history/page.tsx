"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { CSSProperties } from "react";

interface Round {
  id: string;
  topic: string;
  status: string;
  winner_id: string;
  created_at: string;
  pro_id: string;
  con_id: string;
  pro: { username: string };
  con: { username: string };
}

export default function HistoryPage() {
  const router = useRouter();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      setUserId(session.user.id);
      const { data } = await supabase
        .from("rounds")
        .select(`
          id, topic, status, winner_id, created_at, pro_id, con_id,
          pro:profiles!pro_id(username),
          con:profiles!con_id(username)
        `)
        .in("status", ["complete", "judging"])
        .or(`pro_id.eq.${session.user.id},con_id.eq.${session.user.id}`)
        .order("created_at", { ascending: false });
      setRounds((data || []) as unknown as Round[]);
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
    <>
      <style>{`.db-shell { background-image: url("/fish/fish2.png") !important; }`}</style>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 clamp(24px, 5vw, 48px) 100px" }}>

      <div style={{ paddingTop: "clamp(20px, 4vh, 36px)" }}>
        <button onClick={() => router.push("/dashboard")} style={backBtn}>← Back</button>
      </div>

      <section style={{ paddingTop: "clamp(20px, 4vh, 32px)" }}>
        <h1 className="ab-hero-line" style={{ '--i': '0', ...heroTitle } as CSSProperties}>History</h1>
        <p className="ab-hero-line" style={{ '--i': '1', fontSize: 14, color: "rgba(255,255,255,0.50)", margin: "10px 0 0", textShadow: "0 1px 5px rgba(0,0,0,0.35)" } as CSSProperties}>
          {rounds.length} round{rounds.length !== 1 ? "s" : ""} completed
        </p>
      </section>

      <div style={rule}><div style={ruleDot} /><div style={ruleLine} /></div>

      {rounds.length === 0 ? (
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", textShadow: "0 1px 5px rgba(0,0,0,0.35)" }}>
          No completed rounds yet.
        </p>
      ) : (
        <div>
          {rounds.map((r, idx) => {
            const opponent = r.pro_id === userId ? r.con : r.pro;
            const isComplete = r.status === "complete";
            const won = r.winner_id === userId;
            return (
              <div
                key={r.id}
                className="ab-step-in"
                onClick={() => router.push(`/round/${r.id}`)}
                style={{
                  '--i': String(Math.min(idx, 6)),
                  display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20,
                  padding: "20px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  cursor: "pointer",
                } as CSSProperties}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: "0 0 5px", fontSize: "clamp(14px, 1.8vw, 16px)", fontWeight: 500, color: "#fff", textShadow: "0 1px 8px rgba(0,0,0,0.38)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.topic}
                  </p>
                  <p style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,255,255,0.38)", letterSpacing: "0.04em" }}>
                    vs @{opponent?.username} · {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
                  {isComplete ? (
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
                      letterSpacing: "0.10em", textTransform: "uppercase",
                      color: won ? "var(--accent)" : "rgba(255,255,255,0.40)",
                      textShadow: "0 1px 4px rgba(0,0,0,0.30)",
                    }}>
                      {won ? "Win" : "Loss"}
                    </span>
                  ) : (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em" }}>
                      Judging
                    </span>
                  )}
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.30)" }}>→</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
    </>
  );
}

const backBtn: CSSProperties = { background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 13, color: "rgba(255,255,255,0.65)", padding: "8px 0", textShadow: "0 1px 4px rgba(0,0,0,0.35)" };
const heroTitle: CSSProperties = { fontFamily: "var(--font-display)", fontSize: "clamp(56px, 12vw, 110px)", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", margin: 0, lineHeight: 0.92, textShadow: "0 2px 20px rgba(0,0,0,0.45), 0 8px 40px rgba(0,0,0,0.22)" };
const rule: CSSProperties = { display: "flex", alignItems: "center", gap: 12, margin: "clamp(28px, 5vh, 44px) 0" };
const ruleDot: CSSProperties = { width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 };
const ruleLine: CSSProperties = { flex: 1, height: 1, background: "rgba(255,255,255,0.15)" };
