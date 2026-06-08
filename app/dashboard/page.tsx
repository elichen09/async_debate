"use client";

import { useEffect, useRef, useState } from "react";
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
  current_speech: number;
  winner_id: string;
  is_ranked: boolean;
  created_at: string;
  pro: { username: string; display_name: string; elo: number };
  con: { username: string; display_name: string; elo: number };
}

interface Pos { x: number; y: number; }

const SECTION_KEYS = ["cta", "incoming", "active", "outgoing", "watch"] as const;
type SectionKey = typeof SECTION_KEYS[number];

// Two-column defaults so all cards start within the viewport
const DEFAULTS: Record<SectionKey, Pos> = {
  cta:      { x: 20,  y: 20  },
  incoming: { x: 20,  y: 160 },
  active:   { x: 20,  y: 360 },
  outgoing: { x: 480, y: 20  },
  watch:    { x: 480, y: 210 },
};

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

  // Section card positions
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const posRef = useRef<Record<string, Pos>>({});
  const dragRef = useRef<{ key: string; offsetX: number; offsetY: number } | null>(null);
  const rafRef = useRef<number>(0);

  // Profile card position
  const [profilePos, setProfilePos] = useState<Pos | null>(null);
  const profilePosRef = useRef<Pos | null>(null);
  const profileDragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const profileRafRef = useRef<number>(0);
  const [profileDragging, setProfileDragging] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("gh-card-positions");
      if (saved) { const p = JSON.parse(saved); setPositions(p); posRef.current = p; }
    } catch {}
    try {
      const saved = localStorage.getItem("gh-profile-card-pos");
      if (saved) {
        const p = JSON.parse(saved);
        profilePosRef.current = p;
        setProfilePos(p);
      } else {
        // Default: bottom-right, computed client-side
        const p = { x: window.innerWidth - 248, y: window.innerHeight - 220 };
        profilePosRef.current = p;
        setProfilePos(p);
      }
    } catch {}
  }, []);

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

  // Section card drag handlers
  function startDrag(key: string, e: React.PointerEvent) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = posRef.current[key] ?? DEFAULTS[key as SectionKey] ?? { x: 20, y: 20 };
    dragRef.current = { key, offsetX: e.clientX - p.x, offsetY: e.clientY - p.y };
    setActiveCard(key);
  }
  function moveDrag(key: string, e: React.PointerEvent) {
    if (!dragRef.current || dragRef.current.key !== key) return;
    const x = Math.max(0, Math.min(window.innerWidth - 440, e.clientX - dragRef.current.offsetX));
    const y = Math.max(44, Math.min(window.innerHeight - 44 - 52, e.clientY - dragRef.current.offsetY));
    posRef.current = { ...posRef.current, [key]: { x, y } };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => setPositions({ ...posRef.current }));
  }
  function endDrag(key: string) {
    if (!dragRef.current || dragRef.current.key !== key) return;
    dragRef.current = null;
    setActiveCard(null);
    try { localStorage.setItem("gh-card-positions", JSON.stringify(posRef.current)); } catch {}
  }

  // Profile card drag handlers
  function startProfileDrag(e: React.PointerEvent) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = profilePosRef.current ?? { x: window.innerWidth - 248, y: window.innerHeight - 220 };
    profileDragRef.current = { offsetX: e.clientX - p.x, offsetY: e.clientY - p.y };
    setProfileDragging(true);
  }
  function moveProfileDrag(e: React.PointerEvent) {
    if (!profileDragRef.current) return;
    const x = Math.max(0, Math.min(window.innerWidth - 208, e.clientX - profileDragRef.current.offsetX));
    const y = Math.max(44, Math.min(window.innerHeight - 44 - 52, e.clientY - profileDragRef.current.offsetY));
    profilePosRef.current = { x, y };
    cancelAnimationFrame(profileRafRef.current);
    profileRafRef.current = requestAnimationFrame(() => setProfilePos({ x, y }));
  }
  function endProfileDrag() {
    if (!profileDragRef.current) return;
    profileDragRef.current = null;
    setProfileDragging(false);
    if (profilePosRef.current) {
      try { localStorage.setItem("gh-profile-card-pos", JSON.stringify(profilePosRef.current)); } catch {}
    }
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100dvh - 44px)" }}>
      <div className="db-card" style={{ padding: "28px 40px", textAlign: "center" }}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 11, letterSpacing: "0.1em", color: "var(--muted)", margin: "0 0 14px", textTransform: "uppercase" }}>
          Grasshopper
        </p>
        <div className="gh-loading-dots">
          <span /><span /><span />
        </div>
      </div>
    </div>
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
  const topRound = otherPublicRounds.length > 0
    ? [...otherPublicRounds].sort(
        (a, b) => ((b.pro?.elo ?? 0) + (b.con?.elo ?? 0)) - ((a.pro?.elo ?? 0) + (a.con?.elo ?? 0))
      )[0]
    : null;

  return (
    <>
      <style>{`.db-shell { background-image: url("/bg-app.png"), url("/hero-bg.png") !important; }`}</style>
      {/* Mobile-only profile strip */}
      <div className="gh-mobile-profile" style={{ padding: "16px 20px 0" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="db-eyebrow">Grasshopper</p>
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
        </div>
        <button onClick={() => router.push("/challenge")} className="db-btn db-btn--accent db-btn--sm" style={{ flexShrink: 0 }}>
          Challenge →
        </button>
      </div>

      {/* Stale alerts */}
      {staleRounds.length > 0 && (
        <div style={{ padding: "8px 20px 0", display: "flex", flexDirection: "column", gap: 8 }}>
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

      {/* Freeform canvas */}
      <div className="gh-dash__canvas">
        {SECTION_KEYS.map((key, keyIndex) => {
          if (key === "incoming" && incoming.length === 0) return null;
          if (key === "active" && active.length === 0) return null;
          if (key === "outgoing" && outgoing.length === 0) return null;
          if (key === "watch" && !topRound) return null;

          const pos = positions[key] ?? DEFAULTS[key];
          const isDragging = activeCard === key;

          const handle = (
            <span
              className="db-drag-handle"
              aria-hidden="true"
              onPointerDown={(e) => startDrag(key, e)}
              onPointerMove={(e) => moveDrag(key, e)}
              onPointerUp={() => endDrag(key)}
              onPointerCancel={() => endDrag(key)}
            >⠿</span>
          );

          let content: React.ReactNode = null;

          if (key === "cta") {
            content = (
              <div className="db-card db-dash__cta">
                <div>
                  <p className="db-dash__cta-heading">Start a new round</p>
                  <p className="db-dash__cta-sub">Find an opponent and pick your side</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button onClick={() => router.push("/challenge")} className="db-btn db-btn--accent" style={{ flexShrink: 0 }}>
                    Challenge a debater
                    <span className="db-btn__arrow" aria-hidden="true">→</span>
                  </button>
                  {handle}
                </div>
              </div>
            );
          } else if (key === "incoming") {
            content = (
              <div className="db-card">
                <div className="db-dash__section-hd">
                  <p className="db-dash__section-title">Incoming challenges</p>
                  <div className="db-dash__section-line" />
                  <span className="db-dash__section-count">{incoming.length}</span>
                  {handle}
                </div>
                {incoming.map(r => {
                  const opponent = r.challenger_id === r.pro_id ? r.pro : r.con;
                  const myRole = r.pro_id === userId ? "Pro" : "Con";
                  return (
                    <div key={r.id} className="db-challenge-card db-challenge-card--flat">
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
            );
          } else if (key === "active") {
            content = (
              <div className="db-card">
                <div className="db-dash__section-hd">
                  <p className="db-dash__section-title">Active rounds</p>
                  <div className="db-dash__section-line" />
                  <span className="db-dash__section-count">{active.length}</span>
                  {handle}
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
                      className={`db-round-row db-round-row--flat${isStale ? " db-round-row--stale" : isMyTurn ? " db-round-row--turn" : ""}`}
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
            );
          } else if (key === "outgoing") {
            content = (
              <div className="db-card">
                <div className="db-dash__section-hd">
                  <p className="db-dash__section-title">Sent challenges</p>
                  <div className="db-dash__section-line" />
                  {handle}
                </div>
                {outgoing.map(r => {
                  const opponent = r.pro_id === userId ? r.con : r.pro;
                  return (
                    <div key={r.id} className="db-outgoing-row">
                      <span style={{ width: 6, height: 6, borderRadius: "50%", border: "1px solid var(--muted)", display: "inline-block", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, color: "var(--ink)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.topic}</p>
                        <p style={{ fontSize: 11, color: "var(--ink-soft)", margin: 0 }}>awaiting @{opponent?.username}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          } else if (key === "watch" && topRound) {
            content = (
              <div className="db-card">
                <div className="db-dash__section-hd">
                  <p className="db-dash__section-title">Top ranked round</p>
                  <div className="db-dash__section-line" />
                  <button className="db-dash__section-link" onClick={() => router.push("/watch")}>See all →</button>
                  {handle}
                </div>
                <div onClick={() => router.push(`/round/${topRound.id}`)} style={{ cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
                    <p className="db-round-row__topic" style={{ margin: 0 }}>{topRound.topic}</p>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", whiteSpace: "nowrap", flexShrink: 0 }}>
                      {(topRound.pro?.elo ?? 0) + (topRound.con?.elo ?? 0)} ELO
                    </span>
                  </div>
                  <p className="db-round-row__meta" style={{ marginBottom: 10 }}>
                    @{topRound.pro?.username} ({topRound.pro?.elo}) Pro · @{topRound.con?.username} ({topRound.con?.elo}) Con · {speechLabels[(topRound.current_speech || 1) - 1]}
                  </p>
                  <div className="db-round-row__bar-row">
                    <div className="db-round-row__bar">
                      <div className="db-round-row__bar-fill" style={{ width: `${(((topRound.current_speech || 1) - 1) / 8) * 100}%` }} />
                    </div>
                    <span className="db-round-row__bar-lbl">Speech {topRound.current_speech || 1}/8</span>
                  </div>
                </div>
              </div>
            );
          }

          if (!content) return null;

          return (
            <div
              key={key}
              className={`db-drag-card${isDragging ? " is-active" : ""}`}
              style={{ left: pos.x, top: pos.y, '--i': String(keyIndex) } as React.CSSProperties}
            >
              {content}
            </div>
          );
        })}
      </div>

      {/* Profile card — draggable, desktop only */}
      <div
        className={`gh-profile-card${profileDragging ? " is-dragging" : ""}`}
        style={profilePos ? {
          top: profilePos.y,
          left: profilePos.x,
          bottom: "auto",
          right: "auto",
        } : {}}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <p className="gh-profile-card__eyebrow" style={{ margin: 0 }}>Your profile</p>
          <span
            className="db-drag-handle"
            style={{ marginLeft: 8 }}
            onPointerDown={startProfileDrag}
            onPointerMove={moveProfileDrag}
            onPointerUp={endProfileDrag}
            onPointerCancel={endProfileDrag}
          >⠿</span>
        </div>
        <h2 className="gh-profile-card__name">{displayName}</h2>
        <p className="gh-profile-card__username">@{profile.username}</p>
        <p className="gh-profile-card__elo">{profile.elo}</p>
        <p className="gh-profile-card__record">{profile.wins}W · {profile.losses}L · {winRate}%</p>
        <button
          onClick={() => router.push("/challenge")}
          className="db-btn db-btn--accent db-btn--sm db-btn--block"
        >
          Challenge →
        </button>
      </div>
    </>
  );
}
