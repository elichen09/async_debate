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
        .in("status", ["pending", "active"])
        .or(`pro_id.eq.${id},con_id.eq.${id}`);

      const allRounds = (rounds || []) as unknown as Round[];
      setIncoming(allRounds.filter(r => r.challenger_id !== id && r.status === "pending"));
      setOutgoing(allRounds.filter(r => r.challenger_id === id && r.status === "pending"));
      setActive(allRounds.filter(r => r.status === "active"));
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

  if (loading) return (
    <p style={{ textAlign: "center", marginTop: "4rem", color: "#4a5580", fontFamily: "var(--font-body)" }}>
      Loading...
    </p>
  );
  if (!profile) return null;

  const winRate = profile.wins + profile.losses > 0
    ? Math.round((profile.wins / (profile.wins + profile.losses)) * 100)
    : 0;

  const displayName = profile.display_name || profile.username;

  const speechLabels = [
    "Pro Constructive", "Con Constructive",
    "Pro Rebuttal", "Con Rebuttal",
    "Pro Summary", "Con Summary",
    "Pro Final Focus", "Con Final Focus",
  ];

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 20px 80px" }}>

      {/* ── Judge link ── */}
      {isJudge && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={() => router.push("/judge")} style={ghostBtn}>
            Judge dashboard →
          </button>
        </div>
      )}

      {/* ── Hero card ── */}
      <div style={{
        position: "relative",
        background: "rgba(255,255,255,0.03)",
        border: "0.5px solid rgba(255,255,255,0.07)",
        borderRadius: 14,
        padding: "22px 24px 20px",
        marginBottom: 14,
        overflow: "hidden",
      }}>
        {/* inner glows */}
        <div style={{
          position: "absolute", top: -60, right: -60,
          width: 220, height: 220, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(240,208,112,0.12), transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: -80, left: -40,
          width: 200, height: 200, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(30,60,180,0.2), transparent 70%)",
          pointerEvents: "none",
        }} />

        <p style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "#4a5580", marginBottom: 8, position: "relative", zIndex: 1 }}>
          debater profile
        </p>
        <h1 style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(26px, 5vw, 34px)",
          color: "#fff",
          letterSpacing: "-0.02em",
          lineHeight: 1,
          marginBottom: 4,
          position: "relative",
          zIndex: 1,
        }}>
          {displayName}
        </h1>
        <p style={{ fontSize: 13, color: "#4a5580", marginBottom: 18, position: "relative", zIndex: 1 }}>
          @{profile.username}
        </p>

        {/* stat strip */}
        <div style={{ display: "flex", position: "relative", zIndex: 1 }}>
          {[
            { label: "ELO rating", value: String(profile.elo), gold: true },
            { label: "record", value: `${profile.wins}–${profile.losses}`, gold: false },
            { label: "win rate", value: `${winRate}%`, gold: false },
          ].map((s, i, arr) => (
            <div key={s.label} style={{
              padding: "10px 18px",
              background: "rgba(255,255,255,0.04)",
              border: "0.5px solid rgba(255,255,255,0.07)",
              borderRadius: i === 0 ? "8px 0 0 8px" : i === arr.length - 1 ? "0 8px 8px 0" : "0",
            }}>
              <p style={{ fontSize: 20, fontWeight: 500, color: s.gold ? "#f0d070" : "#fff", lineHeight: 1, margin: 0 }}>
                {s.value}
              </p>
              <p style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#4a5580", marginTop: 3 }}>
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Incoming challenges ── */}
      {incoming.length > 0 && (
        <section style={{ marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "18px 0 10px" }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 17, color: "#c8b86a" }}>
              Incoming challenges
            </h2>
            <span style={{ fontSize: 11, color: "#4a5580", letterSpacing: "0.04em" }}>{incoming.length} pending</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {incoming.map(r => {
              const opponent = r.challenger_id === r.pro_id ? r.pro : r.con;
              const myRole = r.pro_id === userId ? "Pro" : "Con";
              return (
                <div key={r.id} style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "0.5px solid rgba(240,208,112,0.25)",
                  borderRadius: 12,
                  overflow: "hidden",
                  display: "grid",
                  gridTemplateColumns: "1fr 72px",
                }}>
                  <div style={{ padding: "16px 18px" }}>
                    <p style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#f0d070", margin: "0 0 8px", display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#f0d070", display: "inline-block", flexShrink: 0 }} />
                      new challenge
                    </p>
                    <h3 style={{ fontFamily: "var(--font-display)", fontSize: 19, color: "#fff", marginBottom: 5 }}>{r.topic}</h3>
                    <p style={{ fontSize: 12, color: "#4a5580", margin: "0 0 11px" }}>
                      from @{opponent?.username} &nbsp;·&nbsp; you are {myRole} &nbsp;·&nbsp; ELO {opponent?.elo}
                    </p>
                    <blockquote style={{
                      fontFamily: "var(--font-display)",
                      fontStyle: "italic",
                      fontSize: 12,
                      color: "#8a9abf",
                      lineHeight: 1.55,
                      margin: "0 0 13px",
                      padding: "9px 12px",
                      background: "rgba(255,255,255,0.03)",
                      borderRadius: "0 7px 7px 0",
                      borderLeft: "2px solid rgba(240,208,112,0.5)",
                    }}>
                      "{r.topic}"
                    </blockquote>
                    <div style={{ display: "flex", gap: 7 }}>
                      <button onClick={() => handleAccept(r.id)} style={acceptBtn}>Accept</button>
                      <button onClick={() => handleDecline(r.id)} style={declineBtn}>Decline</button>
                    </div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.02)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="48" viewBox="0 0 60 80" fill="none" style={{ opacity: 0.12 }}>
                      <rect x="5" y="5" width="50" height="70" rx="3" stroke="white" strokeWidth="1.5"/>
                      <line x1="14" y1="22" x2="46" y2="22" stroke="white" strokeWidth="1.2"/>
                      <line x1="14" y1="34" x2="46" y2="34" stroke="white" strokeWidth="1.2"/>
                      <line x1="14" y1="46" x2="36" y2="46" stroke="white" strokeWidth="1.2"/>
                    </svg>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Outgoing challenges ── */}
      {outgoing.length > 0 && (
        <section style={{ marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "18px 0 10px" }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 17, color: "#c8b86a" }}>
              Sent challenges
            </h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {outgoing.map(r => {
              const opponent = r.pro_id === userId ? r.con : r.pro;
              return (
                <div key={r.id} style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "0.5px solid rgba(255,255,255,0.06)",
                  borderRadius: 12,
                  padding: "13px 16px",
                  opacity: 0.6,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", border: "0.5px solid rgba(255,255,255,0.2)", display: "inline-block", flexShrink: 0 }} />
                  <div>
                    <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 2px", color: "#fff" }}>{r.topic}</p>
                    <p style={{ fontSize: 12, color: "#4a5580", margin: 0 }}>
                      waiting for @{opponent?.username} to respond
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Active rounds ── */}
      {active.length > 0 && (
        <section style={{ marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "18px 0 10px" }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 17, color: "#c8b86a" }}>
              Active rounds
            </h2>
            <span style={{ fontSize: 11, color: "#4a5580", letterSpacing: "0.04em" }}>{active.length} in play</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {active.map(r => {
              const myRole = r.pro_id === userId ? "pro" : "con";
              const opponent = myRole === "pro" ? r.con : r.pro;
              const currentSpeech = r.current_speech || 1;
              const isMyTurn = (currentSpeech % 2 === 1 && myRole === "pro") || (currentSpeech % 2 === 0 && myRole === "con");

              return (
                <div
                  key={r.id}
                  onClick={() => router.push(`/round/${r.id}`)}
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: `0.5px solid ${isMyTurn ? "rgba(240,208,112,0.35)" : "rgba(255,255,255,0.07)"}`,
                    borderRadius: 12,
                    padding: "13px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "#4a5580", width: 28, flexShrink: 0, textAlign: "center", lineHeight: 1 }}>
                    {currentSpeech}
                  </div>
                  <div style={{ width: "0.5px", height: 36, background: "rgba(255,255,255,0.08)", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 500, color: "#fff", margin: "0 0 3px" }}>{r.topic}</p>
                    <p style={{ fontSize: 11, color: "#4a5580", margin: "0 0 7px" }}>
                      vs @{opponent?.username} &nbsp;·&nbsp; {myRole === "pro" ? "Pro" : "Con"} &nbsp;·&nbsp; {speechLabels[currentSpeech - 1]}
                    </p>
                    <div style={{ display: "flex", gap: 3 }}>
                      {Array.from({ length: 8 }).map((_, i) => (
                        <span key={i} style={{
                          width: 6, height: 6, borderRadius: "50%", display: "inline-block",
                          background: i < currentSpeech ? "#f0d070" : "rgba(255,255,255,0.1)",
                        }} />
                      ))}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: "right" }}>
                    {isMyTurn ? (
                      <span style={{ fontSize: 10, padding: "4px 10px", background: "#f0d070", color: "#0a0f1e", borderRadius: 20, fontWeight: 600, whiteSpace: "nowrap" }}>
                        your turn →
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, padding: "4px 10px", background: "rgba(255,255,255,0.06)", color: "#4a5580", borderRadius: 20, whiteSpace: "nowrap" }}>
                        waiting…
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── CTA ── */}
      <div style={{
        marginTop: 12,
        background: "rgba(255,255,255,0.03)",
        border: "0.5px solid rgba(240,208,112,0.2)",
        borderRadius: 12,
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{ position: "absolute", right: -30, top: -30, width: 120, height: 120, borderRadius: "50%", background: "radial-gradient(circle, rgba(240,208,112,0.1), transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <p style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 15, color: "#fff", margin: "0 0 3px" }}>
            Ready for a new challenge?
          </p>
          <p style={{ fontSize: 11, color: "#4a5580" }}>debate new ideas · climb the ranks</p>
        </div>
        <button onClick={() => router.push("/challenge")} style={ctaBtn}>
          Challenge a debater
        </button>
      </div>

    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  background: "transparent",
  border: "0.5px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 14,
  color: "#4a5580",
  cursor: "pointer",
};

const acceptBtn: React.CSSProperties = {
  flex: 1,
  padding: "8px 0",
  background: "#f0d070",
  color: "#0a0f1e",
  border: "none",
  borderRadius: 7,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const declineBtn: React.CSSProperties = {
  flex: 1,
  padding: "8px 0",
  background: "transparent",
  color: "#4a5580",
  border: "0.5px solid rgba(255,255,255,0.1)",
  borderRadius: 7,
  fontSize: 12,
  cursor: "pointer",
};

const ctaBtn: React.CSSProperties = {
  padding: "10px 18px",
  background: "#f0d070",
  color: "#0a0f1e",
  border: "none",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
  position: "relative",
  zIndex: 1,
};