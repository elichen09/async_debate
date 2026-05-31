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

  if (loading) return <p style={{ textAlign: "center", marginTop: "4rem", fontFamily: "var(--font-body)" }}>Loading...</p>;
  if (!profile) return null;

  const winRate = profile.wins + profile.losses > 0
    ? Math.round((profile.wins / (profile.wins + profile.losses)) * 100)
    : 0;

  const displayName = profile.display_name || profile.username;
  const initials = displayName.slice(0, 1).toUpperCase();

  const speechLabels = [
    "Pro Constructive", "Con Constructive",
    "Pro Rebuttal", "Con Rebuttal",
    "Pro Summary", "Con Summary",
    "Pro Final Focus", "Con Final Focus",
  ];

  return (
    <div className="db-page" style={{ maxWidth: 600, margin: "0 auto", padding: "0 20px 80px" }}>

      {/* ── Judge link ── */}
      {isJudge && (
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => router.push("/judge")} className="db-btn db-btn--ghost db-btn--sm">
            Judge dashboard →
          </button>
        </div>
      )}

      {/* ── Hero card ── */}
      <div className="db-rise" style={{
        background: "#111",
        borderRadius: "var(--radius)",
        overflow: "hidden",
        marginTop: 0,
        marginBottom: 14,
        position: "relative",
        minHeight: 180,
        padding: "28px 24px 22px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}>
        {/* decorative geometric bg */}
        <svg aria-hidden="true" style={{ position: "absolute", right: 0, top: 0, opacity: 0.1, pointerEvents: "none", width: 280 }} viewBox="0 0 300 220" fill="none">
          <circle cx="240" cy="60" r="80" stroke="white" strokeWidth="0.6"/>
          <circle cx="240" cy="60" r="55" stroke="white" strokeWidth="0.6"/>
          <circle cx="240" cy="60" r="30" stroke="white" strokeWidth="0.6"/>
          <line x1="80" y1="20" x2="280" y2="180" stroke="white" strokeWidth="0.5"/>
          <line x1="120" y1="10" x2="260" y2="200" stroke="white" strokeWidth="0.5"/>
          <path d="M60 110 Q150 40 280 90" stroke="white" strokeWidth="0.5" fill="none"/>
          <path d="M40 150 Q160 70 290 130" stroke="white" strokeWidth="0.5" fill="none"/>
          <rect x="190" y="30" width="90" height="120" rx="4" stroke="white" strokeWidth="0.5"/>
          <line x1="190" y1="60" x2="280" y2="60" stroke="white" strokeWidth="0.4"/>
          <line x1="190" y1="90" x2="280" y2="90" stroke="white" strokeWidth="0.4"/>
          <line x1="190" y1="120" x2="280" y2="120" stroke="white" strokeWidth="0.4"/>
        </svg>

        <div style={{ position: "relative", zIndex: 1 }}>
          <p className="db-eyebrow" style={{ color: "#555", marginBottom: 6 }}>debater profile</p>
          <h1 style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(28px, 5vw, 38px)",
            color: "#fff",
            letterSpacing: "-0.02em",
            marginBottom: 4,
          }}>
            {displayName}
          </h1>
          <p style={{ fontSize: 13, color: "#555", marginBottom: 18 }}>@{profile.username}</p>

          <div style={{ display: "flex", gap: 0 }}>
            {[
              { label: "ELO rating", value: profile.elo },
              { label: "record", value: `${profile.wins}–${profile.losses}` },
              { label: "win rate", value: `${winRate}%` },
            ].map((s, i, arr) => (
              <div key={s.label} style={{
                padding: "10px 18px",
                background: "rgba(255,255,255,0.05)",
                border: "0.5px solid rgba(255,255,255,0.08)",
                borderRadius: i === 0 ? "8px 0 0 8px" : i === arr.length - 1 ? "0 8px 8px 0" : "0",
              }}>
                <p className="db-mono" style={{ fontSize: 20, fontWeight: 600, color: "#fff", margin: 0, lineHeight: 1 }}>{s.value}</p>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#555", margin: "4px 0 0" }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Incoming challenges ── */}
      {incoming.length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "20px 0 10px" }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 18, color: "var(--ink)" }}>
              Incoming challenges
            </h2>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>{incoming.length} pending</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {incoming.map(r => {
              const opponent = r.challenger_id === r.pro_id ? r.pro : r.con;
              const myRole = r.pro_id === userId ? "Pro" : "Con";
              return (
                <div key={r.id} className="db-card db-card--accent" style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 0,
                  padding: 0,
                  overflow: "hidden",
                }}>
                  <div style={{ padding: "18px 20px" }}>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--accent)", margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
                      new challenge
                    </p>
                    <h3 style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--ink)", marginBottom: 6 }}>{r.topic}</h3>
                    <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 12px" }}>
                      from @{opponent?.username} &nbsp;·&nbsp; you are {myRole} &nbsp;·&nbsp; ELO {opponent?.elo}
                    </p>
                    <blockquote style={{
                      fontFamily: "var(--font-display)",
                      fontStyle: "italic",
                      fontSize: 13,
                      color: "var(--ink-soft)",
                      lineHeight: 1.55,
                      margin: "0 0 16px",
                      padding: "10px 14px",
                      background: "var(--paper-2)",
                      borderRadius: "0 8px 8px 0",
                      borderLeft: "2px solid var(--accent)",
                    }}>
                      "{r.topic}"
                    </blockquote>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => handleAccept(r.id)} className="db-btn db-btn--primary db-btn--sm" style={{ flex: 1 }}>
                        Accept challenge
                      </button>
                      <button onClick={() => handleDecline(r.id)} className="db-btn db-btn--ghost db-btn--sm" style={{ flex: 1 }}>
                        Decline
                      </button>
                    </div>
                  </div>
                  {/* decorative side panel */}
                  <div style={{
                    width: 80,
                    background: "var(--paper-2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <svg aria-hidden="true" style={{ opacity: 0.18, width: 48 }} viewBox="0 0 60 80" fill="none">
                      <rect x="5" y="5" width="50" height="70" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                      <line x1="14" y1="22" x2="46" y2="22" stroke="currentColor" strokeWidth="1.2"/>
                      <line x1="14" y1="34" x2="46" y2="34" stroke="currentColor" strokeWidth="1.2"/>
                      <line x1="14" y1="46" x2="36" y2="46" stroke="currentColor" strokeWidth="1.2"/>
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
        <section style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "20px 0 10px" }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 18, color: "var(--ink)" }}>
              Sent challenges
            </h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {outgoing.map(r => {
              const opponent = r.pro_id === userId ? r.con : r.pro;
              return (
                <div key={r.id} className="db-card" style={{ opacity: 0.65, display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: "var(--paper-2)",
                    border: "1px solid var(--line)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                    fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--muted)",
                  }}>…</div>
                  <div>
                    <p style={{ fontWeight: 500, margin: "0 0 2px", fontSize: 14, color: "var(--ink)" }}>{r.topic}</p>
                    <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
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
        <section style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "20px 0 10px" }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 18, color: "var(--ink)" }}>
              Active rounds
            </h2>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>{active.length} in play</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {active.map(r => {
              const myRole = r.pro_id === userId ? "pro" : "con";
              const opponent = myRole === "pro" ? r.con : r.pro;
              const currentSpeech = r.current_speech || 1;
              const isMyTurn = (currentSpeech % 2 === 1 && myRole === "pro") || (currentSpeech % 2 === 0 && myRole === "con");

              return (
                <div
                  key={r.id}
                  onClick={() => router.push(`/round/${r.id}`)}
                  className="db-card db-card--interactive"
                  style={{
                    borderColor: isMyTurn ? "var(--ink)" : "var(--line)",
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "14px 18px",
                  }}
                >
                  {/* speech number */}
                  <div style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 26,
                    color: "var(--muted)",
                    width: 32,
                    flexShrink: 0,
                    lineHeight: 1,
                    textAlign: "center",
                  }}>{currentSpeech}</div>

                  <div style={{ width: "0.5px", height: 40, background: "var(--line)", flexShrink: 0 }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 3px", color: "var(--ink)" }}>{r.topic}</p>
                    <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 8px" }}>
                      vs @{opponent?.username} &nbsp;·&nbsp; {myRole === "pro" ? "Pro" : "Con"} &nbsp;·&nbsp; {speechLabels[currentSpeech - 1]}
                    </p>
                    {/* progress dots */}
                    <div style={{ display: "flex", gap: 3 }}>
                      {Array.from({ length: 8 }).map((_, i) => (
                        <span key={i} style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: i < currentSpeech ? "var(--ink)" : "var(--line-strong)",
                          display: "inline-block",
                        }} />
                      ))}
                    </div>
                  </div>

                  <div style={{ flexShrink: 0, textAlign: "right" }}>
                    {isMyTurn ? (
                      <span className="db-badge db-badge--turn" style={{ fontSize: 11 }}>your turn →</span>
                    ) : (
                      <span className="db-badge db-badge--wait" style={{ fontSize: 11 }}>waiting…</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── CTA bar ── */}
      <div style={{
        background: "#111",
        borderRadius: "var(--radius)",
        padding: "18px 22px",
        marginTop: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}>
        <div>
          <p style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 16, color: "#fff", margin: "0 0 3px" }}>
            Ready for a new challenge?
          </p>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#555", margin: 0, letterSpacing: "0.04em" }}>
            debate new ideas · climb the ranks
          </p>
        </div>
        <button onClick={() => router.push("/challenge")} className="db-btn db-btn--accent" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
          Challenge a debater
        </button>
      </div>

    </div>
  );
}