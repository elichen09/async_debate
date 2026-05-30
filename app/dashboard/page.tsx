"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface Profile {
  username: string;
  display_name: string;
  elo: number;
  wins: number;
  losses: number;
  is_judge: boolean;
}

interface Round {
  id: string;
  topic: string;
  status: string;
  pro_id: string;
  con_id: string;
  challenger_id: string;
  current_speech: number;
  winner_id: string;
  pro: { username: string; display_name: string; elo: number };
  con: { username: string; display_name: string; elo: number };
}

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [incoming, setIncoming] = useState<Round[]>([]);
  const [outgoing, setOutgoing] = useState<Round[]>([]);
  const [active, setActive] = useState<Round[]>([]);
  const [judging, setJudging] = useState<Round[]>([]);
  const [completed, setCompleted] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [isJudge, setIsJudge] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const id = session.user.id;
      setUserId(id);

      const { data: profileData } = await supabase
        .from("profiles")
        .select("username, display_name, elo, wins, losses, is_judge")
        .eq("id", id)
        .single();
      setProfile(profileData);
      setIsJudge(profileData?.is_judge || false);

      const { data: rounds } = await supabase
        .from("rounds")
        .select(`
          id, topic, status, pro_id, con_id, challenger_id, current_speech, winner_id,
          pro:profiles!pro_id(username, display_name, elo),
          con:profiles!con_id(username, display_name, elo)
        `)
        .in("status", ["pending", "active", "judging", "complete"])
        .or(`pro_id.eq.${id},con_id.eq.${id}`);

      const allRounds = (rounds || []) as unknown as Round[];
      setIncoming(allRounds.filter(r => r.challenger_id !== id && r.status === "pending"));
      setOutgoing(allRounds.filter(r => r.challenger_id === id && r.status === "pending"));
      setActive(allRounds.filter(r => r.status === "active"));
      setJudging(allRounds.filter(r => r.status === "judging"));
      setCompleted(allRounds.filter(r => r.status === "complete"));
      setLoading(false);
    }
    load();
  }, []);

  async function handleAccept(roundId: string) {
    await supabase.from("rounds").update({ status: "active" }).eq("id", roundId);
    window.location.reload();
  }

  async function handleDecline(roundId: string) {
    await supabase.from("rounds").update({ status: "declined" }).eq("id", roundId);
    window.location.reload();
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) return <p style={{ textAlign: "center", marginTop: "4rem" }}>Loading...</p>;
  if (!profile) return null;

  const winRate = profile.wins + profile.losses > 0
    ? Math.round((profile.wins / (profile.wins + profile.losses)) * 100)
    : 0;

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 480, margin: "3rem auto", padding: "0 1rem 4rem" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2.5rem" }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Async Debate</h1>
        <button onClick={handleSignOut} style={ghostBtn}>Sign out</button>
      </div>

      {/* Judge link */}
      {isJudge && (
        <div style={{ marginBottom: "1.5rem" }}>
          <button onClick={() => router.push("/judge")} style={ghostBtn}>
            Judge dashboard →
          </button>
        </div>
      )}

      {/* Profile card */}
      <div style={{ ...card, marginBottom: "1.5rem" }}>
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 20, fontWeight: 500, margin: "0 0 2px" }}>{profile.display_name || profile.username}</p>
          <p style={{ fontSize: 14, color: "#6b6760", margin: 0 }}>@{profile.username}</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div style={statBox}>
            <p style={statLabel}>ELO</p>
            <p style={statValue}>{profile.elo}</p>
          </div>
          <div style={statBox}>
            <p style={statLabel}>Record</p>
            <p style={statValue}>{profile.wins}–{profile.losses}</p>
          </div>
          <div style={statBox}>
            <p style={statLabel}>Win rate</p>
            <p style={statValue}>{winRate}%</p>
          </div>
        </div>
      </div>

      {/* Incoming challenges */}
      {incoming.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <p style={sectionLabel}>Incoming challenges</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {incoming.map(r => {
              const opponent = r.challenger_id === r.pro_id ? r.pro : r.con;
              const myRole = r.pro_id === userId ? "Pro" : "Con";
              return (
                <div key={r.id} style={{ ...card, marginBottom: 0 }}>
                  <p style={{ fontWeight: 500, margin: "0 0 4px", fontSize: 15 }}>{r.topic}</p>
                  <p style={{ fontSize: 13, color: "#6b6760", margin: "0 0 14px" }}>
                    From @{opponent?.username} · You are {myRole} · ELO {opponent?.elo}
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => handleAccept(r.id)} style={acceptBtn}>Accept</button>
                    <button onClick={() => handleDecline(r.id)} style={declineBtn}>Decline</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Outgoing challenges */}
      {outgoing.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <p style={sectionLabel}>Sent challenges</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {outgoing.map(r => {
              const opponent = r.pro_id === userId ? r.con : r.pro;
              return (
                <div key={r.id} style={{ ...card, marginBottom: 0, opacity: 0.7 }}>
                  <p style={{ fontWeight: 500, margin: "0 0 4px", fontSize: 15 }}>{r.topic}</p>
                  <p style={{ fontSize: 13, color: "#6b6760", margin: 0 }}>
                    Waiting for @{opponent?.username} to respond
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active rounds */}
      {active.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <p style={sectionLabel}>Active rounds</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {active.map(r => {
              const myRole = r.pro_id === userId ? "pro" : "con";
              const opponent = myRole === "pro" ? r.con : r.pro;
              const speechLabels = ["Pro Constructive","Con Constructive","Pro Rebuttal","Con Rebuttal","Pro Summary","Con Summary","Pro Final Focus","Con Final Focus"];
              const currentSpeech = r.current_speech || 1;
              const isMyTurn = (currentSpeech % 2 === 1 && myRole === "pro") || (currentSpeech % 2 === 0 && myRole === "con");
              return (
                <div
                  key={r.id}
                  onClick={() => router.push(`/round/${r.id}`)}
                  style={{ ...card, marginBottom: 0, cursor: "pointer", borderColor: isMyTurn ? "#1a1814" : "#e5e2dc" }}
                >
                  <p style={{ fontWeight: 500, margin: "0 0 4px", fontSize: 15 }}>{r.topic}</p>
                  <p style={{ fontSize: 13, color: "#6b6760", margin: "0 0 10px" }}>
                    vs @{opponent?.username} · You are {myRole === "pro" ? "Pro" : "Con"}
                  </p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#6b6760" }}>
                      Speech {currentSpeech}/8 · {speechLabels[currentSpeech - 1]}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: isMyTurn ? "#1a1814" : "#6b6760" }}>
                      {isMyTurn ? "Your turn →" : "Waiting..."}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Awaiting judge */}
      {judging.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <p style={sectionLabel}>Awaiting scoring</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {judging.map(r => {
              const myRole = r.pro_id === userId ? "Pro" : "Con";
              const opponent = r.pro_id === userId ? r.con : r.pro;
              return (
                <div key={r.id} style={{ ...card, marginBottom: 0, opacity: 0.8 }}>
                  <p style={{ fontWeight: 500, margin: "0 0 4px", fontSize: 15 }}>{r.topic}</p>
                  <p style={{ fontSize: 13, color: "#6b6760", margin: "0 0 10px" }}>
                    vs @{opponent?.username} · You are {myRole}
                  </p>
                  <span style={{ ...badge, background: "#fef9c3", color: "#854d0e" }}>
                    ⏳ Awaiting judge
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed rounds */}
      {completed.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <p style={sectionLabel}>Completed rounds</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {completed.map(r => {
              const myRole = r.pro_id === userId ? "Pro" : "Con";
              const opponent = r.pro_id === userId ? r.con : r.pro;
              const won = r.winner_id === userId;
              return (
                <div
                  key={r.id}
                  onClick={() => router.push(`/round/${r.id}`)}
                  style={{ ...card, marginBottom: 0, cursor: "pointer" }}
                >
                  <p style={{ fontWeight: 500, margin: "0 0 4px", fontSize: 15 }}>{r.topic}</p>
                  <p style={{ fontSize: 13, color: "#6b6760", margin: "0 0 10px" }}>
                    vs @{opponent?.username} · You are {myRole}
                  </p>
                  <span style={{
                    ...badge,
                    background: won ? "#f0fdf4" : "#fef2f2",
                    color: won ? "#166534" : "#b91c1c",
                  }}>
                    {won ? "✓ Win" : "✗ Loss"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Challenge button */}
      <button onClick={() => router.push("/challenge")} style={primaryBtn}>
        Challenge a debater
      </button>

    </div>
  );
}

const card = {
  background: "#ffffff",
  border: "1px solid #e5e2dc",
  borderRadius: 12,
  padding: "1.25rem",
} as const;

const statBox = {
  background: "#f9f7f4",
  borderRadius: 8,
  padding: "10px 12px",
} as const;

const badge = {
  fontSize: 12,
  fontWeight: 500,
  padding: "4px 10px",
  borderRadius: 20,
  display: "inline-block",
} as const;

const sectionLabel = {
  fontSize: 11,
  fontWeight: 500 as const,
  color: "#6b6760",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  margin: "0 0 10px",
};

const statLabel = {
  fontSize: 11,
  fontWeight: 500,
  color: "#6b6760",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  margin: "0 0 4px",
};

const statValue = {
  fontSize: 20,
  fontWeight: 500,
  margin: 0,
};

const primaryBtn = {
  width: "100%",
  height: 44,
  background: "#1a1814",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 500,
  cursor: "pointer",
} as const;

const ghostBtn = {
  background: "transparent",
  border: "1px solid #e5e2dc",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 14,
  cursor: "pointer",
} as const;

const acceptBtn = {
  flex: 1,
  height: 38,
  background: "#1a1814",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
} as const;

const declineBtn = {
  flex: 1,
  height: 38,
  background: "transparent",
  color: "#1a1814",
  border: "1px solid #e5e2dc",
  borderRadius: 8,
  fontSize: 14,
  cursor: "pointer",
} as const;