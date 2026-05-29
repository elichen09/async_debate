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
    <div style={{ fontFamily: "sans-serif", maxWidth: 420, margin: "3rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>Create your account</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>Join the debate. Starting ELO: 1200.</p>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#b91c1c", padding: "10px 14px", borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {success ? (
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", color: "#166534", padding: "10px 14px", borderRadius: 8 , textAlign: "center"}}>
            Account created!
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, display: "block", marginBottom: 4 }}>USERNAME</label>
              <input style={inputStyle} placeholder="debater99" value={username} onChange={e => setUsername(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, display: "block", marginBottom: 4 }}>DISPLAY NAME</label>
              <input style={inputStyle} placeholder="Your name" value={displayName} onChange={e => setDisplayName(e.target.value)} />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 500, display: "block", marginBottom: 4 }}>EMAIL</label>
            <input style={inputStyle} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 500, display: "block", marginBottom: 4 }}>PASSWORD</label>
            <input style={inputStyle} type="password" placeholder="8+ characters" value={password} onChange={e => setPassword(e.target.value)} />
          </div>

          <button onClick={handleSignup} disabled={loading} style={btnStyle}>
            {loading ? "Creating account…" : "Create account"}
          </button>

          <p style={{ textAlign: "center", marginTop: 20, fontSize: 14, color: "#666" }}>
            Already have an account? <a href="/login">Sign in</a>
          </p>
        </>
      )}
    </div>
  );
}

const inputStyle = {
  width: "100%", boxSizing: "border-box" as const, height: 42,
  padding: "0 12px", border: "1px solid #e5e7eb", borderRadius: 8,
  fontSize: 15, outline: "none",
};

const btnStyle = {
  width: "100%", height: 44, background: "#111", color: "#fff",
  border: "none", borderRadius: 8, fontSize: 15, fontWeight: 500,
  cursor: "pointer",
};