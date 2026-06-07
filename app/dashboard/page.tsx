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
    <div className="db-dash">

      {/* Identity header */}
      <header className="db-dash__header">
        <div className="db-dash__header-row">
          <div className="db-dash__identity">
            <h1 className="db-dash__name">{displayName}</h1>
            <p className="db-dash__username">@{profile.username}</p>
          </div>
          <div className="db-dash__stats">
            <div className="db-dash__stat">
              <span className="db-dash__stat-val db-dash__stat-val--accent">{profile.elo}</span>
              <span className="db-dash__stat-lbl">ELO</span>
            </div>
            <div className="db-dash__stat">
              <span className="db-dash__stat-val">{profile.wins}–{profile.losses}</span>
              <span className="db-dash__stat-lbl">Record</span>
            </div>
            <div className="db-dash__stat">
              <span className="db-dash__stat-val">{winRate}%</span>
              <span className="db-dash__stat-lbl">Win rate</span>
            </div>
          </div>
          <button
            onClick={() => router.push("/challenge")}
            className="db-btn db-btn--accent"
          >
            Challenge
            <span className="db-btn__arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </header>

      <div className="db-dash__body">

        {/* Stale round alerts */}
        {staleRounds.length > 0 && (
          <div className="db-dash__section">
            {staleRounds.map(r => {
              const myRole = r.pro_id === userId ? "pro" : "con";
              const opponent = myRole === "pro" ? r.con : r.pro;
              const lastActivity = lastSpeechMap[r.id] || r.created_at;
              const hoursLeft = Math.max(0, 48 - Math.floor((Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60)));
              return (
                <div key={r.id} className="db-stale-alert">
                  <div>
                    <p className="db-stale-alert__title">Round expiring — {hoursLeft}h left</p>
                    <p className="db-stale-alert__sub">{r.topic} · vs @{opponent?.username}</p>
                  </div>
                  <button onClick={() => router.push(`/round/${r.id}`)} className="db-btn db-btn--sm db-btn--accent" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
                    Submit now →
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Incoming challenges */}
        {incoming.length > 0 && (
          <div className="db-dash__section">
            <div className="db-dash__section-hd">
              <p className="db-dash__section-title">Incoming challenges</p>
              <div className="db-dash__section-line" />
              <span className="db-dash__section-count">{incoming.length}</span>
            </div>
            {incoming.map(r => {
              const opponent = r.challenger_id === r.pro_id ? r.pro : r.con;
              const myRole = r.pro_id === userId ? "Pro" : "Con";
              return (
                <div key={r.id} className="db-challenge-card">
                  <div className="db-challenge-card__hd">
                    <h3 className="db-challenge-card__topic">{r.topic}</h3>
                    <span className={`db-badge ${r.is_ranked ? "db-badge--turn" : "db-badge--wait"}`}>
                      {r.is_ranked ? "Ranked" : "Unranked"}
                    </span>
                  </div>
                  <p className="db-challenge-card__meta">
                    from @{opponent?.username} (ELO {opponent?.elo}) · you are {myRole}
                  </p>
                  <div className="db-challenge-card__btns">
                    <button onClick={() => handleAccept(r.id)} className="db-btn db-btn--accent db-btn--sm">Accept</button>
                    <button onClick={() => handleDecline(r.id)} className="db-btn db-btn--ghost db-btn--sm">Decline</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Active rounds */}
        {active.length > 0 && (
          <div className="db-dash__section">
            <div className="db-dash__section-hd">
              <p className="db-dash__section-title">Active rounds</p>
              <div className="db-dash__section-line" />
              <span className="db-dash__section-count">{active.length}</span>
            </div>
            {active.map(r => {
              const myRole = r.pro_id === userId ? "pro" : "con";
              const opponent = myRole === "pro" ? r.con : r.pro;
              const currentSpeech = r.current_speech || 1;
              const isMyTurn = (currentSpeech % 2 === 1 && myRole === "pro") || (currentSpeech % 2 === 0 && myRole === "con");
              const isStale = staleRounds.some(s => s.id === r.id);
              const progress = ((currentSpeech - 1) / 8) * 100;
              return (
                <div
                  key={r.id}
                  className={`db-round-row${isStale ? " db-round-row--stale" : isMyTurn ? " db-round-row--turn" : ""}`}
                  onClick={() => router.push(`/round/${r.id}`)}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <p className="db-round-row__topic">{r.topic}</p>
                      {r.is_ranked && <span className="db-badge db-badge--turn">Ranked</span>}
                    </div>
                    <p className="db-round-row__meta">
                      vs @{opponent?.username} (ELO {opponent?.elo}) · {myRole === "pro" ? "Pro" : "Con"} · {speechLabels[currentSpeech - 1]}
                    </p>
                    <div className="db-round-row__bar-row">
                      <div className="db-round-row__bar">
                        <div className="db-round-row__bar-fill" style={{ width: `${progress}%` }} />
                      </div>
                      <span className="db-round-row__bar-lbl">Speech {currentSpeech}/8</span>
                    </div>
                  </div>
                  <div className="db-round-row__aside">
                    {isMyTurn
                      ? <span className="db-badge db-badge--turn">Your turn →</span>
                      : <span className="db-badge db-badge--wait">Waiting</span>
                    }
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Outgoing / sent challenges */}
        {outgoing.length > 0 && (
          <div className="db-dash__section">
            <div className="db-dash__section-hd">
              <p className="db-dash__section-title">Sent challenges</p>
              <div className="db-dash__section-line" />
            </div>
            <div className="db-card" style={{ padding: "0 20px" }}>
              {outgoing.map(r => {
                const opponent = r.pro_id === userId ? r.con : r.pro;
                return (
                  <div key={r.id} className="db-outgoing-row">
                    <span style={{ width: 6, height: 6, borderRadius: "50%", border: "1px solid var(--muted)", display: "inline-block", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, color: "var(--ink)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.topic}</p>
                      <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>awaiting @{opponent?.username}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top ranked round to watch */}
        {otherPublicRounds.length > 0 && (
          <div className="db-dash__section">
            <div className="db-dash__section-hd">
              <p className="db-dash__section-title">Top ranked round</p>
              <div className="db-dash__section-line" />
              <button className="db-dash__section-link" onClick={() => router.push("/watch")}>See all →</button>
            </div>
            {(() => {
              const r = [...otherPublicRounds].sort((a, b) => {
                const eloA = (a.pro?.elo || 0) + (a.con?.elo || 0);
                const eloB = (b.pro?.elo || 0) + (b.con?.elo || 0);
                return eloB - eloA;
              })[0];
              const currentSpeech = r.current_speech || 1;
              const progress = ((currentSpeech - 1) / 8) * 100;
              return (
                <div className="db-watch-card" onClick={() => router.push(`/round/${r.id}`)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
                    <p className="db-round-row__topic" style={{ margin: 0 }}>{r.topic}</p>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", whiteSpace: "nowrap", fontFeatureSettings: '"tnum" 1', flexShrink: 0 }}>
                      {(r.pro?.elo || 0) + (r.con?.elo || 0)} ELO
                    </span>
                  </div>
                  <p className="db-round-row__meta" style={{ marginBottom: 10 }}>
                    @{r.pro?.username} ({r.pro?.elo}) Pro · @{r.con?.username} ({r.con?.elo}) Con · {speechLabels[currentSpeech - 1]}
                  </p>
                  <div className="db-round-row__bar-row">
                    <div className="db-round-row__bar">
                      <div className="db-round-row__bar-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="db-round-row__bar-lbl">Speech {currentSpeech}/8</span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* CTA strip */}
        <div className="db-dash__cta">
          <div>
            <p className="db-dash__cta-heading">Start a new round</p>
            <p className="db-dash__cta-sub">Find an opponent and pick your side</p>
          </div>
          <button onClick={() => router.push("/challenge")} className="db-btn db-btn--accent" style={{ flexShrink: 0 }}>
            Challenge a debater
            <span className="db-btn__arrow" aria-hidden="true">→</span>
          </button>
        </div>

      </div>
    </div>
  );
}