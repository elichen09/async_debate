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
    <div style={{ fontFamily: "sans-serif", maxWidth: 420, margin: "3rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>Welcome back</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>Sign in to your account.</p>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#b91c1c", padding: "10px 14px", borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 500, display: "block", marginBottom: 4 }}>EMAIL</label>
        <input
          style={inputStyle}
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleLogin()}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 500 }}>PASSWORD</label>
          <a href="/forgot-password" style={{ fontSize: 12, color: "#666" }}>Forgot password?</a>
        </div>
        <input
          style={inputStyle}
          type="password"
          placeholder="Your password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleLogin()}
        />
      </div>

      <button onClick={handleLogin} disabled={loading} style={btnStyle}>
        {loading ? "Signing in…" : "Sign in"}
      </button>

      <p style={{ textAlign: "center", marginTop: 20, fontSize: 14, color: "#666" }}>
        Don't have an account? <a href="/signup">Sign up</a>
      </p>
    </div>
  );
}

const inputStyle = {
  width: "100%", boxSizing: "border-box" as const, height: 42,
  padding: "0 12px", border: "1px solid #e5e2dc", borderRadius: 8,
  fontSize: 15, outline: "none", background: "transparent",
};

const btnStyle = {
  width: "100%", height: 44, background: "#1a1814", color: "#fff",
  border: "none", borderRadius: 8, fontSize: 15, fontWeight: 500,
  cursor: "pointer",
};