"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { searchTopics, type Topic } from "@/lib/topics";
import type { CSSProperties } from "react";

interface Profile {
  id: string;
  username: string;
  display_name: string;
  elo: number;
}

const PICKS = [
  { value: "pro",    label: "Pro",    sub: "You're Pro · opponent picks speaking order" },
  { value: "con",    label: "Con",    sub: "You're Con · opponent picks speaking order" },
  { value: "first",  label: "1st",   sub: "You speak first · opponent picks side" },
  { value: "second", label: "2nd",   sub: "You speak second · opponent picks side" },
] as const;

export default function ChallengePage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [topicQuery, setTopicQuery] = useState("");
  const [topic, setTopic] = useState<Topic | null>(null);
  const topicResults = topicQuery && !topic ? searchTopics(topicQuery) : [];
  const [pick, setPick] = useState<"pro" | "con" | "first" | "second">("pro");
  const [isRanked, setIsRanked] = useState(true);
  const [loading, setLoading] = useState(false);
  const [randomLoading, setRandomLoading] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name, elo")
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .limit(8);
    setResults(data || []);
  }, []);

  function handleSearchChange(val: string) {
    setSearch(val);
    if (selected) { setSelected(null); }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(val), 250);
  }

  async function handleRandomOpponent() {
    setRandomLoading(true);
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/login"); return; }
    const myId = session.user.id;
    const { data: me } = await supabase
      .from("profiles")
      .select("elo")
      .eq("id", myId)
      .single();
    const myElo = me?.elo ?? 1000;
    const range = 150;
    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name, elo")
      .neq("id", myId)
      .gte("elo", myElo - range)
      .lte("elo", myElo + range)
      .limit(20);
    setRandomLoading(false);
    if (!data || data.length === 0) {
      setError("No opponents found within ±150 ELO. Try a manual search.");
      return;
    }
    const pick = data[Math.floor(Math.random() * data.length)];
    setSelected(pick);
    setSearch(pick.display_name || pick.username);
    setResults([]);
  }

  async function handleChallenge() {
    setError("");
    if (!selected || !topic) { setError("Select an opponent and a topic."); return; }
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/login"); return; }
    const myId = session.user.id;
    const pro_id = pick === "con" ? selected.id : myId;
    const con_id = pick === "con" ? myId : selected.id;
    const { error } = await supabase.from("rounds").insert({
      topic: topic.text, pro_id, con_id, challenger_id: myId,
      challenger_pick: pick, status: "pending", current_speech: 1, is_ranked: isRanked,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    router.push("/dashboard");
  }

  return (
    <>
      <style>{`.db-shell { background-image: url("/5.png") !important; }`}</style>
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "0 clamp(24px, 5vw, 48px) 100px" }}>

        <div style={{ paddingTop: "clamp(20px, 4vh, 36px)" }}>
          <button onClick={() => router.push("/dashboard")} style={backBtn}>← Back</button>
        </div>

        <section style={{ paddingTop: "clamp(20px, 4vh, 32px)", paddingBottom: "clamp(12px, 2vh, 20px)" }}>
          <h1 className="ab-hero-line" style={{ '--i': '0', ...heroTitle } as CSSProperties}>
            New<br />challenge
          </h1>
        </section>

        {error && (
          <p style={{ fontSize: 13, color: "oklch(0.70 0.20 28)", margin: "0 0 20px", textShadow: "0 1px 4px rgba(0,0,0,0.40)" }}>
            ⚑ {error}
          </p>
        )}

        <div style={rule}><div style={ruleDot} /><div style={ruleLine} /></div>

        {/* 01 Opponent */}
        <section>
          <p style={eyebrow}>01 — Find your opponent</p>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <input
              className="lp-input"
              style={{ flex: 1 }}
              placeholder="Search by name or username…"
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              onKeyDown={e => e.key === "Enter" && runSearch(search)}
            />
          </div>
          <button
            onClick={handleRandomOpponent}
            disabled={randomLoading}
            style={randomBtn}
          >
            {randomLoading ? "Finding…" : "Random opponent (±150 ELO)"}
          </button>

          {results.map(p => (
            <div
              key={p.id}
              onClick={() => { setSelected(p); setResults([]); setSearch(p.username); }}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.08)",
                cursor: "pointer",
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: "#fff", textShadow: "0 1px 6px rgba(0,0,0,0.35)" }}>
                  {p.display_name || p.username}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.40)" }}>@{p.username}</p>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "rgba(255,255,255,0.38)" }}>{p.elo}</span>
            </div>
          ))}

          {selected && (
            <p style={{ fontSize: 13, color: "var(--accent)", marginTop: 10, textShadow: "0 1px 4px rgba(0,0,0,0.30)" }}>
              ✓ {selected.display_name || selected.username}
              <span style={{ color: "rgba(255,255,255,0.38)", fontFamily: "var(--font-mono)", fontSize: 11, marginLeft: 10 }}>
                ELO {selected.elo}
              </span>
            </p>
          )}
        </section>

        <div style={rule}><div style={ruleDot} /><div style={ruleLine} /></div>

        {/* 02 Topic */}
        <section>
          <p style={eyebrow}>02 — Topic</p>
          <input
            className="lp-input"
            placeholder="Search resolutions — try “Taiwan”, “April 2025”, “nuclear”…"
            value={topic ? topic.text : topicQuery}
            onChange={e => { setTopic(null); setTopicQuery(e.target.value); }}
          />

          {topicResults.map(t => (
            <div
              key={t.tag}
              onClick={() => { setTopic(t); setTopicQuery(""); }}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 14,
                padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.08)",
                cursor: "pointer",
              }}
            >
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: "#fff", lineHeight: 1.45, textShadow: "0 1px 6px rgba(0,0,0,0.35)" }}>
                {t.text}
              </p>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,255,255,0.38)", whiteSpace: "nowrap", flexShrink: 0 }}>
                {t.tag}
              </span>
            </div>
          ))}

          {topicQuery.trim() && !topic && topicResults.length === 0 && (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", marginTop: 12 }}>
              No resolution matches that.
            </p>
          )}

          {topic && (
            <p style={{ fontSize: 13, color: "var(--accent)", marginTop: 12, lineHeight: 1.5, textShadow: "0 1px 4px rgba(0,0,0,0.30)" }}>
              ✓ {topic.text}
              <span style={{ color: "rgba(255,255,255,0.38)", fontFamily: "var(--font-mono)", fontSize: 11, marginLeft: 10 }}>
                {topic.tag}
              </span>
            </p>
          )}
        </section>

        <div style={rule}><div style={ruleDot} /><div style={ruleLine} /></div>

        {/* 03 Pick */}
        <section>
          <p style={eyebrow}>03 — Your pick</p>
          {PICKS.map(opt => (
            <div
              key={opt.value}
              onClick={() => setPick(opt.value)}
              style={{
                display: "flex", alignItems: "center", gap: 18,
                padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.08)",
                cursor: "pointer",
              }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: pick === opt.value ? "var(--accent)" : "rgba(255,255,255,0.22)", transition: "color 0.15s", lineHeight: 1 }}>
                {pick === opt.value ? "●" : "○"}
              </span>
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: pick === opt.value ? "#fff" : "rgba(255,255,255,0.50)", textShadow: "0 1px 6px rgba(0,0,0,0.35)", transition: "color 0.15s" }}>
                  {opt.label}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.32)" }}>{opt.sub}</p>
              </div>
            </div>
          ))}
        </section>

        <div style={rule}><div style={ruleDot} /><div style={ruleLine} /></div>

        {/* 04 Round type */}
        <section>
          <p style={eyebrow}>04 — Round type</p>
          {([
            { value: true,  label: "Ranked",   sub: "ELO changes · visible publicly" },
            { value: false, label: "Unranked", sub: "No ELO change · private" },
          ] as const).map(opt => (
            <div
              key={String(opt.value)}
              onClick={() => setIsRanked(opt.value)}
              style={{
                display: "flex", alignItems: "center", gap: 18,
                padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.08)",
                cursor: "pointer",
              }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: isRanked === opt.value ? "var(--accent)" : "rgba(255,255,255,0.22)", transition: "color 0.15s", lineHeight: 1 }}>
                {isRanked === opt.value ? "●" : "○"}
              </span>
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: isRanked === opt.value ? "#fff" : "rgba(255,255,255,0.50)", textShadow: "0 1px 6px rgba(0,0,0,0.35)", transition: "color 0.15s" }}>
                  {opt.label}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.32)" }}>{opt.sub}</p>
              </div>
            </div>
          ))}
        </section>

        <div style={{ marginTop: "clamp(40px, 7vh, 64px)" }}>
          <button onClick={handleChallenge} disabled={loading} className="db-btn db-btn--accent db-btn--block db-btn--lg">
            {loading ? "Sending…" : "Send challenge"}
            {!loading && <span className="db-btn__arrow" aria-hidden="true">→</span>}
          </button>
        </div>

      </div>
    </>
  );
}

const backBtn: CSSProperties = { background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 13, color: "rgba(255,255,255,0.65)", padding: "8px 0", textShadow: "0 1px 4px rgba(0,0,0,0.35)" };
const heroTitle: CSSProperties = { fontFamily: "var(--font-display)", fontSize: "clamp(52px, 11vw, 100px)", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", margin: 0, lineHeight: 0.92, textShadow: "0 2px 20px rgba(0,0,0,0.45), 0 8px 40px rgba(0,0,0,0.22)" };
const eyebrow: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)", margin: "0 0 16px", textShadow: "0 1px 4px rgba(0,0,0,0.30)" };
const rule: CSSProperties = { display: "flex", alignItems: "center", gap: 12, margin: "clamp(28px, 5vh, 44px) 0" };
const ruleDot: CSSProperties = { width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 };
const ruleLine: CSSProperties = { flex: 1, height: 1, background: "rgba(255,255,255,0.15)" };
const searchBtn: CSSProperties = { height: 46, padding: "0 20px", background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 10, fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "var(--font-body)" };
const randomBtn: CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginBottom: 16, height: 40, padding: "0 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8, fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.60)", cursor: "pointer", fontFamily: "var(--font-body)", letterSpacing: "0.02em" };
