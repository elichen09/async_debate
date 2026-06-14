"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import EloGraph from "@/app/components/EloGraph";
import {
  tierFor,
  reconstructHistory,
  type EloPoint,
  type HistoryRound,
} from "@/lib/elo";
import type { CSSProperties } from "react";

const TOP_N = 10;

interface RankedProfile {
  id: string;
  username: string;
  display_name: string;
  elo: number;
  wins: number;
  losses: number;
}

interface RoundRow {
  id: string;
  topic: string;
  winner_id: string;
  status: string;
  completed_at: string | null;
  created_at: string;
  pro_id: string;
  con_id: string;
  pro: { username: string; elo: number };
  con: { username: string; elo: number };
}

function useCountUp(target: number, duration = 850) {
  const [val, setVal] = useState(target);
  const prevRef = useRef<number | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = prevRef.current === null || prevRef.current === target
      ? Math.max(0, target - 120)
      : prevRef.current;
    prevRef.current = target;
    let raf: number;
    const t0 = performance.now();
    function tick(t: number) {
      const k = reduced ? 1 : Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - k, 4);
      setVal(Math.round(from + (target - from) * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return val;
}

export default function RankingsPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<RankedProfile[]>([]);
  const [myId, setMyId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [points, setPoints] = useState<EloPoint[] | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [flashId, setFlashId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id ?? "";
      setMyId(uid);

      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, elo, wins, losses")
        .order("elo", { ascending: false })
        .limit(500);

      const list = (data || []) as RankedProfile[];
      setProfiles(list);
      setSelectedId(uid && list.some(p => p.id === uid) ? uid : list[0]?.id ?? null);
      setLoading(false);
    }
    load();
  }, []);

  // Load the selected player's Elo timeline
  useEffect(() => {
    if (!selectedId) return;
    let live = true;

    async function loadHistory() {
      setGraphLoading(true);
      const me = profiles.find(p => p.id === selectedId);
      if (!me) { setGraphLoading(false); return; }

      // Exact history if the elo_history table exists (see supabase/rankings.sql)
      const { data: exact, error: exactErr } = await supabase
        .from("elo_history")
        .select("elo, delta, won, opponent_username, topic, round_id, created_at")
        .eq("profile_id", selectedId)
        .order("created_at", { ascending: true });

      if (!exactErr && exact && exact.length > 0 && live) {
        const pts: EloPoint[] = exact.map(e => ({
          elo: e.elo,
          delta: e.delta ?? 0,
          won: e.won ?? null,
          label: e.topic || "Ranked round",
          sub: e.opponent_username ? `vs @${e.opponent_username}` : "",
          date: e.created_at,
          roundId: e.round_id ?? null,
        }));
        pts.unshift({
          elo: pts[0].elo - pts[0].delta,
          delta: 0, won: null, label: "Start", sub: "Joined the ladder",
          date: pts[0].date, roundId: null,
        });
        setPoints(pts);
        setGraphLoading(false);
        return;
      }

      // Fallback: rebuild from completed ranked rounds, anchored to current Elo
      const { data: rounds } = await supabase
        .from("rounds")
        .select(`
          id, topic, winner_id, status, completed_at, created_at, pro_id, con_id,
          pro:profiles!pro_id(username, elo),
          con:profiles!con_id(username, elo)
        `)
        .eq("is_ranked", true)
        .eq("status", "complete")
        .or(`pro_id.eq.${selectedId},con_id.eq.${selectedId}`);

      if (!live) return;

      const history: HistoryRound[] = ((rounds || []) as unknown as RoundRow[])
        .filter(r => r.winner_id)
        .map(r => {
          const opp = r.pro_id === selectedId ? r.con : r.pro;
          return {
            id: r.id,
            topic: r.topic,
            winnerId: r.winner_id,
            opponentUsername: opp?.username ?? "unknown",
            opponentElo: opp?.elo ?? me.elo,
            date: r.completed_at || r.created_at,
          };
        });

      setPoints(reconstructHistory(selectedId!, me.elo, history));
      setGraphLoading(false);
    }

    loadHistory();
    return () => { live = false; };
  }, [selectedId, profiles]);

  // The ladder shows only the top 15; searching reaches the whole ladder.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles.slice(0, TOP_N);
    return profiles.filter(p =>
      p.username.toLowerCase().includes(q) ||
      (p.display_name || "").toLowerCase().includes(q)
    );
  }, [profiles, query]);

  const myRank = useMemo(
    () => profiles.findIndex(p => p.id === myId) + 1,
    [profiles, myId]
  );

  const selected = profiles.find(p => p.id === selectedId) ?? null;
  const selectedRank = selected ? profiles.findIndex(p => p.id === selected.id) + 1 : 0;
  const animatedElo = useCountUp(selected?.elo ?? 0);

  function jumpToMe() {
    if (!myId) return;
    // Outside the top 15 the row only exists once searched for.
    const me = profiles.find(p => p.id === myId);
    setQuery(myRank > TOP_N ? me?.username ?? "" : "");
    setSelectedId(myId);
    setTimeout(() => {
      rowRefs.current[myId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      setFlashId(myId);
      setTimeout(() => setFlashId(null), 1400);
    }, 60);
  }

  function selectPlayer(id: string) {
    setSelectedId(id);
    if (window.matchMedia("(max-width: 900px)").matches) {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100dvh - 44px)" }}>
      <div className="db-card" style={{ padding: "28px 40px", textAlign: "center" }}>
        <div className="gh-loading-dots"><span /><span /><span /></div>
      </div>
    </div>
  );

  const total = profiles.length;
  const selectedTier = selected ? tierFor(selected.elo) : null;
  const selectedWinRate = selected && selected.wins + selected.losses > 0
    ? Math.round((selected.wins / (selected.wins + selected.losses)) * 100)
    : null;

  return (
    <>
      <style>{`.db-shell { background-image: url("/fish/fish2.png") !important; }`}</style>
      <div className="gh-rank">

        <div style={{ paddingTop: "clamp(20px, 4vh, 36px)" }}>
          <button onClick={() => router.push("/dashboard")} style={backBtn}>← Back</button>
        </div>

        {/* Hero */}
        <section style={{ paddingTop: "clamp(20px, 4vh, 32px)" }}>
          <h1 className="ab-hero-line" style={{ "--i": "0", ...heroTitle } as CSSProperties}>Rankings</h1>
          <div className="ab-hero-line gh-rank__sub" style={{ "--i": "1" } as CSSProperties}>
            <span>The top {TOP_N} debaters on the ladder</span>
            {myRank > 0 && (
              <button className="gh-rank__me-chip" onClick={jumpToMe}>
                You are #{myRank} · top {Math.max(1, Math.round((myRank / total) * 100))}%
              </button>
            )}
          </div>
        </section>

        <div style={rule}><div style={ruleDot} /><div style={ruleLine} /></div>

        <div className="gh-rank__grid">

          {/* ---- Selected player panel ---- */}
          <div className="gh-rank__panel" ref={panelRef}>
            {selected && selectedTier && (
              <>
                <div className="gh-rank__panel-hd">
                  <div>
                    <p className="gh-rank__panel-rank">#{selectedRank}</p>
                    <h2 className="gh-rank__panel-name">{selected.display_name || selected.username}</h2>
                    <p className="gh-rank__panel-user">
                      @{selected.username}
                      {selected.id === myId && <span className="gh-rank__you-tag">you</span>}
                    </p>
                  </div>
                  <div className="gh-rank__panel-elo-wrap">
                    <p className="gh-rank__panel-elo">{animatedElo}</p>
                    <p className="gh-rank__panel-tier" style={{ color: selectedTier.color }}>
                      <span className="gh-rank__tier-dot" style={{ background: selectedTier.color }} />
                      {selectedTier.name}
                    </p>
                  </div>
                </div>

                <div className="gh-rank__panel-stats">
                  <span><b>{selected.wins}</b> wins</span>
                  <span><b>{selected.losses}</b> losses</span>
                  {selectedWinRate !== null && <span><b>{selectedWinRate}%</b> win rate</span>}
                </div>

                {graphLoading || !points ? (
                  <div className="gh-graph gh-graph--empty">
                    <div className="gh-loading-dots"><span /><span /><span /></div>
                  </div>
                ) : (
                  <EloGraph points={points} drawKey={selected.id} />
                )}

                {points && points.length > 1 && (
                  <p className="gh-rank__panel-note">
                    Dips and gains across every judged ranked round. Hover the line to revisit each one.
                  </p>
                )}
              </>
            )}
          </div>

          {/* ---- Ladder ---- */}
          <div className="gh-rank__list-wrap">
            <p className="gh-rank__top-label" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)", margin: "0 0 12px", textShadow: "0 1px 4px rgba(0,0,0,0.30)" }}>
              {query.trim() ? "Search results — full ladder" : `Top ${TOP_N} debaters`}
            </p>
            <input
              className="lp-input gh-rank__search"
              placeholder="Search the full ladder…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Search all debaters by name or username"
            />

            {filtered.length === 0 ? (
              <p className="gh-rank__none">Nobody by that name yet.</p>
            ) : (
              <ol className="gh-rank__list">
                {filtered.map((p, i) => {
                  const rank = profiles.findIndex(x => x.id === p.id) + 1;
                  const tier = tierFor(p.elo);
                  const prev = filtered[i - 1];
                  const tierBreak = !prev || tierFor(prev.elo).name !== tier.name;
                  return (
                    <li key={p.id}>
                      {tierBreak && (
                        <div className="gh-rank__tierline" style={{ "--tier": tier.color } as CSSProperties}>
                          <span style={{ color: tier.color }}>{tier.name}</span>
                          <i />
                          <em>{tier.min > 0 ? `${tier.min}+` : `below 800`}</em>
                        </div>
                      )}
                      <button
                        ref={el => { rowRefs.current[p.id] = el; }}
                        className={[
                          "gh-rank__row",
                          selectedId === p.id ? "is-selected" : "",
                          p.id === myId ? "is-me" : "",
                          flashId === p.id ? "is-flash" : "",
                        ].join(" ")}
                        style={{ "--i": String(Math.min(i, 14)) } as CSSProperties}
                        onClick={() => selectPlayer(p.id)}
                      >
                        <span className={`gh-rank__num${rank === 1 ? " is-first" : ""}`}>
                          {String(rank).padStart(2, "0")}
                        </span>
                        <span className="gh-rank__who">
                          <span className="gh-rank__name">{p.display_name || p.username}</span>
                          <span className="gh-rank__user">@{p.username}</span>
                        </span>
                        <span className="gh-rank__record">{p.wins}–{p.losses}</span>
                        <span className="gh-rank__elo">
                          <i className="gh-rank__tier-dot" style={{ background: tier.color }} />
                          {p.elo}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const backBtn: CSSProperties = { background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 13, color: "rgba(255,255,255,0.65)", padding: "8px 0", textShadow: "0 1px 4px rgba(0,0,0,0.35)" };
const heroTitle: CSSProperties = { fontFamily: "var(--font-display)", fontSize: "clamp(56px, 12vw, 110px)", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", margin: 0, lineHeight: 0.92, textShadow: "0 2px 20px rgba(0,0,0,0.45), 0 8px 40px rgba(0,0,0,0.22)" };
const rule: CSSProperties = { display: "flex", alignItems: "center", gap: 12, margin: "clamp(24px, 4vh, 40px) 0" };
const ruleDot: CSSProperties = { width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 };
const ruleLine: CSSProperties = { flex: 1, height: 1, background: "rgba(255,255,255,0.15)" };
