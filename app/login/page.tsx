"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { CSSProperties } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    setError("");
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) { setError(error.message); return; }

    router.push("/dashboard");
  }

  return (
    <div className="gh-auth gh-auth--narrow">

      <div style={{ paddingTop: "clamp(20px, 4vh, 36px)" }}>
        <Link href="/" style={backLink}>← Grasshopper</Link>
      </div>

      <section style={{ paddingTop: "clamp(16px, 3vh, 28px)" }}>
        <h1 className="ab-hero-line" style={{ "--i": "0", ...heroTitle } as CSSProperties}>
          Welcome<br />back.
        </h1>
        <p className="ab-hero-line gh-auth__sub" style={{ "--i": "1" } as CSSProperties}>
          The ladder kept your place.
        </p>
      </section>

      {error && <p className="gh-auth__error">⚑ {error}</p>}

      <div style={rule}><div style={ruleDot} /><div style={ruleLine} /></div>

      <section className="ab-step-in" style={{ "--i": "1" } as CSSProperties}>
        <div className="gh-auth__stack">
          <input
            className="lp-input"
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
          />
          <input
            className="lp-input"
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
          />
        </div>
        <Link href="/forgot-password" className="gh-auth__forgot">Forgot password?</Link>
      </section>

      <div className="ab-step-in" style={{ "--i": "2", marginTop: "clamp(28px, 5vh, 44px)" } as CSSProperties}>
        <button onClick={handleLogin} disabled={loading} className="db-btn db-btn--accent db-btn--block db-btn--lg">
          {loading ? "Signing in…" : "Sign in"}
          {!loading && <span className="db-btn__arrow" aria-hidden="true">→</span>}
        </button>
        <p className="gh-auth__alt">
          New here? <Link href="/signup">Create an account</Link>
        </p>
      </div>
    </div>
  );
}

const backLink: CSSProperties = { fontFamily: "var(--font-body)", fontSize: 13, color: "rgba(255,255,255,0.65)", padding: "8px 0", textDecoration: "none", textShadow: "0 1px 4px rgba(0,0,0,0.35)" };
const heroTitle: CSSProperties = { fontFamily: "var(--font-display)", fontSize: "clamp(48px, 10vw, 92px)", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", margin: 0, lineHeight: 0.92, textShadow: "0 2px 20px rgba(0,0,0,0.45), 0 8px 40px rgba(0,0,0,0.22)" };
const rule: CSSProperties = { display: "flex", alignItems: "center", gap: 12, margin: "clamp(24px, 4vh, 40px) 0" };
const ruleDot: CSSProperties = { width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 };
const ruleLine: CSSProperties = { flex: 1, height: 1, background: "rgba(255,255,255,0.15)" };
