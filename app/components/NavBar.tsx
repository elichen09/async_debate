"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import ThemePicker from "./ThemePicker";

// Pages where the nav should NOT appear (public / auth screens).
const HIDE_ON = ["/", "/login", "/signup"];

interface NavProfile {
  username: string;
  display_name: string;
  elo: number;
  is_judge: boolean;
}

// Inline SVG icons (no icon-font dependency needed).
const ICONS: Record<string, React.ReactNode> = {
  menu: (<><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>),
  home: (<><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v9h14v-9" /></>),
  plus: (<><path d="M12 5v14" /><path d="M5 12h14" /></>),
  play: (<path d="M8 5l11 7-11 7z" />),
  clock: (<><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>),
  gavel: (<><path d="m9 11 4-4" /><path d="m7 13 4 4" /><path d="m11 7 6 6" /><path d="M4 20h9" /></>),
};

function Icon({ name }: { name: string }) {
  return (
    <svg
      className="db-side__ic"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

export default function SideNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<NavProfile | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (active) setProfile(null); return; }
      const { data } = await supabase
        .from("profiles")
        .select("username, display_name, elo, is_judge")
        .eq("id", session.user.id)
        .single();
      if (active) setProfile(data as NavProfile | null);
    }
    loadProfile();
    return () => { active = false; };
  }, [pathname]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setOpen(false); }, [pathname]);

  if (HIDE_ON.includes(pathname)) return null;

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");
  const linkClass = (href: string) =>
    `db-side__link ${isActive(href) ? "is-active" : ""}`;

  return (
    <>
      <div className="db-topbar">
        <button
          className="db-topbar__burger"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
        >
          <Icon name="menu" />
        </button>
        <Link href="/dashboard" className="db-topbar__brand">A<b>/</b>D</Link>
        {profile && <span className="db-topbar__elo">{profile.elo}</span>}
      </div>

      <div
        className={`db-backdrop ${open ? "is-open" : ""}`}
        onClick={() => setOpen(false)}
      />

      <aside className={`db-side ${open ? "is-open" : ""}`}>
        <Link href="/dashboard" className="db-side__brand" aria-label="Async Debate home">
          A<b>/</b>D
        </Link>

        <div className="db-side__grp">Menu</div>
        <Link href="/dashboard" className={linkClass("/dashboard")}><Icon name="home" />Rounds</Link>
        <Link href="/challenge" className={linkClass("/challenge")}><Icon name="plus" />Challenge</Link>
        <Link href="/watch" className={linkClass("/watch")}><Icon name="play" />Watch</Link>
        <Link href="/history" className={linkClass("/history")}><Icon name="clock" />History</Link>
        {profile?.is_judge && (
          <Link href="/judge" className={linkClass("/judge")}><Icon name="gavel" />Judge</Link>
        )}

        <div className="db-side__spacer" />

        <div className="db-side__grp">Appearance</div>
        <ThemePicker />

        {profile && (
          <div className="db-side__elo" title="Your ELO">
            <span className="db-side__elo-label">ELO</span>
            <span className="db-side__elo-value">{profile.elo}</span>
          </div>
        )}
        <button onClick={handleSignOut} className="db-side__out">Sign out</button>
      </aside>
    </>
  );
}