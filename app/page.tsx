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
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          <Link href="/login" className="gh-nav-link">Log in</Link>
          <Link href="/signup" className="gh-nav-link">Sign up</Link>
        </div>
      </header>

      <main className="gh-center" aria-label="Grasshopper">
        <h1 className="gh-title">Grasshopper</h1>
      </main>

      <footer className="gh-footer">
        <p className="gh-credit">made by Eli and Gary</p>
      </footer>
    </div>
  );
}
