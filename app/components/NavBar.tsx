"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Pages where the nav should NOT appear (the public / auth screens).
const HIDE_ON = ["/", "/login", "/signup"];

interface NavProfile {
  username: string;
  display_name: string;
  elo: number;
  is_judge: boolean;
}

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<NavProfile | null>(null);

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

  if (HIDE_ON.includes(pathname)) return null;

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="ad-nav">
      <div className="ad-nav__inner">
        <Link href="/dashboard" className="ad-nav__brand" aria-label="Async Debate home">
          <span className="ad-nav__mark">
            A<span style={{ color: "var(--accent)" }}>/</span>D
          </span>
          <span className="ad-nav__word">Async&nbsp;Debate</span>
        </Link>

        <nav className="ad-nav__links">
          <Link href="/dashboard" className={`ad-nav__link ${isActive("/dashboard") ? "is-active" : ""}`}>
            Rounds
          </Link>
          <Link href="/challenge" className={`ad-nav__link ${isActive("/challenge") ? "is-active" : ""}`}>
            Challenge
          </Link>
          {profile?.is_judge && (
            <Link href="/judge" className={`ad-nav__link ${isActive("/judge") ? "is-active" : ""}`}>
              Judge
            </Link>
          )}
        </nav>

        <div className="ad-nav__right">
          {profile && (
            <div className="ad-nav__elo" title="Your ELO">
              <span className="ad-nav__elo-label">ELO</span>
              <span className="ad-nav__elo-value">{profile.elo}</span>
            </div>
          )}
          <button onClick={handleSignOut} className="ad-btn ad-btn--ghost ad-btn--sm">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
