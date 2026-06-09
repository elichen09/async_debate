import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Grasshopper",
  description: "Debate anyone, on your schedule.",
};

export default function Home() {
  return (
    <div className="gh-overlay">
      <header className="gh-header">
        <div style={{ display: "flex", gap: 24 }}>
          <Link href="/about" className="gh-nav-link">About</Link>
          <Link href="/founders" className="gh-nav-link">Founders</Link>
          <Link href="/future" className="gh-nav-link">Future</Link>
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          <Link href="/login" className="gh-nav-link">Log in</Link>
          <Link href="/signup" className="gh-nav-link">Sign up</Link>
        </div>
      </header>

      <main className="gh-center" aria-label="Grasshopper">
        <h1 className="gh-title">Grasshopper.</h1>
        <p className="gh-credit">made by Eli and Gary</p>
      </main>

      <footer style={{ position: "absolute", bottom: 20, left: 0, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "oklch(0.97 0.006 80 / 0.35)", letterSpacing: "0.02em", pointerEvents: "auto" }}>
          &copy; {new Date().getFullYear()} Grasshopper. By using this site, you agree to our{" "}
          <Link href="/terms" style={{ color: "inherit", textDecoration: "underline" }}>Terms</Link>
          {" "}and{" "}
          <Link href="/privacy" style={{ color: "inherit", textDecoration: "underline" }}>Privacy Policy</Link>.
        </span>
      </footer>
    </div>
  );
}
