"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function SignupPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
        data: { username, display_name: displayName },
      },
    });

    if (signUpError) { setError(signUpError.message); setLoading(false); return; }

    // Sign in immediately — works when email confirmation is disabled in Supabase
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (signInError) { setError("Account created but sign-in failed — try logging in manually."); return; }
    router.push("/dashboard");
  }

  return (
    <div className="db-container db-page" style={{ maxWidth: 460 }}>
      <div className="db-card db-rise" style={{ padding: "32px 28px" }}>
        <p className="db-eyebrow" style={{ marginBottom: 12 }}>Grasshopper</p>
        <h1 style={{ fontSize: 28, marginBottom: 6 }}>Create your account</h1>
        <p style={{ color: "var(--ink-soft)", marginBottom: 24, fontSize: 14 }}>Join the debate. Starting ELO: 1200.</p>

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
      </div>
    </div>
  );
}