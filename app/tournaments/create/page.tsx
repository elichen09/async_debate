"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function CreateTournamentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [size, setSize] = useState<4 | 8>(4);
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    setError("");
    if (!name.trim()) { setError("Please enter a tournament name."); return; }
    setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/login"); return; }

    const { data, error: err } = await supabase
      .from("tournaments")
      .insert({
        name: name.trim(),
        size,
        topic: topic.trim() || null,
        created_by: session.user.id,
        status: "registration",
      })
      .select()
      .single();

    if (err || !data) { setError(err?.message ?? "Failed to create tournament."); setLoading(false); return; }

    // Auto-join as creator
    await supabase.from("tournament_participants").insert({
      tournament_id: data.id,
      user_id: session.user.id,
    });

    router.push(`/tournaments/${data.id}`);
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "0 20px 80px" }}>
      <div className="db-card db-rise" style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0 12px" }}>
        <button onClick={() => router.push("/tournaments")} style={ghostBtn}>← Back</button>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, color: "var(--ink)", margin: 0 }}>
          New tournament
        </h1>
      </div>

      {error && (
        <div style={{ background: "color-mix(in srgb, var(--loss) 10%, transparent)", border: "0.5px solid color-mix(in srgb, var(--loss) 30%, transparent)", color: "var(--loss)", padding: "10px 14px", borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div className="db-rise" style={{ ...card, "--i": "1" } as React.CSSProperties}>
        <p style={sectionLabel}>1. Tournament name</p>
        <input
          style={inputStyle}
          placeholder="e.g. Spring Invitational"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleCreate()}
        />
      </div>

      <div className="db-rise" style={{ ...card, "--i": "2" } as React.CSSProperties}>
        <p style={sectionLabel}>2. Bracket size</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {([4, 8] as const).map(s => (
            <div
              key={s}
              onClick={() => setSize(s)}
              style={{
                padding: "16px", borderRadius: 8, cursor: "pointer", textAlign: "center",
                background: size === s ? "var(--accent)" : "var(--card)",
                border: `0.5px solid ${size === s ? "var(--accent)" : "var(--line-strong)"}`,
              }}
            >
              <p style={{ fontWeight: 700, fontSize: 20, margin: "0 0 4px", color: size === s ? "var(--accent-ink)" : "var(--ink)" }}>{s}</p>
              <p style={{ fontSize: 11, margin: 0, color: size === s ? "var(--accent-ink)" : "var(--muted)" }}>
                {s === 4 ? "Semis + Final" : "QF + Semis + Final"}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="db-rise" style={{ ...card, "--i": "3" } as React.CSSProperties}>
        <p style={sectionLabel}>3. Shared topic (optional)</p>
        <input
          style={inputStyle}
          placeholder="All rounds debate this resolution"
          value={topic}
          onChange={e => setTopic(e.target.value)}
        />
        <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--muted)" }}>
          If left blank, each match uses a generic "Tournament Match" topic.
        </p>
      </div>

      <button onClick={handleCreate} disabled={loading} style={primaryBtn}>
        {loading ? "Creating…" : "Create tournament"}
      </button>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "var(--card)", border: "0.5px solid var(--line)",
  borderRadius: 14, padding: "18px 20px", marginBottom: 12,
};
const sectionLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 500, color: "var(--muted)",
  textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 12px",
};
const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", height: 42, padding: "0 13px",
  background: "var(--card)", border: "0.5px solid var(--line-strong)",
  borderRadius: 8, fontSize: 14, color: "var(--ink)", outline: "none",
};
const ghostBtn: React.CSSProperties = {
  background: "transparent", border: "0.5px solid var(--line-strong)",
  borderRadius: 8, padding: "8px 14px", fontSize: 14, color: "var(--muted)", cursor: "pointer",
};
const primaryBtn: React.CSSProperties = {
  width: "100%", height: 46, background: "var(--accent)", color: "var(--accent-ink)",
  border: "none", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: "pointer", marginTop: 4,
};
