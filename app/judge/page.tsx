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
  const [isBanned, setIsBanned] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const uid = session.user.id;

      const { data: profile } = await supabase
        .from("profiles")
        .select("is_banned_from_judging")
        .eq("id", uid)
        .single();

      if (profile?.is_banned_from_judging) {
        setIsBanned(true);
        setLoading(false);
        return;
      }

      // unclaimed rounds — exclude rounds user is a participant in
      const { data: unclaimed } = await supabase
        .from("rounds")
        .select(`
          id, topic, created_at,
          pro:profiles!pro_id(username, elo),
          con:profiles!con_id(username, elo)
        `)
        .eq("status", "judging")
        .is("judge_id", null)
        .neq("pro_id", uid)
        .neq("con_id", uid)
        .order("created_at", { ascending: true });

      setRounds((unclaimed || []) as unknown as Round[]);

      // rounds this user has claimed
      const { data: claimed } = await supabase
        .from("rounds")
        .select(`
          id, topic, created_at,
          pro:profiles!pro_id(username, elo),
          con:profiles!con_id(username, elo)
        `)
        .eq("status", "judging")
        .eq("judge_id", uid)
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
    await supabase.from("rounds").update({ judge_id: session.user.id }).eq("id", roundId);
    router.push(`/judge/${roundId}`);
  }

  if (loading) return <p style={{ textAlign: "center", marginTop: "4rem", color: "var(--muted)" }}>Loading...</p>;

  if (isBanned) return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "0 20px 80px" }}>
      <div style={{ padding: "24px 0 20px" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--ink)", margin: 0 }}>Judge Dashboard</h1>
      </div>
      <div style={{ ...card, textAlign: "center", borderColor: "color-mix(in srgb, var(--loss) 30%, transparent)" }}>
        <p style={{ fontSize: 16, fontWeight: 600, color: "var(--loss)", margin: "0 0 8px" }}>Judging privileges removed</p>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
          Your judging privileges were removed due to a reported ballot. Contact an admin to appeal.
        </p>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "0 20px 80px" }}>

      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "24px 0 20px" }}>
        <button onClick={() => router.push("/dashboard")} style={ghostBtn}>← Back</button>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 580, color: "var(--ink)", margin: 0 }}>Judge Dashboard</h1>
      </div>

      <div style={{ ...card, marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: 0, lineHeight: 1.6 }}>
          Anyone can judge rounds they are not a participant in. Faulty ballots can be reported by participants — repeated reports will remove your judging ability.
        </p>
      </div>

      {/* Claimed rounds */}
      {claimedRounds.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <p style={sectionLabel}>Your claimed rounds</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {claimedRounds.map(r => (
              <div key={r.id} style={card}>
                <p style={{ fontWeight: 600, fontSize: 15, margin: "0 0 4px", color: "var(--ink)" }}>{r.topic}</p>
                <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 14px" }}>
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
              <p style={{ fontWeight: 600, fontSize: 15, margin: "0 0 4px", color: "var(--ink)" }}>{r.topic}</p>
              <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 14px" }}>
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

      {rounds.length === 0 && claimedRounds.length === 0 && (
        <div style={{ ...card, textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>No rounds available to judge right now.</p>
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--card)", border: "0.5px solid var(--line)", borderRadius: 12, padding: "1.25rem", marginBottom: 0 };
const sectionLabel: React.CSSProperties = { fontSize: 10, fontWeight: 500, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 10px" };
const primaryBtn: React.CSSProperties = { width: "100%", height: 40, background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer" };
const ghostBtn: React.CSSProperties = { background: "transparent", border: "0.5px solid var(--line-strong)", borderRadius: 8, padding: "8px 14px", fontSize: 14, color: "var(--muted)", cursor: "pointer" };