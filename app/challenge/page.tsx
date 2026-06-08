"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface Profile {
  id: string;
  username: string;
  display_name: string;
  elo: number;
}

export default function ChallengePage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [topic, setTopic] = useState("");
  const [side, setSide] = useState<"pro" | "con">("pro");
  const [isRanked, setIsRanked] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch() {
    if (!search.trim()) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name, elo")
      .ilike("username", `%${search}%`)
      .limit(5);
    setResults(data || []);
  }

  async function handleChallenge() {
    setError("");
    if (!selected || !topic.trim()) { setError("Please select an opponent and enter a topic."); return; }
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/login"); return; }
    const myId = session.user.id;
    const { error } = await supabase.from("rounds").insert({
      topic,
      pro_id: side === "pro" ? myId : selected.id,
      con_id: side === "con" ? myId : selected.id,
      challenger_id: myId,
      status: "pending",
      current_speech: 1,
      is_ranked: isRanked,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    router.push("/dashboard");
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "0 20px 80px" }}>

      <div className="db-card" style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0 12px" }}>
        <button onClick={() => router.push("/dashboard")} style={ghostBtn}>← Back</button>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, color: "var(--ink)", margin: 0 }}>New challenge</h1>
      </div>

      {error && (
        <div style={{ background: "color-mix(in srgb, var(--loss) 10%, transparent)", border: "0.5px solid color-mix(in srgb, var(--loss) 30%, transparent)", color: "var(--loss)", padding: "10px 14px", borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Step 1 */}
      <div style={card}>
        <p style={sectionLabel}>1. Find your opponent</p>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...inputStyle, flex: 1 }} placeholder="Search by username" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()} />
          <button onClick={handleSearch} style={searchBtn}>Search</button>
        </div>
        {results.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {results.map(p => (
              <div key={p.id} onClick={() => { setSelected(p); setResults([]); setSearch(p.username); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 8, cursor: "pointer", background: selected?.id === p.id ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "var(--card)", border: `0.5px solid ${selected?.id === p.id ? "color-mix(in srgb, var(--accent) 35%, transparent)" : "var(--line)"}` }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 500, fontSize: 14, color: "var(--ink)" }}>{p.display_name || p.username}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>@{p.username}</p>
                </div>
                <span style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>ELO {p.elo}</span>
              </div>
            ))}
          </div>
        )}
        {selected && (
          <div style={{ marginTop: 10, background: "color-mix(in srgb, var(--accent) 6%, transparent)", border: "0.5px solid color-mix(in srgb, var(--accent) 25%, transparent)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "var(--accent)" }}>
            Selected: <strong>{selected.display_name || selected.username}</strong>
            <span style={{ color: "var(--muted)", marginLeft: 8, fontFamily: "var(--font-mono)" }}>ELO {selected.elo}</span>
          </div>
        )}
      </div>

      {/* Step 2 */}
      <div style={card}>
        <p style={sectionLabel}>2. Enter the topic</p>
        <input style={inputStyle} placeholder="e.g. Resolved: The US should abolish the death penalty." value={topic} onChange={e => setTopic(e.target.value)} />
      </div>

      {/* Step 3 */}
      <div style={card}>
        <p style={sectionLabel}>3. Choose your side</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {(["pro", "con"] as const).map(s => (
            <div key={s} onClick={() => setSide(s)} style={{ padding: "14px 16px", borderRadius: 8, cursor: "pointer", textAlign: "center", background: side === s ? "var(--accent)" : "var(--card)", border: `0.5px solid ${side === s ? "var(--accent)" : "var(--line-strong)"}` }}>
              <p style={{ fontWeight: 600, margin: "0 0 4px", fontSize: 14, color: side === s ? "var(--accent-ink)" : "var(--ink)" }}>{s === "pro" ? "Pro" : "Con"}</p>
              <p style={{ fontSize: 12, margin: 0, color: side === s ? "var(--accent-ink)" : "var(--muted)" }}>{s === "pro" ? "You speak first" : "Opponent speaks first"}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Step 4 */}
      <div style={card}>
        <p style={sectionLabel}>4. Round type</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {([true, false] as const).map(ranked => (
            <div key={String(ranked)} onClick={() => setIsRanked(ranked)} style={{ padding: "14px 16px", borderRadius: 8, cursor: "pointer", textAlign: "center", background: isRanked === ranked ? "var(--accent)" : "var(--card)", border: `0.5px solid ${isRanked === ranked ? "var(--accent)" : "var(--line-strong)"}` }}>
              <p style={{ fontWeight: 600, margin: "0 0 4px", fontSize: 14, color: isRanked === ranked ? "var(--accent-ink)" : "var(--ink)" }}>{ranked ? "Ranked" : "Unranked"}</p>
              <p style={{ fontSize: 12, margin: 0, color: isRanked === ranked ? "var(--accent-ink)" : "var(--muted)" }}>{ranked ? "Affects ELO · Visible publicly" : "No ELO change · Private"}</p>
            </div>
          ))}
        </div>
      </div>

      <button onClick={handleChallenge} disabled={loading} style={primaryBtn}>
        {loading ? "Sending challenge…" : "Send challenge"}
      </button>

    </div>
  );
}

const card: React.CSSProperties = { background: "var(--card)", border: "0.5px solid var(--line)", borderRadius: 14, padding: "18px 20px", marginBottom: 12 };
const sectionLabel: React.CSSProperties = { fontSize: 10, fontWeight: 500, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 12px" };
const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", height: 42, padding: "0 13px", background: "var(--card)", border: "0.5px solid var(--line-strong)", borderRadius: 8, fontSize: 14, color: "var(--ink)", outline: "none" };
const ghostBtn: React.CSSProperties = { background: "transparent", border: "0.5px solid var(--line-strong)", borderRadius: 8, padding: "8px 14px", fontSize: 14, color: "var(--muted)", cursor: "pointer" };
const searchBtn: React.CSSProperties = { height: 42, padding: "0 16px", background: "transparent", border: "0.5px solid var(--line-strong)", borderRadius: 8, fontSize: 13, fontWeight: 500, color: "var(--ink-soft)", cursor: "pointer", whiteSpace: "nowrap" };
const primaryBtn: React.CSSProperties = { width: "100%", height: 46, background: "var(--accent)", color: "var(--accent-ink)", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: "pointer", marginTop: 4 };