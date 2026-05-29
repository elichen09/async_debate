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
    if (!selected || !topic.trim()) {
      setError("Please select an opponent and enter a topic.");
      return;
    }

    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/login"); return; }

    const myId = session.user.id;
    const proId = side === "pro" ? myId : selected.id;
    const conId = side === "con" ? myId : selected.id;

    const { error } = await supabase.from("rounds").insert({
      topic,
      pro_id: proId,
      con_id: conId,
      challenger_id: myId,
      status: "pending",
      current_speech: 1,
    });

    setLoading(false);
    if (error) { setError(error.message); return; }
    router.push("/dashboard");
  }

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 480, margin: "3rem auto", padding: "0 1rem" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "2rem" }}>
        <button onClick={() => router.push("/dashboard")} style={ghostBtn}>← Back</button>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>New challenge</h1>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#b91c1c", padding: "10px 14px", borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Step 1: Search */}
      <div style={card}>
        <p style={sectionLabel}>1. Find your opponent</p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="Search by username"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
          />
          <button onClick={handleSearch} style={secondaryBtn}>Search</button>
        </div>

        {results.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {results.map(p => (
              <div
                key={p.id}
                onClick={() => { setSelected(p); setResults([]); setSearch(p.username); }}
                style={{
                  ...resultRow,
                  background: selected?.id === p.id ? "#f0fdf4" : "#f9f7f4",
                  border: selected?.id === p.id ? "1px solid #86efac" : "1px solid #e5e2dc",
                }}
              >
                <div>
                  <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>{p.display_name || p.username}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "#6b6760" }}>@{p.username}</p>
                </div>
                <span style={{ fontSize: 13, color: "#6b6760" }}>ELO {p.elo}</span>
              </div>
            ))}
          </div>
        )}

        {selected && (
          <div style={{ marginTop: 12, background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "10px 14px", fontSize: 14 }}>
            Selected: <strong>{selected.display_name || selected.username}</strong> (ELO {selected.elo})
          </div>
        )}
      </div>

      {/* Step 2: Topic */}
      <div style={card}>
        <p style={sectionLabel}>2. Enter the topic</p>
        <input
          style={inputStyle}
          placeholder="e.g. Resolved: The US should abolish the death penalty."
          value={topic}
          onChange={e => setTopic(e.target.value)}
        />
      </div>

      {/* Step 3: Side */}
      <div style={card}>
        <p style={sectionLabel}>3. Choose your side</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div
            onClick={() => setSide("pro")}
            style={{
              ...sideBox,
              border: side === "pro" ? "2px solid #1a1814" : "1px solid #e5e2dc",
              background: side === "pro" ? "#1a1814" : "#f9f7f4",
              color: side === "pro" ? "#fff" : "#1a1814",
            }}
          >
            <p style={{ fontWeight: 500, margin: "0 0 4px" }}>Pro</p>
            <p style={{ fontSize: 12, margin: 0, opacity: 0.7 }}>You speak first</p>
          </div>
          <div
            onClick={() => setSide("con")}
            style={{
              ...sideBox,
              border: side === "con" ? "2px solid #1a1814" : "1px solid #e5e2dc",
              background: side === "con" ? "#1a1814" : "#f9f7f4",
              color: side === "con" ? "#fff" : "#1a1814",
            }}
          >
            <p style={{ fontWeight: 500, margin: "0 0 4px" }}>Con</p>
            <p style={{ fontSize: 12, margin: 0, opacity: 0.7 }}>Opponent speaks first</p>
          </div>
        </div>
      </div>

      <button onClick={handleChallenge} disabled={loading} style={primaryBtn}>
        {loading ? "Sending challenge…" : "Send challenge"}
      </button>

    </div>
  );
}

const card = {
  background: "#ffffff",
  border: "1px solid #e5e2dc",
  borderRadius: 12,
  padding: "1.25rem",
  marginBottom: "1rem",
} as const;

const sectionLabel = {
  fontSize: 11,
  fontWeight: 500,
  color: "#6b6760",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  margin: "0 0 12px",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  height: 42,
  padding: "0 12px",
  border: "1px solid #e5e2dc",
  borderRadius: 8,
  fontSize: 15,
  outline: "none",
  background: "transparent",
};

const resultRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 12px",
  borderRadius: 8,
  cursor: "pointer",
} as const;

const sideBox = {
  padding: "14px 16px",
  borderRadius: 8,
  cursor: "pointer",
  textAlign: "center" as const,
  transition: "all 0.15s",
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
  marginTop: 8,
} as const;

const secondaryBtn = {
  height: 42,
  padding: "0 16px",
  background: "transparent",
  border: "1px solid #e5e2dc",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
};

const ghostBtn = {
  background: "transparent",
  border: "1px solid #e5e2dc",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 14,
  cursor: "pointer",
} as const;