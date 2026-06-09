import type { Metadata } from "next";
import type { CSSProperties } from "react";
import BackButton from "./BackButton";

export const metadata: Metadata = {
  title: "Future — Grasshopper",
  description: "Learning resources and joining the Grasshopper team.",
};

const RESOURCES = [
  {
    label: "Truth testing",
    href: "https://docs.google.com/document/d/17cOfmAwSP-ODgqeFzNdAUmHc7bRttFZjcL7EpZqjhj0/edit?tab=t.0#heading=h.ipza44bmzcud",
    desc: "Cute little framework for phils rounds, written by Eli and Rahul",
    tag: "Framework",
    indent: "0%",
  },
  {
    label: "AT: K framework",
    href: "https://docs.google.com/document/d/1FyiP2N9a3ajzwBiFsR9CEPgbsXc35lt8iZyWJEW1DwI/edit?tab=t.0",
    desc: "Answers to kritik framework - includes evidence indicts.",
    tag: "Blocks",
    indent: "8%",
  },
  {
    label: "AT: slop",
    href: "https://docs.google.com/document/d/1Mb6uBV8zEtvwM4A1G7dmejVBK6p9PgU9JSrBg_NznuE/edit?tab=t.0",
    desc: "Blocks against utter slop.",
    tag: "Blocks",
    indent: "4%",
  },
  {
    label: "Skep",
    href: "https://docs.google.com/document/d/1A52OX5VNW72JGsQ2gfezqaUbOZJl78Lla1XYohGaTtU/edit?tab=t.0",
    desc: "Fun skep shell for some unserious rounds.",
    tag: "Phil",
    indent: "14%",
  },
];

export default function FuturePage() {
  return (
    <>
      <style>{`
        .db-shell { background-image: url("/3.png") !important; }
        .ft-doc:hover .ft-doc-title { color: var(--accent) !important; }
        .ft-doc:hover .ft-doc-arrow { opacity: 1 !important; transform: translate(3px,-3px) !important; }
        .ft-doc-arrow { transition: opacity 0.15s, transform 0.18s; }
        .ft-doc-title { transition: color 0.15s; }
        .ft-yt:hover { border-color: oklch(0.54 0.16 142 / 0.70) !important; background: oklch(0.54 0.16 142 / 0.10) !important; }
        .ft-email:hover { opacity: 0.70; }
      `}</style>

      <div style={{ maxWidth: 940, margin: "0 auto", padding: "0 clamp(24px, 5vw, 64px) 120px" }}>

        {/* ── Top bar ─────────────────────────────────────────────── */}
        <div style={{ paddingTop: "clamp(20px, 4vh, 36px)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <BackButton />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)" }}>
            Grasshopper / 2026
          </span>
        </div>

        {/* ── Hero ────────────────────────────────────────────────── */}
        <section style={{ paddingTop: "clamp(16px, 3vh, 28px)", marginBottom: "clamp(12px, 2vh, 20px)" }}>
          {/* Massive title */}
          <div style={{ position: "relative" }}>
            <h1
              className="ab-hero-line"
              style={{
                '--i': '0',
                fontFamily: "var(--font-display)",
                fontSize: "clamp(88px, 18vw, 172px)",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                color: "#fff",
                textTransform: "uppercase",
                margin: 0,
                lineHeight: 0.87,
                textShadow: "0 2px 24px rgba(0,0,0,0.50), 0 12px 64px rgba(0,0,0,0.24)",
              } as CSSProperties}
            >
              FUTURE
            </h1>

          </div>
        </section>

        {/* ── Divider ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, margin: "clamp(28px, 5vh, 44px) 0" }}>
          <div className="ab-rule-draw" style={{ '--i': '0', flex: 1, height: 1, background: "rgba(255,255,255,0.18)" } as CSSProperties} />
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", flexShrink: 0, margin: "0 0 0 12px" }} />
        </div>

        {/* ── Learning ────────────────────────────────────────────── */}
        <section>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.20em", textTransform: "uppercase", color: "var(--accent)", margin: "0 0 clamp(20px, 4vh, 36px)" }}>
            01 — Learning
          </p>

          {/* YouTube — full-bleed band */}
          <a
            href="https://www.youtube.com/@Lincoln-SudburyPFDebate"
            target="_blank"
            rel="noopener noreferrer"
            className="ft-yt"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 20,
              padding: "clamp(16px, 3vh, 24px) clamp(20px, 4vw, 36px)",
              border: "1px solid rgba(255,255,255,0.14)",
              borderLeft: "3px solid var(--accent)",
              background: "rgba(255,255,255,0.04)",
              textDecoration: "none",
              transition: "background 0.15s, border-color 0.15s",
              marginBottom: "clamp(36px, 6vh, 56px)",
            }}
          >
            <div>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--accent)", margin: "0 0 6px" }}>
                Watch · Lincoln-Sudbury PF
              </p>
              <p style={{ fontFamily: "var(--font-display)", fontSize: "clamp(18px, 2.8vw, 28px)", fontWeight: 700, color: "#fff", margin: 0, letterSpacing: "-0.01em", textShadow: "0 1px 10px rgba(0,0,0,0.38)" }}>
                YouTube channel ↗
              </p>
            </div>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "clamp(32px, 6vw, 64px)", fontWeight: 800, color: "rgba(255,255,255,0.07)", letterSpacing: "-0.04em", flexShrink: 0, lineHeight: 1 }}>
              ▶
            </span>
          </a>

          {/* Prep docs — staggered typographic links */}
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", margin: "0 0 clamp(20px, 4vh, 32px)" }}>
            Prep documents
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {RESOURCES.map((r, i) => (
              <a
                key={r.label}
                href={r.href}
                target="_blank"
                rel="noopener noreferrer"
                className="ft-doc ab-step-in"
                style={{
                  '--i': String(i),
                  display: "flex",
                  alignItems: "baseline",
                  gap: "clamp(12px, 2vw, 24px)",
                  padding: "clamp(14px, 2.5vh, 20px) 0",
                  borderBottom: "1px solid rgba(255,255,255,0.07)",
                  textDecoration: "none",
                  marginLeft: r.indent,
                  transition: "margin-left 0.15s",
                } as CSSProperties}
              >
                {/* Big decorative number */}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(10px, 1.2vw, 13px)", color: "rgba(255,255,255,0.22)", letterSpacing: "0.04em", flexShrink: 0, minWidth: 24 }}>
                  0{i + 1}
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                    <span
                      className="ft-doc-title"
                      style={{ fontFamily: "var(--font-display)", fontSize: "clamp(22px, 3.5vw, 38px)", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1, textShadow: "0 1px 10px rgba(0,0,0,0.40)", textTransform: "uppercase" }}
                    >
                      {r.label}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--accent)", opacity: 0.75, flexShrink: 0 }}>
                      {r.tag}
                    </span>
                  </div>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "rgba(255,255,255,0.38)", margin: "4px 0 0", lineHeight: 1.5, textShadow: "0 1px 4px rgba(0,0,0,0.30)" }}>
                    {r.desc}
                  </p>
                </div>

                <span
                  className="ft-doc-arrow"
                  style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(14px, 2vw, 20px)", color: "rgba(255,255,255,0.25)", flexShrink: 0, opacity: 0.6, lineHeight: 1 }}
                >
                  ↗
                </span>
              </a>
            ))}
          </div>
        </section>

        {/* ── Divider ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "clamp(40px, 8vh, 72px) 0" }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,0.20)", flexShrink: 0 }} />
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.12)" }} />
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
        </div>

        {/* ── Join ────────────────────────────────────────────────── */}
        <section>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.20em", textTransform: "uppercase", color: "var(--accent)", margin: "0 0 clamp(20px, 4vh, 36px)" }}>
            02 — Join the team
          </p>

          {/* Two-column asymmetric */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "clamp(24px, 5vw, 64px)", alignItems: "start", marginBottom: "clamp(32px, 6vh, 52px)" }}>
            {/* Left — pitch */}
            <div className="ab-step-in" style={{ '--i': '0' } as CSSProperties}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 800, color: "#fff", letterSpacing: "-0.025em", margin: "0 0 16px", lineHeight: 0.93, textTransform: "uppercase", textShadow: "0 2px 16px rgba(0,0,0,0.42)", textWrap: "balance" } as CSSProperties}>
                Help build<br />Grasshopper.
              </h2>
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.52)", lineHeight: 1.70, margin: 0, textShadow: "0 1px 5px rgba(0,0,0,0.35)" }}>
                We&rsquo;re looking for debaters with coding skills — or coders with debate interest. Or people who want to help advertise! Share your accomplishments and we&rsquo;ll be in touch.
              </p>
            </div>

            {/* Right — benefits */}
            <div className="ab-step-in" style={{ '--i': '1' } as CSSProperties}>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.32)", margin: "0 0 14px" }}>What you get</p>
              {[
                "Free prep materials",
                "Coaching from experienced debaters",
                "Direct role in website development",
              ].map((b, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <span style={{ color: "var(--accent)", fontSize: 11, flexShrink: 0, marginTop: 2 }}>✓</span>
                  <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.55, textShadow: "0 1px 4px rgba(0,0,0,0.30)" }}>{b}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Email — billboard scale */}
          <div className="ab-step-in" style={{ '--i': '2' } as CSSProperties}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", margin: "0 0 12px" }}>
              Apply via email
            </p>
            <a
              href="mailto:elichen314@gmail.com?subject=Grasshopper team application"
              className="ft-email"
              style={{
                display: "block",
                fontFamily: "var(--font-display)",
                fontSize: "clamp(20px, 4vw, 46px)",
                fontWeight: 800,
                color: "var(--accent)",
                textDecoration: "none",
                letterSpacing: "-0.025em",
                lineHeight: 1,
                textShadow: "0 2px 16px rgba(0,0,0,0.40)",
                wordBreak: "break-all",
                transition: "opacity 0.15s",
              }}
            >
              elichen314@gmail.com&nbsp;↗
            </a>
          </div>
        </section>

      </div>
    </>
  );
}
