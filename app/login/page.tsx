"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import AuthCharacters from "@/app/components/AuthCharacters";
import RevealButton from "@/app/components/RevealButton";
import ForceGridScene from "@/app/components/ForceGridScene";
import type { CSSProperties } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [typing, setTyping] = useState(false);
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
    <div className="gh-auth-split">
      <ForceGridScene />
      <aside className="gh-auth-stage">
        <div className="gh-auth-stage__floor">
          <AuthCharacters typing={typing} revealPassword={showPw} passwordLength={password.length} />
        </div>
      </aside>

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
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
            />
            <div className="gh-auth__pw">
              <input
                className="lp-input"
                type={showPw ? "text" : "password"}
                placeholder="Password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onFocus={() => setTyping(true)}
                onBlur={() => setTyping(false)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
              />
              <RevealButton shown={showPw} onToggle={() => setShowPw(s => !s)} />
            </div>
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
    </div>
  );
}

const backLink: CSSProperties = { fontFamily: "var(--font-body)", fontSize: 13, color: "rgba(var(--wt),0.65)", padding: "8px 0", textDecoration: "none" };
const heroTitle: CSSProperties = { fontFamily: "var(--font-display)", fontSize: "clamp(48px, 10vw, 92px)", fontWeight: 800, color: "rgb(var(--wt))", letterSpacing: "-0.02em", margin: 0, lineHeight: 0.92 };
const rule: CSSProperties = { display: "flex", alignItems: "center", gap: 12, margin: "clamp(24px, 4vh, 40px) 0" };
const ruleDot: CSSProperties = { width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 };
const ruleLine: CSSProperties = { flex: 1, height: 1, background: "rgba(255,255,255,0.15)" };
