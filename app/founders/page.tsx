import Link from "next/link";
import type { Metadata } from "next";
import type { CSSProperties } from "react";

export const metadata: Metadata = {
  title: "Founders — Grasshopper",
  description: "Grasshopper was built by Eli and Gary, competitive debaters who wanted to change how the activity lives online.",
};

const RECORD = [
  { tournament: "Tournament of Champions", result: "Top 10" },
  { tournament: "Rankings",        result: "Peak Rank #1" },
  { tournament: "Stanford Invitational",   result: "Champions" },
  { tournament: "Yale Invitational",       result: "Finalists" },
];

export default function FoundersPage() {
  return (
    <>
    <style>{`.db-shell { background-image: url("/3.png") !important; }`}</style>
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 clamp(24px, 5vw, 64px) 100px" }}>

      <div style={{ paddingTop: "clamp(20px, 4vh, 36px)" }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-body)", fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none", padding: "8px 0", textShadow: "0 1px 4px rgba(0,0,0,0.35)", transition: "color 0.15s ease" }}>
          ← Back
        </Link>
      </div>

      {/* ── Names as hero — horizontal, one line ──────────────── */}
      <section style={{ paddingTop: "clamp(20px, 4vh, 36px)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "clamp(12px, 2.5vw, 28px)", flexWrap: "wrap" }}>
          <span
            className="ab-hero-line"
            style={{
              '--i': '0',
              fontFamily: "var(--font-display)",
              fontSize: "clamp(80px, 17vw, 156px)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: "#fff",
              textTransform: "uppercase",
              textShadow: "0 2px 20px rgba(0,0,0,0.45), 0 10px 60px rgba(0,0,0,0.22)",
              lineHeight: 0.88,
            } as CSSProperties}
          >Eli</span>
          <span
            className="ab-hero-line"
            style={{
              '--i': '1',
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(28px, 5vw, 52px)",
              fontWeight: 400,
              color: "rgba(255,255,255,0.28)",
              lineHeight: 1,
              alignSelf: "center",
              textShadow: "0 1px 6px rgba(0,0,0,0.30)",
            } as CSSProperties}
          >&</span>
          <span
            className="ab-hero-line"
            style={{
              '--i': '2',
              fontFamily: "var(--font-display)",
              fontSize: "clamp(80px, 17vw, 156px)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: "var(--accent)",
              textTransform: "uppercase",
              textShadow: "0 2px 20px rgba(0,0,0,0.45), 0 10px 60px rgba(0,0,0,0.22)",
              lineHeight: 0.88,
            } as CSSProperties}
          >Gary</span>
        </div>

        <p
          className="ab-hero-line"
          style={{
            '--i': '3',
            fontSize: "clamp(13px, 1.6vw, 15px)",
            color: "rgba(255,255,255,0.55)",
            maxWidth: "54ch",
            lineHeight: 1.65,
            marginTop: "clamp(18px, 3vh, 28px)",
            marginBottom: 0,
            textShadow: "0 1px 8px rgba(0,0,0,0.40)",
          } as CSSProperties}
        >
          Grasshopper was built by Eli and Gary, a whimsical little website to practice and have fun. We hope this website brings a smile to your face. 
        </p>
      </section>

      {/* ── Rule ──────────────────────────────────────────────── */}
      <div style={rule}>
        <div className="ab-rule-draw" style={{ '--i': '0', flex: 1, height: 1, background: "rgba(255,255,255,0.20)" } as CSSProperties} />
        <div style={{ ...ruleDot, flexShrink: 0 }} />
      </div>

      {/* ── Record — full-width row list ──────────────────────── */}
      <section>
        {RECORD.map((row, i) => (
          <div
            key={row.tournament}
            className="ab-step-in"
            style={{
              '--i': String(i),
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "clamp(12px, 4vw, 40px)",
              paddingBottom: "clamp(14px, 2.5vh, 22px)",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              marginBottom: "clamp(14px, 2.5vh, 22px)",
            } as CSSProperties}
          >
            <span style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(18px, 2.8vw, 26px)",
              fontWeight: 700,
              color: "#fff",
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
              textShadow: "0 1px 10px rgba(0,0,0,0.38)",
            }}>
              {row.tournament}
            </span>
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(11px, 1.4vw, 13px)",
              color: i === 2 ? "var(--accent)" : "rgba(255,255,255,0.48)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              flexShrink: 0,
              textShadow: "0 1px 4px rgba(0,0,0,0.30)",
            }}>
              {row.result}
            </span>
          </div>
        ))}
      </section>

      {/* ── Rule ──────────────────────────────────────────────── */}
      <div style={rule}>
        <div style={ruleDot} />
        <div className="ab-rule-draw" style={{ '--i': '0', flex: 1, height: 1, background: "rgba(255,255,255,0.20)" } as CSSProperties} />
      </div>

      {/* ── Pull quote — full width ────────────────────────────── */}
      <section>
        <blockquote
          className="ab-hero-line"
          style={{
            '--i': '0',
            fontFamily: "var(--font-display)",
            fontSize: "clamp(28px, 5.5vw, 54px)",
            fontWeight: 800,
            color: "#fff",
            textTransform: "uppercase",
            letterSpacing: "-0.02em",
            lineHeight: 1.00,
            margin: "0 0 clamp(28px, 5vh, 48px)",
            textShadow: "0 2px 18px rgba(0,0,0,0.42), 0 8px 48px rgba(0,0,0,0.20)",
            textWrap: "balance",
            maxWidth: "22ch",
          } as CSSProperties}
        >
          We wanted this to exist, so we built it.
        </blockquote>

        {/* Three reasons — right-column stagger, not staircase */}
        <div style={{ display: "flex", flexDirection: "column", gap: "clamp(20px, 3.5vh, 32px)", marginLeft: "auto", maxWidth: "52ch" }}>
          {[
            { head: "No structure", body: "Long-form async debates existed, but only as improvised arrangements — shared docs, email threads, voice memos. No timer, no official record." },
            { head: "No archive",   body: "Practice rounds, scrimmages, tournament prelims: gone after the weekend. The activity leaves almost nothing behind for the next generation to learn from." },
            { head: "No stakes",   body: "Just like Chess --- practicing with real consequences builds the skills needed for high-level competition." },
          ].map((item, i) => (
            <div
              key={item.head}
              className="ab-step-in"
              style={{ '--i': String(i) } as CSSProperties}
            >
              <p style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(13px, 1.6vw, 15px)",
                fontWeight: 700,
                color: "rgba(255,255,255,0.80)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                margin: "0 0 5px",
                textShadow: "0 1px 6px rgba(0,0,0,0.35)",
              }}>
                {item.head}
              </p>
              <p style={{
                fontSize: 14,
                color: "rgba(255,255,255,0.50)",
                lineHeight: 1.70,
                margin: 0,
                textShadow: "0 1px 5px rgba(0,0,0,0.35)",
              }}>
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Rule ──────────────────────────────────────────────── */}
      <div style={rule}>
        <div className="ab-rule-draw" style={{ '--i': '0', flex: 1, height: 1, background: "rgba(255,255,255,0.20)" } as CSSProperties} />
        <div style={{ ...ruleDot, flexShrink: 0 }} />
      </div>

      {/* ── CTA ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div className="db-card" style={{ padding: "clamp(28px, 5vh, 44px) clamp(24px, 5vw, 56px)", textAlign: "center", width: "100%", maxWidth: 440 }}>
          <p style={{ fontFamily: "var(--font-display)", fontSize: "clamp(22px, 3.5vw, 30px)", fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.015em", margin: "0 0 6px" }}>Join the ladder.</p>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "0 0 24px", lineHeight: 1.55 }}>Start at 1200 ELO. Challenge anyone. Get a real ballot.</p>
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
