import Link from "next/link";
import type { Metadata } from "next";
import type { CSSProperties } from "react";

export const metadata: Metadata = {
  title: "About — Grasshopper",
  description: "Async public forum debate. Challenge anyone, record speeches on your own time, climb the ELO ladder.",
};

const STEPS = [
  { title: "Challenge", body: "Pick an opponent, propose a topic, choose ranked or casual." },
  { title: "Record",    body: "Submit speeches when you have a free window — record in the browser or upload an audio file." },
  { title: "Judge",     body: "An independent community member hears all eight speeches and issues a written ballot." },
  { title: "Rank",      body: "Wins and losses update both players' ELO. Every ranked round shifts the ladder." },
];

const PRO = ["Constructive", "Rebuttal", "Summary", "Final Focus"];
const CON = ["Constructive", "Rebuttal", "Summary", "Final Focus"];
const TIMES = ["4 min", "4 min", "3 min", "2 min"];

export default function AboutPage() {
  return (
    <>
    <style>{`.db-shell { background-image: url("/2.png") !important; }`}</style>
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 clamp(24px, 5vw, 64px) 100px" }}>

      <div style={{ paddingTop: "clamp(20px, 4vh, 36px)" }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-body)", fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none", padding: "8px 0", textShadow: "0 1px 4px rgba(0,0,0,0.35)", transition: "color 0.15s ease" }}>
          ← Back
        </Link>
      </div>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section style={{ paddingTop: "clamp(24px, 5vh, 48px)", paddingBottom: "clamp(8px, 2vh, 16px)" }}>
        <h1 aria-label="Debate on your schedule." style={{ margin: "0 0 clamp(20px, 4vh, 36px)", lineHeight: 0.90 }}>
          <span className="ab-hero-line" style={{ '--i': '0', fontFamily: "var(--font-display)", fontSize: "clamp(72px, 14vw, 128px)", fontWeight: 800, letterSpacing: "-0.025em", color: "#fff", textTransform: "uppercase", textShadow: "0 2px 20px rgba(0,0,0,0.45), 0 10px 60px rgba(0,0,0,0.22)" } as CSSProperties}>Debate</span>
          <span className="ab-hero-line" style={{ '--i': '1', fontFamily: "var(--font-display)", fontSize: "clamp(72px, 14vw, 128px)", fontWeight: 800, letterSpacing: "-0.025em", color: "#fff", textTransform: "uppercase", textShadow: "0 2px 20px rgba(0,0,0,0.45), 0 10px 60px rgba(0,0,0,0.22)" } as CSSProperties}>on your</span>
          <span className="ab-hero-line" style={{ '--i': '2', fontFamily: "var(--font-display)", fontSize: "clamp(72px, 14vw, 128px)", fontWeight: 800, letterSpacing: "-0.025em", color: "var(--accent)", textTransform: "uppercase", textShadow: "0 2px 20px rgba(0,0,0,0.45), 0 10px 60px rgba(0,0,0,0.22)" } as CSSProperties}>schedule.</span>
        </h1>
        <p className="ab-hero-line" style={{ '--i': '3', fontSize: "clamp(14px, 1.8vw, 16px)", color: "rgba(255,255,255,0.72)", maxWidth: "48ch", lineHeight: 1.65, marginBottom: "clamp(24px, 4vh, 36px)", textShadow: "0 1px 8px rgba(0,0,0,0.40)" } as CSSProperties}>
          Async public forum for competitive thinkers. No scheduling overhead, no live sessions — just speeches, a real ballot, and a ladder that moves.
        </p>
        <div className="ab-hero-line" style={{ '--i': '4', display: "flex", gap: 12, flexWrap: "wrap" } as CSSProperties}>
          <Link href="/signup" className="db-btn db-btn--accent">
            Create an account
            <span className="db-btn__arrow" aria-hidden="true">→</span>
          </Link>
          <Link href="/login" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 46, padding: "0 24px", borderRadius: "var(--radius)", fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 500, cursor: "pointer", border: "1px solid rgba(255,255,255,0.28)", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.80)", textDecoration: "none", letterSpacing: "0.01em" }}>
            Sign in
          </Link>
        </div>
      </section>

      {/* ── Rule ──────────────────────────────────────────────── */}
      <div style={rule}>
        <div style={ruleDot} />
        <div className="ab-rule-draw" style={{ '--i': '0', flex: 1, height: 1, background: "rgba(255,255,255,0.20)" } as CSSProperties} />
      </div>

      {/* ── How it works — staircase ──────────────────────────── */}
      <section style={{ display: "flex", flexDirection: "column", gap: "clamp(22px, 4vh, 36px)" }}>
        {STEPS.map((step, i) => (
          <div
            key={step.title}
            className="ab-step-in"
            style={{ marginLeft: i === 0 ? 0 : `clamp(0px, ${i * 6}vw, ${i * 80}px)`, '--i': String(i) } as CSSProperties}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 7 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", letterSpacing: "0.06em", flexShrink: 0, textShadow: "0 1px 4px rgba(0,0,0,0.30)" }}>0{i + 1}</span>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(28px, 4.5vw, 44px)", fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: "-0.015em", margin: 0, lineHeight: 0.95, textShadow: "0 2px 14px rgba(0,0,0,0.40), 0 6px 36px rgba(0,0,0,0.18)", textWrap: "balance" } as CSSProperties}>
                {step.title}
              </h2>
            </div>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.58)", lineHeight: 1.65, maxWidth: "40ch", margin: "0 0 0 26px", textShadow: "0 1px 5px rgba(0,0,0,0.35)" }}>
              {step.body}
            </p>
          </div>
        ))}
      </section>

      {/* ── Rule ──────────────────────────────────────────────── */}
      <div style={rule}>
        <div style={ruleDot} />
        <div className="ab-rule-draw" style={{ '--i': '0', flex: 1, height: 1, background: "rgba(255,255,255,0.20)" } as CSSProperties} />
      </div>

      {/* ── The format — Pro / Con split ──────────────────────── */}
      <section>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 clamp(32px, 6vw, 80px)" }}>

          {/* Pro column */}
          <div>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)", margin: "0 0 18px", textShadow: "0 1px 4px rgba(0,0,0,0.30)" }}>Pro</p>
            {PRO.map((label, i) => (
              <div key={label} style={{ marginBottom: 16 }}>
                <p style={{ fontSize: "clamp(15px, 2.2vw, 18px)", fontWeight: 600, fontFamily: "var(--font-display)", color: "#fff", margin: "0 0 2px", textShadow: "0 1px 8px rgba(0,0,0,0.38)", letterSpacing: "0.01em" }}>{label}</p>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,255,255,0.38)", margin: 0, textShadow: "0 1px 4px rgba(0,0,0,0.28)" }}>{TIMES[i]}</p>
              </div>
            ))}
          </div>

          {/* Con column */}
          <div style={{ borderLeft: "1px solid rgba(255,255,255,0.12)", paddingLeft: "clamp(20px, 4vw, 48px)" }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "oklch(0.60 0.14 230)", margin: "0 0 18px", textShadow: "0 1px 4px rgba(0,0,0,0.30)" }}>Con</p>
            {CON.map((label, i) => (
              <div key={label} style={{ marginBottom: 16 }}>
                <p style={{ fontSize: "clamp(15px, 2.2vw, 18px)", fontWeight: 600, fontFamily: "var(--font-display)", color: "#fff", margin: "0 0 2px", textShadow: "0 1px 8px rgba(0,0,0,0.38)", letterSpacing: "0.01em" }}>{label}</p>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,255,255,0.38)", margin: 0, textShadow: "0 1px 4px rgba(0,0,0,0.28)" }}>{TIMES[i]}</p>
              </div>
            ))}
          </div>

        </div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", marginTop: 16, textShadow: "0 1px 4px rgba(0,0,0,0.28)" }}>
          Eight speeches in sequence. Pro argues for the resolution, Con argues against.
        </p>
      </section>

      {/* ── Rule ──────────────────────────────────────────────── */}
      <div style={rule}>
        <div style={ruleDot} />
        <div className="ab-rule-draw" style={{ '--i': '0', flex: 1, height: 1, background: "rgba(255,255,255,0.20)" } as CSSProperties} />
      </div>

      {/* ── ELO — full-width typographic statement ────────────── */}
      <section style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "end", gap: "clamp(16px, 3vw, 40px)" }}>
        <div>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(80px, 18vw, 160px)", fontWeight: 700, color: "#fff", letterSpacing: "0.06em", fontFeatureSettings: '"tnum" 1', margin: 0, lineHeight: 1, textShadow: "0 4px 40px rgba(0,0,0,0.45), 0 2px 12px rgba(0,0,0,0.35)" }}>
            1200
          </p>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.40)", margin: "8px 0 0", textShadow: "0 1px 4px rgba(0,0,0,0.30)" }}>
            Starting ELO
          </p>
        </div>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", maxWidth: "28ch", lineHeight: 1.7, textAlign: "right", textShadow: "0 1px 5px rgba(0,0,0,0.35)", paddingBottom: 4 }}>
          Wins and losses adjust ratings based on the result and the gap between players. Every ranked round counts.
        </p>
      </section>

      {/* ── Rule ──────────────────────────────────────────────── */}
      <div style={rule}>
        <div className="ab-rule-draw" style={{ '--i': '0', flex: 1, height: 1, background: "rgba(255,255,255,0.20)" } as CSSProperties} />
        <div style={{ ...ruleDot, flexShrink: 0 }} />
      </div>

      {/* ── Judging — right-aligned for asymmetry ─────────────── */}
      <section style={{ maxWidth: "42ch", marginLeft: "auto" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(24px, 4vw, 38px)", fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: "-0.015em", margin: "0 0 14px", textShadow: "0 2px 14px rgba(0,0,0,0.40)", textAlign: "right", textWrap: "balance" } as CSSProperties}>
          Community judging.
        </h2>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.60)", lineHeight: 1.7, textAlign: "right", textShadow: "0 1px 5px rgba(0,0,0,0.35)" }}>
          Any Grasshopper member can judge rounds they are not in. Judges hear all eight speeches, score speaker points, and write a decision. Repeated bad ballots remove judging access.
        </p>
      </section>

      {/* ── CTA — the one glass card ──────────────────────────── */}
      <div style={{ marginTop: "clamp(56px, 10vh, 96px)", display: "flex", justifyContent: "center" }}>
        <div className="db-card" style={{ padding: "clamp(28px, 5vh, 44px) clamp(24px, 5vw, 56px)", textAlign: "center", width: "100%", maxWidth: 440 }}>
          <p style={{ fontFamily: "var(--font-display)", fontSize: "clamp(22px, 3.5vw, 30px)", fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.015em", margin: "0 0 6px" }}>Ready to debate?</p>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "0 0 24px", lineHeight: 1.55 }}>Start at 1200 ELO. Your first round is one challenge away.</p>
          <Link href="/signup" className="db-btn db-btn--accent db-btn--block">
            Create an account
            <span className="db-btn__arrow" aria-hidden="true">→</span>
          </Link>
        </div>
      </div>

    </div>
    </>
  );
}

const rule: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  margin: "clamp(40px, 8vh, 72px) 0",
};

const ruleDot: CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: "var(--accent)",
  flexShrink: 0,
};
