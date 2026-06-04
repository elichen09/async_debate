"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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
  const [isJudge, setIsJudge] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("is_judge")
        .eq("id", session.user.id)
        .single();

      if (!profile?.is_judge) { router.push("/dashboard"); return; }
      setIsJudge(true);

      const { data: unclaimed } = await supabase
        .from("rounds")
        .select(`
          id, topic, created_at,
          pro:profiles!pro_id(username, elo),
          con:profiles!con_id(username, elo)
        `)
        .eq("status", "judging")
        .is("judge_id", null)
        .order("created_at", { ascending: true });

      setRounds((unclaimed || []) as unknown as Round[]);

      const { data: claimed } = await supabase
        .from("rounds")
        .select(`
          id, topic, created_at,
          pro:profiles!pro_id(username, elo),
          con:profiles!con_id(username, elo)
        `)
        .eq("status", "judging")
        .eq("judge_id", session.user.id)
        .order("created_at", { ascending: true });

      setClaimedRounds((claimed || []) as unknown as Round[]);
      setLoading(false);
    }
    load();
  }, []);

  async function handleClaim(roundId: string) {
    setClaiming(roundId);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await supabase.from("rounds").update({
      judge_id: session.user.id,
    }).eq("id", roundId);

    router.push(`/judge/${roundId}`);
  }

  if (loading) return <p style={{ textAlign: "center", marginTop: "4rem" }}>Loading...</p>;
  if (!isJudge) return null;

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 520, margin: "3rem auto", padding: "0 1rem" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Judge Dashboard</h1>
        <button onClick={() => router.push("/dashboard")} style={ghostBtn}>← Back</button>
      </div>

      {/* Claimed rounds */}
      {claimedRounds.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <p style={sectionLabel}>Your claimed rounds</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {claimedRounds.map(r => (
              <div key={r.id} style={card}>
                <p style={{ fontWeight: 500, fontSize: 15, margin: "0 0 6px" }}>{r.topic}</p>
                <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "0 0 14px" }}>
                  @{r.pro?.username} (Pro) vs @{r.con?.username} (Con) · ELO {r.pro?.elo} vs {r.con?.elo}
                </p>
                <button onClick={() => router.push(`/judge/${r.id}`)} style={primaryBtn}>
                  Continue judging →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unclaimed rounds */}
      <p style={sectionLabel}>
        {rounds.length === 0 ? "No rounds waiting to be judged" : `${rounds.length} round${rounds.length !== 1 ? "s" : ""} awaiting judgment`}
      </p>
      {rounds.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rounds.map(r => (
            <div key={r.id} style={card}>
              <p style={{ fontWeight: 500, fontSize: 15, margin: "0 0 6px" }}>{r.topic}</p>
              <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "0 0 14px" }}>
                @{r.pro?.username} (Pro) vs @{r.con?.username} (Con) · ELO {r.pro?.elo} vs {r.con?.elo}
              </p>
              <button
                onClick={() => handleClaim(r.id)}
                disabled={claiming === r.id}
                style={primaryBtn}
              >
                {claiming === r.id ? "Claiming…" : "Claim round"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const card = {
  background: "var(--card)",
  border: "1px solid var(--line)",
  borderRadius: 12,
  padding: "1.25rem",
} as const;

const sectionLabel = {
  fontSize: 11,
  fontWeight: 500 as const,
  color: "var(--ink-soft)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  margin: "0 0 10px",
};

const primaryBtn = {
  width: "100%",
  height: 40,
  background: "var(--ink)",
  color: "var(--ink)",
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
} as const;

const ghostBtn = {
  background: "transparent",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 14,
  cursor: "pointer",
} as const;