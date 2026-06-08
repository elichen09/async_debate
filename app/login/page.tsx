"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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
    <div className="db-container db-page db-rise" style={{ maxWidth: 420 }}>
      <div className="db-card" style={{ padding: "32px 28px" }}>
        <p className="db-eyebrow" style={{ marginBottom: 12 }}>Grasshopper</p>
        <h1 style={{ fontSize: 28, marginBottom: 6 }}>Welcome back</h1>
        <p style={{ color: "var(--ink-soft)", marginBottom: 24, fontSize: 14 }}>Sign in to your account.</p>

        {error && (
          <div
            style={{
              background: "color-mix(in srgb, var(--loss) 10%, transparent)",
              border: "0.5px solid color-mix(in srgb, var(--loss) 35%, transparent)",
              color: "var(--loss)",
              padding: "10px 14px",
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label className="db-label">EMAIL</label>
          <input
            className="db-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
          />
        </div>

        <div style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <label className="db-label">PASSWORD</label>
            <a href="/forgot-password" style={{ fontSize: 12 }}>Forgot password?</a>
          </div>
          <input
            className="db-input"
            type="password"
            placeholder="Your password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
          />
        </div>

        <button onClick={handleLogin} disabled={loading} className="db-btn db-btn--primary db-btn--block">
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 14, color: "var(--ink-soft)" }}>
          Don&apos;t have an account? <a href="/signup">Sign up</a>
        </p>
      </div>
    </div>
  );
}