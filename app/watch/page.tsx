"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { CSSProperties } from "react";

interface Round {
  id: string;
  topic: string;
  status: string;
  current_speech: number;
  created_at: string;
  pro: { username: string; elo: number };
  con: { username: string; elo: number };
}

const SPEECH_LABELS = [
  "Pro Constructive", "Con Constructive",
  "Pro Rebuttal",     "Con Rebuttal",
  "Pro Summary",      "Con Summary",
  "Pro Final Focus",  "Con Final Focus",
];

export default function WatchPage() {
  const router = useRouter();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("rounds")
        .select(`
          id, topic, status, current_speech, created_at,
          pro:profiles!pro_id(username, elo),
          con:profiles!con_id(username, elo)
        `)
        .eq("is_ranked", true)
        .eq("status", "active")
        .order("created_at", { ascending: false });

      const sorted = ((data || []) as unknown as Round[]).sort((a, b) =>
        ((b.pro?.elo || 0) + (b.con?.elo || 0)) - ((a.pro?.elo || 0) + (a.con?.elo || 0))
      );

      setRounds(sorted);
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
      <style>{`.db-shell { background-image: url("/6.png") !important; }`}</style>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 clamp(24px, 5vw, 48px) 100px" }}>

      <div style={{ paddingTop: "clamp(20px, 4vh, 36px)" }}>
        <button onClick={() => router.push("/dashboard")} style={backBtn}>← Back</button>
      </div>

      <section style={{ paddingTop: "clamp(20px, 4vh, 32px)" }}>
        <h1 className="ab-hero-line" style={{ '--i': '0', ...heroTitle } as CSSProperties}>Watch</h1>
        <p className="ab-hero-line" style={{ '--i': '1', fontSize: 14, color: "rgba(255,255,255,0.50)", margin: "10px 0 0", textShadow: "0 1px 5px rgba(0,0,0,0.35)" } as CSSProperties}>
          Live ranked rounds · sorted by combined ELO
          {rounds.length > 0 && (
            <span style={{ fontFamily: "var(--font-mono)", marginLeft: 10, fontSize: 11, color: "rgba(255,255,255,0.32)", letterSpacing: "0.06em" }}>
              {rounds.length} active
            </span>
          )}
        </p>
      </section>

      <div style={rule}><div style={ruleDot} /><div style={ruleLine} /></div>

      {rounds.length === 0 ? (
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", textShadow: "0 1px 5px rgba(0,0,0,0.35)" }}>
          No live ranked rounds right now — check back soon.
        </p>
      ) : (
        <div>
          {rounds.map((r, i) => {
            const speech = r.current_speech || 1;
            const progress = ((speech - 1) / 8) * 100;
            const combinedElo = (r.pro?.elo || 0) + (r.con?.elo || 0);
            return (
              <div
                key={r.id}
                className="ab-step-in"
                onClick={() => router.push(`/round/${r.id}`)}
                style={{
                  '--i': String(Math.min(i, 6)),
                  display: "grid",
                  gridTemplateColumns: "32px 1fr auto",
                  alignItems: "start",
                  gap: "0 20px",
                  padding: "22px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  cursor: "pointer",
                } as CSSProperties}
              >
                {/* Rank */}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: i === 0 ? 22 : 15, fontWeight: 700, color: i === 0 ? "var(--accent)" : "rgba(255,255,255,0.28)", lineHeight: "22px", letterSpacing: "-0.02em", paddingTop: 1 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>

                {/* Content */}
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: "0 0 6px", fontSize: "clamp(14px, 1.8vw, 16px)", fontWeight: 500, color: "#fff", textShadow: "0 1px 8px rgba(0,0,0,0.38)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.topic}
                  </p>
                  <p style={{ margin: "0 0 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,255,255,0.38)", letterSpacing: "0.03em" }}>
                    @{r.pro?.username}{" "}
                    <span style={{ color: "var(--accent)" }}>{r.pro?.elo}</span>
                    {" "}Pro · @{r.con?.username}{" "}
                    <span style={{ color: "var(--accent)" }}>{r.con?.elo}</span>
                    {" "}Con
                  </p>
                  {/* Progress bar */}
                  <div style={{ height: 2, background: "rgba(255,255,255,0.10)", borderRadius: 1, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${progress}%`, background: "var(--accent)", borderRadius: 1, transition: "width 0.4s" }} />
                  </div>
                </div>

                {/* Right meta */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ margin: "0 0 4px", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", color: "rgba(255,255,255,0.35)", whiteSpace: "nowrap" }}>
                    {SPEECH_LABELS[speech - 1]}
                  </p>
                  <p style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.06em" }}>
                    {combinedElo}
                  </p>
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
