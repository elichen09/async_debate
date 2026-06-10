"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { tierFor, ELO_MIN, ELO_MAX_START } from "@/lib/elo";
import type { CSSProperties } from "react";

const ELO_STOPS = [
  { value: 600,  label: "Brand new to debate" },
  { value: 800,  label: "A season of rounds behind you" },
  { value: 1000, label: "Competitive on your local circuit" },
  { value: 1200, label: "Varsity confidence" },
];

function nearestStop(elo: number) {
  return ELO_STOPS.reduce((best, s) =>
    Math.abs(s.value - elo) < Math.abs(best.value - elo) ? s : best
  );
}

export default function SignupPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [startElo, setStartElo] = useState(600);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const tier = tierFor(startElo);
  const stop = nearestStop(startElo);
  const pct = ((startElo - ELO_MIN) / (ELO_MAX_START - ELO_MIN)) * 100;

  async function handleSignup() {
    setError("");
    if (!username || !email || !password) {
      setError("Please fill in all required fields.");
      return;
    }

    setLoading(true);
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username, display_name: displayName, starting_elo: startElo },
      },
    });

    if (signUpError) { setError(signUpError.message); setLoading(false); return; }

    // Sign in immediately — works when email confirmation is disabled in Supabase
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setLoading(false);
      setError("Account created but sign-in failed. Try logging in manually.");
      return;
    }

    // Apply the chosen starting Elo to the freshly created profile
    if (signInData.session) {
      await supabase
        .from("profiles")
        .update({ elo: startElo })
        .eq("id", signInData.session.user.id);
    }

    setLoading(false);
    router.push("/dashboard");
  }

  return (
    <div className="gh-auth">

      <div style={{ paddingTop: "clamp(20px, 4vh, 36px)" }}>
        <Link href="/" style={backLink}>← Grasshopper</Link>
      </div>

      <section style={{ paddingTop: "clamp(16px, 3vh, 28px)" }}>
        <h1 className="ab-hero-line" style={{ "--i": "0", ...heroTitle } as CSSProperties}>
          Join the<br />ladder.
        </h1>
        <p className="ab-hero-line gh-auth__sub" style={{ "--i": "1" } as CSSProperties}>
          Real rounds, real ballots, an Elo that means something.
        </p>
      </section>

      {error && <p className="gh-auth__error">⚑ {error}</p>}

      <div style={rule}><div style={ruleDot} /><div style={ruleLine} /></div>

      {/* 01 Identity */}
      <section className="ab-step-in" style={{ "--i": "1" } as CSSProperties}>
        <p style={eyebrow}>01 — Who you are</p>
        <div className="gh-auth__pair">
          <input className="lp-input" placeholder="Username" autoComplete="username"
            value={username} onChange={e => setUsername(e.target.value)} />
          <input className="lp-input" placeholder="Display name (optional)"
            value={displayName} onChange={e => setDisplayName(e.target.value)} />
        </div>
      </section>

      <div style={rule}><div style={ruleDot} /><div style={ruleLine} /></div>

      {/* 02 Account */}
      <section className="ab-step-in" style={{ "--i": "2" } as CSSProperties}>
        <p style={eyebrow}>02 — Your account</p>
        <div className="gh-auth__stack">
          <input className="lp-input" type="email" placeholder="Email" autoComplete="email"
            value={email} onChange={e => setEmail(e.target.value)} />
          <input className="lp-input" type="password" placeholder="Password (8+ characters)" autoComplete="new-password"
            value={password} onChange={e => setPassword(e.target.value)} />
        </div>
      </section>

      <div style={rule}><div style={ruleDot} /><div style={ruleLine} /></div>

      {/* 03 Starting Elo */}
      <section className="ab-step-in" style={{ "--i": "3" } as CSSProperties}>
        <p style={eyebrow}>03 — Where you start</p>

        <div className="gh-elo-pick">
          <div className="gh-elo-pick__readout">
            <p className="gh-elo-pick__num">{startElo}</p>
            <div>
              <p className="gh-elo-pick__tier" style={{ color: tier.color }}>{tier.name}</p>
              <p className="gh-elo-pick__desc">{stop.label}</p>
            </div>
          </div>

          <input
            type="range"
            className="gh-elo-pick__slider"
            min={ELO_MIN}
            max={ELO_MAX_START}
            step={25}
            value={startElo}
            onChange={e => setStartElo(Number(e.target.value))}
            style={{ "--fill": `${pct}%` } as CSSProperties}
            aria-label={`Starting Elo, ${ELO_MIN} for beginners up to ${ELO_MAX_START} for experienced debaters`}
          />

          <div className="gh-elo-pick__scale" aria-hidden="true">
            {ELO_STOPS.map(s => (
              <button
                key={s.value}
                type="button"
                tabIndex={-1}
                className={`gh-elo-pick__stop${startElo === s.value ? " is-on" : ""}`}
                onClick={() => setStartElo(s.value)}
              >
                {s.value}
              </button>
            ))}
          </div>

          <p className="gh-elo-pick__hint">
            Pick honestly: 600 suits first-timers, 1200 suits varsity competitors.
            Every judged round recalibrates you, so a fair start means fair matches sooner.
          </p>
        </div>
      </section>

      <div className="ab-step-in" style={{ "--i": "4", marginTop: "clamp(32px, 6vh, 56px)" } as CSSProperties}>
        <button onClick={handleSignup} disabled={loading} className="db-btn db-btn--accent db-btn--block db-btn--lg">
          {loading ? "Creating account…" : "Create account"}
          {!loading && <span className="db-btn__arrow" aria-hidden="true">→</span>}
        </button>
        <p className="gh-auth__alt">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

const backLink: CSSProperties = { fontFamily: "var(--font-body)", fontSize: 13, color: "rgba(255,255,255,0.65)", padding: "8px 0", textDecoration: "none", textShadow: "0 1px 4px rgba(0,0,0,0.35)" };
const heroTitle: CSSProperties = { fontFamily: "var(--font-display)", fontSize: "clamp(48px, 10vw, 92px)", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", margin: 0, lineHeight: 0.92, textShadow: "0 2px 20px rgba(0,0,0,0.45), 0 8px 40px rgba(0,0,0,0.22)" };
const eyebrow: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)", margin: "0 0 16px", textShadow: "0 1px 4px rgba(0,0,0,0.30)" };
const rule: CSSProperties = { display: "flex", alignItems: "center", gap: 12, margin: "clamp(24px, 4vh, 40px) 0" };
const ruleDot: CSSProperties = { width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 };
const ruleLine: CSSProperties = { flex: 1, height: 1, background: "rgba(255,255,255,0.15)" };
