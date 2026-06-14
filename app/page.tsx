import type { Metadata } from "next";
import Link from "next/link";
import { TextScramble } from "./components/TextScramble";
import CursorToggle from "./components/CursorToggle";

export const metadata: Metadata = {
  title: "debate.fish",
  description: "Debate anyone, on your schedule.",
};

export default function Home() {
  return (
    <div className="gh-overlay">
      <header className="gh-header">
        <div style={{ display: "flex", gap: 24 }}>
          <Link href="/about" className="gh-nav-link">About</Link>
          <Link href="/future" className="gh-nav-link">Learn</Link>
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <CursorToggle />
          <Link href="/login" className="gh-nav-link">Log in</Link>
          <Link href="/signup" className="gh-nav-link">Sign up</Link>
        </div>
      </header>

      <main className="gh-center" aria-label="debate.fish">
        <TextScramble
          as="h1"
          className="gh-title"
          style={{ pointerEvents: "auto" }}
          duration={1.1}
          speed={0.045}
          rescrambleOnHover
        >
          debate.fish
        </TextScramble>
        <p className="gh-credit">made by Eli and Gary</p>
      </main>

      <footer style={{ position: "absolute", bottom: 20, left: 0, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "oklch(0.97 0.006 80 / 0.35)", letterSpacing: "0.02em", pointerEvents: "auto" }}>
          &copy; {new Date().getFullYear()} debate.fish. By using this site, you agree to our{" "}
          <Link href="/terms" style={{ color: "inherit", textDecoration: "underline" }}>Terms</Link>
          {" "}and{" "}
          <Link href="/privacy" style={{ color: "inherit", textDecoration: "underline" }}>Privacy Policy</Link>.
        </span>
      </footer>
    </div>
  );
}