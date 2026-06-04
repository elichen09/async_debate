"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface Round {
  id: string;
  topic: string;
  status: string;
  current_speech: number;
  created_at: string;
  pro: { username: string; elo: number };
  con: { username: string; elo: number };
}

export default function RoundsPage() {
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

      // sort by combined ELO of both players
      const sorted = ((data || []) as unknown as Round[]).sort((a, b) => {
        const eloA = (a.pro?.elo || 0) + (a.con?.elo || 0);
        const eloB = (b.pro?.elo || 0) + (b.con?.elo || 0);
        return eloB - eloA;
      });

      setRounds(sorted);
      setLoading(false);
    }
    load();
  }, []);

  const speechLabels = [
    "Pro Constructive", "Con Constructive",
    "Pro Rebuttal", "Con Rebuttal",
    "Pro Summary", "Con Summary",
    "Pro Final Focus", "Con Final Focus",
  ];

  if (loading) return (
    <p style={{ textAlign: "center", marginTop: "4rem", color: "var(--muted)" }}>Loading...</p>
  );

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 20px 80px" }}>

      <div style={{ margin: "24px 0 20px" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(24px, 4vw, 30px)", color: "var(--ink)", letterSpacing: "-0.02em", margin: "0 0 4px" }}>
          Live ranked rounds
        </h1>
        <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
          Sorted by combined ELO · {rounds.length} active
        </p>
      </div>

      {rounds.length === 0 ? (
        <div style={{ background: "var(--card)", border: "0.5px solid var(--line)", borderRadius: 12, padding: "32px", textAlign: "center" }}>
          <p style={{ color: "var(--muted)", margin: 0 }}>No live ranked rounds right now.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rounds.map((r, index) => {
            const currentSpeech = r.current_speech || 1;
            const progress = ((currentSpeech - 1) / 8) * 100;
            const combinedElo = (r.pro?.elo || 0) + (r.con?.elo || 0);
            return (
              <div
                key={r.id}
                onClick={() => router.push(`/round/${r.id}`)}
                style={{
                  background: "var(--card)",
                  border: "0.5px solid var(--line)",
                  borderRadius: 12, padding: "14px 16px",
                  display: "flex", alignItems: "center",
                  gap: 14, cursor: "pointer",
                }}
              >
                {/* rank number */}
                <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: index === 0 ? "var(--accent)" : "var(--muted)", width: 28, flexShrink: 0, textAlign: "center", lineHeight: 1 }}>
                  {index + 1}
                </div>

                <div style={{ width: "0.5px", height: 36, background: "var(--line)", flexShrink: 0 }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)", margin: "0 0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.topic}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 8px" }}>
                    @{r.pro?.username} <span style={{ color: "var(--accent)" }}>{r.pro?.elo}</span>
                    {" "}(Pro) vs @{r.con?.username} <span style={{ color: "var(--accent)" }}>{r.con?.elo}</span> (Con)
                  </p>
                  <div style={{ height: 3, background: "var(--paper-2)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${progress}%`, background: "var(--accent)", borderRadius: 2 }} />
                  </div>
                </div>

                <div style={{ flexShrink: 0, textAlign: "right" }}>
                  <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 3px" }}>{speechLabels[currentSpeech - 1]}</p>
                  <p style={{ fontSize: 10, color: "color-mix(in srgb, var(--accent) 60%, transparent)", margin: 0 }}>⚡ {combinedElo} ELO</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}