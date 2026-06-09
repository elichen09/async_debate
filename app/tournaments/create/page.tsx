"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { CSSProperties } from "react";

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
      .insert({ name: name.trim(), size, topic: topic.trim() || null, created_by: session.user.id, status: "registration" })
      .select().single();

    if (err || !data) { setError(err?.message ?? "Failed to create tournament."); setLoading(false); return; }

    await supabase.from("tournament_participants").insert({ tournament_id: data.id, user_id: session.user.id });
    router.push(`/tournaments/${data.id}`);
  }

  return (
    <>
      <style>{`.db-shell { background-image: url("/4.png") !important; }`}</style>
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "0 clamp(24px, 5vw, 48px) 100px" }}>

        <div style={{ paddingTop: "clamp(20px, 4vh, 36px)" }}>
          <button onClick={() => router.push("/tournaments")} style={backBtn}>← Tournaments</button>
        </div>

        <section style={{ paddingTop: "clamp(20px, 4vh, 32px)", paddingBottom: "clamp(12px, 2vh, 20px)" }}>
          <h1 className="ab-hero-line" style={{ '--i': '0', ...heroTitle } as CSSProperties}>
            New<br />tournament
          </h1>
        </section>

        {error && (
          <p style={{ fontSize: 13, color: "oklch(0.70 0.20 28)", margin: "0 0 20px", textShadow: "0 1px 4px rgba(0,0,0,0.40)" }}>
            ⚑ {error}
          </p>
        )}

        <div style={rule}><div style={ruleDot} /><div style={ruleLine} /></div>

        {/* 01 Name */}
        <section>
          <p style={eyebrow}>01 — Tournament name</p>
          <input
            className="lp-input"
            placeholder="e.g. Spring Invitational"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCreate()}
          />
        </section>

        <div style={rule}><div style={ruleDot} /><div style={ruleLine} /></div>

        {/* 02 Bracket size */}
        <section>
          <p style={eyebrow}>02 — Bracket size</p>
          {([4, 8] as const).map(s => (
            <div
              key={s}
              onClick={() => setSize(s)}
              style={{ display: "flex", alignItems: "center", gap: 18, padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", cursor: "pointer" }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: size === s ? "var(--accent)" : "rgba(255,255,255,0.22)", transition: "color 0.15s", lineHeight: 1 }}>
                {size === s ? "●" : "○"}
              </span>
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: size === s ? "#fff" : "rgba(255,255,255,0.50)", textShadow: "0 1px 6px rgba(0,0,0,0.35)", transition: "color 0.15s" }}>
                  {s} players
                </p>
                <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.32)" }}>
                  {s === 4 ? "Semifinals + Final" : "Quarterfinals + Semifinals + Final"}
                </p>
              </div>
            </div>
          ))}
        </section>

        <div style={rule}><div style={ruleDot} /><div style={ruleLine} /></div>

        {/* 03 Topic */}
        <section>
          <p style={eyebrow}>03 — Shared topic (optional)</p>
          <input
            className="lp-input"
            placeholder="All rounds debate this resolution"
            value={topic}
            onChange={e => setTopic(e.target.value)}
          />
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", margin: "10px 0 0" }}>
            If blank, each match uses a generic "Tournament Match" topic.
          </p>
        </section>

        <div style={{ marginTop: "clamp(40px, 7vh, 64px)" }}>
          <button onClick={handleCreate} disabled={loading} className="db-btn db-btn--accent db-btn--block db-btn--lg">
            {loading ? "Creating…" : "Create tournament"}
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
