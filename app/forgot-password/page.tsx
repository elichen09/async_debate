"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { CSSProperties } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSend() {
    setError("");
    if (!email.trim()) { setError("Please enter your email."); return; }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);

    if (error) { setError(error.message); return; }
    setSent(true);
  }

  return (
    <div className="gh-auth gh-auth--narrow">

      <div style={{ paddingTop: "clamp(20px, 4vh, 36px)" }}>
        <Link href="/login" style={backLink}>← Sign in</Link>
      </div>

      <section style={{ paddingTop: "clamp(16px, 3vh, 28px)" }}>
        <h1 className="ab-hero-line" style={{ "--i": "0", ...heroTitle } as CSSProperties}>
          Reset<br />password.
        </h1>
        <p className="ab-hero-line gh-auth__sub" style={{ "--i": "1" } as CSSProperties}>
          {sent
            ? "Check your inbox — the link signs you back in."
            : "We'll email you a link to set a new one."}
        </p>
      </section>

      {error && <p className="gh-auth__error">⚑ {error}</p>}

      <div style={rule}><div style={ruleDot} /><div style={ruleLine} /></div>

      {sent ? (
        <section className="ab-step-in" style={{ "--i": "1" } as CSSProperties}>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", lineHeight: 1.7, margin: 0, textShadow: "0 1px 5px rgba(0,0,0,0.35)" }}>
            If an account exists for <b style={{ color: "#fff" }}>{email.trim()}</b>, a
            reset link is on its way. It may take a minute — check spam too.
          </p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 18 }}>
            Wrong address?{" "}
            <button
              onClick={() => setSent(false)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--accent-bright)", fontSize: 13, fontFamily: "var(--font-body)", textDecoration: "underline", textUnderlineOffset: 3 }}
            >
              Try again
            </button>
          </p>
        </section>
      ) : (
        <>
          <section className="ab-step-in" style={{ "--i": "1" } as CSSProperties}>
            <div className="gh-auth__stack">
              <input
                className="lp-input"
                type="email"
                placeholder="Email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSend()}
              />
            </div>
          </section>

          <div className="ab-step-in" style={{ "--i": "2", marginTop: "clamp(28px, 5vh, 44px)" } as CSSProperties}>
            <button onClick={handleSend} disabled={loading} className="db-btn db-btn--accent db-btn--block db-btn--lg">
              {loading ? "Sending…" : "Send reset link"}
              {!loading && <span className="db-btn__arrow" aria-hidden="true">→</span>}
            </button>
            <p className="gh-auth__alt">
              Remembered it? <Link href="/login">Sign in</Link>
            </p>
          </div>
        </>
      )}
    </div>
  );
}

const backLink: CSSProperties = { fontFamily: "var(--font-body)", fontSize: 13, color: "rgba(255,255,255,0.65)", padding: "8px 0", textDecoration: "none", textShadow: "0 1px 4px rgba(0,0,0,0.35)" };
const heroTitle: CSSProperties = { fontFamily: "var(--font-display)", fontSize: "clamp(48px, 10vw, 92px)", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", margin: 0, lineHeight: 0.92, textShadow: "0 2px 20px rgba(0,0,0,0.45), 0 8px 40px rgba(0,0,0,0.22)" };
const rule: CSSProperties = { display: "flex", alignItems: "center", gap: 12, margin: "clamp(24px, 4vh, 40px) 0" };
const ruleDot: CSSProperties = { width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 };
const ruleLine: CSSProperties = { flex: 1, height: 1, background: "rgba(255,255,255,0.15)" };
