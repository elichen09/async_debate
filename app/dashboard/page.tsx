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
  is_ranked: boolean;
  created_at: string;
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
  const [publicRounds, setPublicRounds] = useState<Round[]>([]);
  const [staleRounds, setStaleRounds] = useState<Round[]>([]);
  const [lastSpeechMap, setLastSpeechMap] = useState<Record<string, string>>({});
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
          id, topic, status, pro_id, con_id, challenger_id, current_speech, winner_id, is_ranked, created_at,
          pro:profiles!pro_id(username, display_name, elo),
          con:profiles!con_id(username, display_name, elo)
        `)
        .in("status", ["pending", "active"])
        .or(`pro_id.eq.${id},con_id.eq.${id}`);

      const allRounds = (rounds || []) as unknown as Round[];
      const activeRounds = allRounds.filter(r => r.status === "active");

      setIncoming(allRounds.filter(r => r.challenger_id !== id && r.status === "pending"));
      setOutgoing(allRounds.filter(r => r.challenger_id === id && r.status === "pending"));
      setActive(activeRounds);

      // fetch last speech for each active round
      const speechMap: Record<string, string> = {};
      if (activeRounds.length > 0) {
        const { data: lastSpeeches } = await supabase
          .from("speeches")
          .select("round_id, submitted_at")
          .in("round_id", activeRounds.map(r => r.id))
          .order("submitted_at", { ascending: false });

        for (const s of lastSpeeches || []) {
          if (!speechMap[s.round_id]) speechMap[s.round_id] = s.submitted_at;
        }
      }
      setLastSpeechMap(speechMap);

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      setStaleRounds(activeRounds.filter(r => {
        const lastActivity = speechMap[r.id] || r.created_at;
        return lastActivity < oneDayAgo;
      }));

      const { data: pubRounds } = await supabase
        .from("rounds")
        .select(`
          id, topic, status, pro_id, con_id, challenger_id, current_speech, winner_id, is_ranked, created_at,
          pro:profiles!pro_id(username, display_name, elo),
          con:profiles!con_id(username, display_name, elo)
        `)
        .eq("is_ranked", true)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(10);

      setPublicRounds((pubRounds || []) as unknown as Round[]);
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
    <p style={{ textAlign: "center", marginTop: "4rem", color: "var(--muted)", fontFamily: "var(--font-body)" }}>
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

  const otherPublicRounds = publicRounds.filter(r => r.pro_id !== userId && r.con_id !== userId);

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 20px 80px" }}>

      <div style={{ marginBottom: 16 }}>
        <button onClick={() => router.push("/judge")} style={ghostBtn}>
          Judge dashboard →
        </button>
      </div>

      {/* Stale round warnings */}
      {staleRounds.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          {staleRounds.map(r => {
            const myRole = r.pro_id === userId ? "pro" : "con";
            const opponent = myRole === "pro" ? r.con : r.pro;
            const lastActivity = lastSpeechMap[r.id] || r.created_at;
            const hoursLeft = Math.max(0, 48 - Math.floor((Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60)));
            return (
              <div key={r.id} style={{
                background: "color-mix(in srgb, var(--warn) 8%, transparent)",
                border: "0.5px solid color-mix(in srgb, var(--warn) 35%, transparent)",
                borderRadius: 12, padding: "12px 16px",
                marginBottom: 8,
                display: "flex", alignItems: "center",
                justifyContent: "space-between", gap: 12,
              }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: "var(--warn)", margin: "0 0 2px" }}>
                    ⚠ Round expiring soon — {r.topic}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>
                    vs @{opponent?.username} · {hoursLeft}h left before deletion
                  </p>
                </div>
                <button
                  onClick={() => router.push(`/round/${r.id}`)}
                  style={{
                    padding: "7px 14px", background: "var(--warn)",
                    color: "var(--accent-ink)", border: "none", borderRadius: 8,
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                    whiteSpace: "nowrap", flexShrink: 0,
                  }}
                >
                  Submit speech →
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Hero card */}
      <div style={{
        position: "relative",
        background: "color-mix(in srgb, var(--ink) 4%, transparent)",
        border: "0.5px solid var(--line)",
        borderRadius: 14,
        padding: "22px 24px 20px",
        marginBottom: 14,
        overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -60, right: -60, width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle, color-mix(in srgb, var(--accent) 12%, transparent), transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -80, left: -40, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, color-mix(in srgb, var(--pro) 20%, transparent), transparent 70%)", pointerEvents: "none" }} />

        <p style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 8, position: "relative", zIndex: 1 }}>
          debater profile
        </p>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(26px, 5vw, 34px)", color: "var(--ink)", letterSpacing: "-0.02em", lineHeight: 1, marginBottom: 4, position: "relative", zIndex: 1 }}>
          {displayName}
        </h1>
        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 18, position: "relative", zIndex: 1 }}>
          @{profile.username}
        </p>

        <div style={{ display: "flex", position: "relative", zIndex: 1 }}>
          {[
            { label: "ELO rating", value: String(profile.elo), gold: true },
            { label: "record", value: `${profile.wins}–${profile.losses}`, gold: false },
            { label: "win rate", value: `${winRate}%`, gold: false },
          ].map((s, i, arr) => (
            <div key={s.label} style={{
              padding: "10px 18px",
              background: "var(--card)",
              border: "0.5px solid var(--line)",
              borderRadius: i === 0 ? "8px 0 0 8px" : i === arr.length - 1 ? "0 8px 8px 0" : "0",
            }}>
              <p style={{ fontSize: 20, fontWeight: 500, color: s.gold ? "var(--accent)" : "var(--ink)", lineHeight: 1, margin: 0 }}>{s.value}</p>
              <p style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginTop: 3 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Incoming challenges */}
      {incoming.length > 0 && (
        <section style={{ marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "18px 0 10px" }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 17, color: "var(--accent)" }}>Incoming challenges</h2>
            <span style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.04em" }}>{incoming.length} pending</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {incoming.map(r => {
              const opponent = r.challenger_id === r.pro_id ? r.pro : r.con;
              const myRole = r.pro_id === userId ? "Pro" : "Con";
              return (
                <div key={r.id} style={{ background: "var(--card)", border: "0.5px solid color-mix(in srgb, var(--accent) 25%, transparent)", borderRadius: 12, overflow: "hidden", display: "grid", gridTemplateColumns: "1fr 72px" }}>
                  <div style={{ padding: "16px 18px" }}>
                    <p style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--accent)", margin: "0 0 8px", display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)", display: "inline-block", flexShrink: 0 }} />
                      {r.is_ranked ? "ranked challenge" : "unranked challenge"}
                    </p>
                    <h3 style={{ fontFamily: "var(--font-display)", fontSize: 19, color: "var(--ink)", marginBottom: 5 }}>{r.topic}</h3>
                    <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 11px" }}>
                      from @{opponent?.username} · you are {myRole} · ELO {opponent?.elo}
                    </p>
                    <div style={{ display: "flex", gap: 7 }}>
                      <button onClick={() => handleAccept(r.id)} style={acceptBtn}>Accept</button>
                      <button onClick={() => handleDecline(r.id)} style={declineBtn}>Decline</button>
                    </div>
                  </div>
                  <div style={{ background: "var(--card)", display: "flex", alignItems: "center", justifyContent: "center" }}>
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

      {/* Outgoing challenges */}
      {outgoing.length > 0 && (
        <section style={{ marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "18px 0 10px" }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 17, color: "var(--accent)" }}>Sent challenges</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {outgoing.map(r => {
              const opponent = r.pro_id === userId ? r.con : r.pro;
              return (
                <div key={r.id} style={{ background: "var(--card)", border: "0.5px solid var(--paper-2)", borderRadius: 12, padding: "13px 16px", opacity: 0.6, display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", border: "0.5px solid var(--line-strong)", display: "inline-block", flexShrink: 0 }} />
                  <div>
                    <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 2px", color: "var(--ink)" }}>{r.topic}</p>
                    <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>waiting for @{opponent?.username} to respond</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Active rounds */}
      {active.length > 0 && (
        <section style={{ marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "18px 0 10px" }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 17, color: "var(--accent)" }}>Active rounds</h2>
            <span style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.04em" }}>{active.length} in play</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {active.map(r => {
              const myRole = r.pro_id === userId ? "pro" : "con";
              const opponent = myRole === "pro" ? r.con : r.pro;
              const currentSpeech = r.current_speech || 1;
              const isMyTurn = (currentSpeech % 2 === 1 && myRole === "pro") || (currentSpeech % 2 === 0 && myRole === "con");
              const isStale = staleRounds.some(s => s.id === r.id);
              return (
                <div key={r.id} onClick={() => router.push(`/round/${r.id}`)} style={{ background: "var(--card)", border: `0.5px solid ${isStale ? "color-mix(in srgb, var(--warn) 35%, transparent)" : isMyTurn ? "color-mix(in srgb, var(--accent) 35%, transparent)" : "var(--line)"}`, borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--muted)", width: 28, flexShrink: 0, textAlign: "center", lineHeight: 1 }}>
                    {currentSpeech}
                  </div>
                  <div style={{ width: "0.5px", height: 36, background: "var(--line)", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <p style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)", margin: 0 }}>{r.topic}</p>
                      {r.is_ranked && <span style={{ fontSize: 9, fontWeight: 600, color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 10%, transparent)", padding: "2px 6px", borderRadius: 4, letterSpacing: "0.08em", textTransform: "uppercase", flexShrink: 0 }}>ranked</span>}
                    </div>
                    <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 7px" }}>
                      vs @{opponent?.username} · {myRole === "pro" ? "Pro" : "Con"} · {speechLabels[currentSpeech - 1]}
                    </p>
                    <div style={{ display: "flex", gap: 3 }}>
                      {Array.from({ length: 8 }).map((_, i) => (
                        <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block", background: i < currentSpeech ? "var(--accent)" : "var(--line-strong)" }} />
                      ))}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: "right" }}>
                    {isMyTurn ? (
                      <span style={{ fontSize: 10, padding: "4px 10px", background: "var(--accent)", color: "var(--accent-ink)", borderRadius: 20, fontWeight: 600, whiteSpace: "nowrap" }}>your turn →</span>
                    ) : (
                      <span style={{ fontSize: 10, padding: "4px 10px", background: "var(--paper-2)", color: "var(--muted)", borderRadius: 20, whiteSpace: "nowrap" }}>waiting…</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Top ranked round */}
      {otherPublicRounds.length > 0 && (
        <section style={{ marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "18px 0 10px" }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 17, color: "var(--accent)" }}>Top ranked round</h2>
            <span
              onClick={() => router.push("/watch")}
              style={{ fontSize: 11, color: "var(--accent)", letterSpacing: "0.04em", cursor: "pointer" }}
            >
              See all →
            </span>
          </div>
          {(() => {
            const r = [...otherPublicRounds].sort((a, b) => {
              const eloA = (a.pro?.elo || 0) + (a.con?.elo || 0);
              const eloB = (b.pro?.elo || 0) + (b.con?.elo || 0);
              return eloB - eloA;
            })[0];
            const currentSpeech = r.current_speech || 1;
            const progress = ((currentSpeech - 1) / 8) * 100;
            const speechLabels = ["Pro Constructive","Con Constructive","Pro Rebuttal","Con Rebuttal","Pro Summary","Con Summary","Pro Final Focus","Con Final Focus"];
            return (
              <div onClick={() => router.push(`/round/${r.id}`)} style={{ background: "var(--card)", border: "0.5px solid color-mix(in srgb, var(--accent) 20%, transparent)", borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)", margin: "0 0 4px" }}>{r.topic}</p>
                  <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 8px" }}>
                    @{r.pro?.username} <span style={{ color: "var(--accent)" }}>{r.pro?.elo}</span> (Pro) vs @{r.con?.username} <span style={{ color: "var(--accent)" }}>{r.con?.elo}</span> (Con)
                  </p>
                  <div style={{ height: 3, background: "var(--line)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${progress}%`, background: "var(--accent)", borderRadius: 2 }} />
                  </div>
                </div>
                <div style={{ flexShrink: 0, textAlign: "right" }}>
                  <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 3px" }}>{speechLabels[currentSpeech - 1]}</p>
                  <p style={{ fontSize: 10, color: "color-mix(in srgb, var(--accent) 60%, transparent)", margin: 0 }}>⚡ {(r.pro?.elo || 0) + (r.con?.elo || 0)} ELO</p>
                </div>
              </div>
            );
          })()}
        </section>
      )}

      {/* CTA */}
      <div style={{ marginTop: 12, background: "var(--card)", border: "0.5px solid color-mix(in srgb, var(--accent) 20%, transparent)", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", right: -30, top: -30, width: 120, height: 120, borderRadius: "50%", background: "radial-gradient(circle, color-mix(in srgb, var(--accent) 10%, transparent), transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <p style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 15, color: "var(--ink)", margin: "0 0 3px" }}>Ready for a new challenge?</p>
          <p style={{ fontSize: 11, color: "var(--muted)" }}>debate new ideas · climb the ranks</p>
        </div>
        <button onClick={() => router.push("/challenge")} style={ctaBtn}>Challenge a debater</button>
      </div>

    </div>
  );
}

const ghostBtn: React.CSSProperties = { background: "transparent", border: "0.5px solid var(--line-strong)", borderRadius: 8, padding: "8px 14px", fontSize: 14, color: "var(--muted)", cursor: "pointer" };
const acceptBtn: React.CSSProperties = { flex: 1, padding: "8px 0", background: "var(--accent)", color: "var(--accent-ink)", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" };
const declineBtn: React.CSSProperties = { flex: 1, padding: "8px 0", background: "transparent", color: "var(--muted)", border: "0.5px solid var(--line-strong)", borderRadius: 7, fontSize: 12, cursor: "pointer" };
const ctaBtn: React.CSSProperties = { padding: "10px 18px", background: "var(--accent)", color: "var(--accent-ink)", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, position: "relative", zIndex: 1 };