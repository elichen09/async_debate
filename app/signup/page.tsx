"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function SignupPage() {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSignup() {
    setError("");
    if (!username || !email || !password) {
      setError("Please fill in all required fields.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username, display_name: displayName },
      },
    });
    setLoading(false);

    if (error) { setError(error.message); return; }
    setSuccess(true);
  }

  return (
    <div className="db-container db-page db-rise" style={{ maxWidth: 420 }}>
      <p className="db-eyebrow">Grasshopper</p>
      <h1 style={{ fontSize: 30, marginBottom: 6 }}>Create your account</h1>
      <p style={{ color: "var(--ink-soft)", marginBottom: 24 }}>Join the debate. Starting ELO: 1200.</p>

      {error && (
        <div
          style={{
            background: "color-mix(in srgb, var(--loss) 10%, var(--card))",
            border: "1px solid color-mix(in srgb, var(--loss) 35%, transparent)",
            color: "var(--loss)",
            padding: "10px 14px",
            borderRadius: "var(--radius-sm)",
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {success ? (
        <div
          style={{
            background: "color-mix(in srgb, var(--win) 12%, var(--card))",
            border: "1px solid color-mix(in srgb, var(--win) 35%, transparent)",
            color: "var(--win)",
            padding: "10px 14px",
            borderRadius: "var(--radius-sm)",
            textAlign: "center",
            fontSize: 14,
          }}
        >
          Account created!
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label className="db-label">USERNAME</label>
              <input className="db-input" placeholder="debater99" value={username} onChange={e => setUsername(e.target.value)} />
            </div>
            <div>
              <label className="db-label">DISPLAY NAME</label>
              <input className="db-input" placeholder="Your name" value={displayName} onChange={e => setDisplayName(e.target.value)} />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label className="db-label">EMAIL</label>
            <input className="db-input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>

          <div style={{ marginBottom: 22 }}>
            <label className="db-label">PASSWORD</label>
            <input className="db-input" type="password" placeholder="8+ characters" value={password} onChange={e => setPassword(e.target.value)} />
          </div>

          <button onClick={handleSignup} disabled={loading} className="db-btn db-btn--primary db-btn--block">
            {loading ? "Creating account…" : "Create account"}
          </button>

          <p style={{ textAlign: "center", marginTop: 20, fontSize: 14, color: "var(--ink-soft)" }}>
            Already have an account? <a href="/login">Sign in</a>
          </p>
        </>
      )}
    </div>
  );
}