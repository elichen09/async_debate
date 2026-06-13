"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import SceneToggle from "./SceneToggle";

const HIDE_ON = ["/", "/login", "/signup", "/forgot-password", "/reset-password", "/about", "/future", "/terms", "/privacy", "/the-past"];

const NAV_LINKS = [
  { href: "/dashboard", label: "Rounds" },
  { href: "/challenge", label: "Challenge" },
  { href: "/rankings", label: "Rankings" },
  { href: "/tournaments", label: "Tournaments" },
  { href: "/watch", label: "Watch" },
  { href: "/the-past", label: "The Past" },
  { href: "/history", label: "History" },
  { href: "/judge", label: "Judge" },
  { href: "/future", label: "Future" },
];

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [elo, setElo] = useState<number | null>(null);
  const [username, setUsername] = useState<string>("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (active) { setElo(null); setUsername(""); } return; }
      const { data } = await supabase
        .from("profiles")
        .select("username, elo")
        .eq("id", session.user.id)
        .single();
      if (active && data) { setElo(data.elo); setUsername(data.username); }
    }
    load();
    return () => { active = false; };
  }, [pathname]);

  useEffect(() => { setOpen(false); }, [pathname]);

  if (HIDE_ON.includes(pathname)) return null;

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      <nav className="gh-topnav">
        <button
          className="gh-topnav__burger"
          onClick={() => setOpen(o => !o)}
          aria-label="Open menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>

        <Link href="/dashboard" className="gh-topnav__brand">
          GRASS<b>H</b>OPPER
        </Link>

        <div className="gh-topnav__right">
          <SceneToggle />
          {elo !== null && <span className="gh-topnav__elo">{elo}</span>}
          {username && <span className="gh-topnav__username">@{username}</span>}
          <button onClick={handleSignOut} className="gh-topnav__out">Sign out</button>
        </div>
      </nav>

      {/* Vertical rail: the primary links live on the left edge, rotated 90° */}
      <nav className="gh-siderail" aria-label="Primary">
        {NAV_LINKS.map((link, i) => (
          <Link
            key={link.href}
            href={link.href}
            className={`gh-siderail__link ${isActive(link.href) ? "is-active" : ""}`}
            style={{ "--i": String(i) } as React.CSSProperties}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div
        className={`gh-drawer-backdrop ${open ? "is-open" : ""}`}
        onClick={() => setOpen(false)}
      />

      <aside className={`gh-drawer ${open ? "is-open" : ""}`}>
        <Link href="/dashboard" className="gh-drawer__brand">
          GRASS<b>H</b>OPPER
        </Link>
        {NAV_LINKS.map(link => (
          <Link
            key={link.href}
            href={link.href}
            className={`gh-drawer__link ${isActive(link.href) ? "is-active" : ""}`}
          >
            {link.label}
          </Link>
        ))}
        {username && <p className="gh-drawer__user">@{username} · ELO {elo}</p>}
        <div style={{ padding: "8px 12px" }}>
          <SceneToggle />
        </div>
        <button onClick={handleSignOut} className="gh-drawer__out">Sign out</button>
      </aside>
    </>
  );
}