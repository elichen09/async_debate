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
}

interface Round {
  id: string;
  topic: string;
  status: string;
  pro_id: string;
  con_id: string;
  challenger_id: string;
  pro: { username: string; display_name: string; elo: number };
  con: { username: string; display_name: string; elo: number };
}

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string>("");
  const [incoming, setIncoming] = useState<Round[]>([]);
  const [outgoing, setOutgoing] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const id = session.user.id;
      setUserId(id);

      const { data: profileData } = await supabase
        .from("profiles")
        .select("username, display_name, elo, wins, losses")
        .eq("id", id)
        .single();
      setProfile(profileData);

      const { data: rounds } = await supabase
        .from("rounds")
        .select(`
          id, topic, status, pro_id, con_id, challenger_id,
          pro:profiles!rounds_pro_id_fkey(username, display_name, elo),
          con:profiles!rounds_con_id_fkey(username, display_name, elo)
        `)
        .in("status", ["pending", "active"])
        .or(`pro_id.eq.${id},con_id.eq.${id}`);

      const allRounds = (rounds || []) as Round[];
      setIncoming(allRounds.filter(r => r.challenger_id !== id && r.status === "pending"));
      setOutgoing(allRounds.filter(r => r.challenger_id === id && r.status === "pending"));

      setLoading(false);
    }
    load();
  }, []);

  async function handleAccept(roundId: string) {
    await supabase.from("rounds").update({ status: "active" }).eq("id", roundId);
    router.refresh();
    window.location.reload();
  }

  async function handleDecline(roundId: string) {
    await supabase.from("rounds").update({ status: "declined" }).eq("id", roundId);
    router.refresh();
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
    <div style={{ fontFamily: "sans-serif", maxWidth: 480, margin: "3rem auto", padding: "0 1rem" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2.5rem" }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Async Debate</h1>
        <button onClick={handleSignOut} style={ghostBtn}>Sign out</button>
      </div>

      {/* Profile card */}
      <div style={card}>
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
                <div key={r.id} style={card}>
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
                <div key={r.id} style={{ ...card, opacity: 0.7 }}>
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
  marginBottom: "0",
} as const;

const statBox = {
  background: "#f9f7f4",
  borderRadius: 8,
  padding: "10px 12px",
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