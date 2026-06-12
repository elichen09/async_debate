"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { CSSProperties } from "react";

// Landing page for the recovery email link. Supabase signs the user in from
// the URL tokens; we wait for that session, then let them set a new password.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || session) setStatus("ready");
    });

    // The URL tokens take a moment to exchange; only give up after a grace period.
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) { setStatus("ready"); return; }
      setTimeout(async () => {
        if (cancelled) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (!cancelled) setStatus(session ? "ready" : "invalid");
      }, 2500);
    })();

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  async function handleSave() {
    setError("");
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) { setError(error.message); return; }
    router.push("/dashboard");
  }

  return (
    <div className="gh-auth gh-auth--narrow">

      <div style={{ paddingTop: "clamp(20px, 4vh, 36px)" }}>
        <Link href="/login" style={backLink}>← Sign in</Link>
      </div>

      <section style={{ paddingTop: "clamp(16px, 3vh, 28px)" }}>
        <h1 className="ab-hero-line" style={{ "--i": "0", ...heroTitle } as CSSProperties}>
          New<br />password.
        </h1>
        <p className="ab-hero-line gh-auth__sub" style={{ "--i": "1" } as CSSProperties}>
          {status === "invalid"
            ? "This link didn't check out."
            : "Pick something you'll remember this time."}
        </p>
      </section>

      {error && <p className="gh-auth__error">⚑ {error}</p>}

      <div style={rule}><div style={ruleDot} /><div style={ruleLine} /></div>

      {status === "checking" && (
        <div className="gh-loading-dots"><span /><span /><span /></div>
      )}

      {status === "invalid" && (
        <section className="ab-step-in" style={{ "--i": "1" } as CSSProperties}>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", lineHeight: 1.7, margin: 0, textShadow: "0 1px 5px rgba(0,0,0,0.35)" }}>
            The reset link is invalid or has expired — they only work once and
            don&rsquo;t last long.
          </p>
          <div style={{ marginTop: "clamp(28px, 5vh, 44px)" }}>
            <Link href="/forgot-password" className="db-btn db-btn--accent db-btn--block db-btn--lg" style={{ textDecoration: "none" }}>
              Request a new link
              <span className="db-btn__arrow" aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      )}

      {status === "ready" && (
        <>
          <section className="ab-step-in" style={{ "--i": "1" } as CSSProperties}>
            <div className="gh-auth__stack">
              <input
                className="lp-input"
                type="password"
                placeholder="New password"
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSave()}
              />
              <input
                className="lp-input"
                type="password"
                placeholder="Confirm new password"
                autoComplete="new-password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSave()}
              />
            </div>
          </section>

          <div className="ab-step-in" style={{ "--i": "2", marginTop: "clamp(28px, 5vh, 44px)" } as CSSProperties}>
            <button onClick={handleSave} disabled={loading} className="db-btn db-btn--accent db-btn--block db-btn--lg">
              {loading ? "Saving…" : "Set new password"}
              {!loading && <span className="db-btn__arrow" aria-hidden="true">→</span>}
            </button>
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
