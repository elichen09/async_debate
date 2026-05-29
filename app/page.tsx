import Link from "next/link";

export default function Home() {
  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 480, margin: "6rem auto", padding: "0 1rem", textAlign: "center" }}>
      <h1 style={{ fontSize: 42, fontWeight: 500, letterSpacing: "-1px", marginBottom: 12 }}>
        Async Debate
      </h1>
      <p style={{ color: "#6b6760", fontSize: 17, marginBottom: 40, lineHeight: 1.6 }}>
        Challenge opponents, submit your speeches, and climb the rankings — on your schedule.
      </p>

      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <Link href="/signup" style={primaryBtn}>Get started</Link>
        <Link href="/login" style={secondaryBtn}>Sign in</Link>
      </div>
    </div>
  );
}

const primaryBtn = {
  display: "inline-block",
  padding: "12px 28px",
  background: "#1a1814",
  color: "#fff",
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 500,
  textDecoration: "none",
} as const;

const secondaryBtn = {
  display: "inline-block",
  padding: "12px 28px",
  background: "transparent",
  color: "#1a1814",
  border: "1px solid #e5e2dc",
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 500,
  textDecoration: "none",
} as const;