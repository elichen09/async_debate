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
    <header className="db-nav">
      <div className="db-nav__inner">
        <Link href="/dashboard" className="db-nav__brand" aria-label="Async Debate home">
          <span className="db-nav__mark">
            A<span style={{ color: "var(--accent)" }}>/</span>D
          </span>
          <span className="db-nav__word">Async&nbsp;Debate</span>
        </Link>

        <nav className="db-nav__links">
          <Link href="/dashboard" className={`db-nav__link ${isActive("/dashboard") ? "is-active" : ""}`}>
            Rounds
          </Link>
          <Link href="/challenge" className={`db-nav__link ${isActive("/challenge") ? "is-active" : ""}`}>
            Challenge
          </Link>
          {profile?.is_judge && (
            <Link href="/judge" className={`db-nav__link ${isActive("/judge") ? "is-active" : ""}`}>
              Judge
            </Link>
          )}
        </nav>

        <div className="db-nav__right">
          {profile && (
            <div className="db-nav__elo" title="Your ELO">
              <span className="db-nav__elo-label">ELO</span>
              <span className="db-nav__elo-value">{profile.elo}</span>
            </div>
          )}
          <button onClick={handleSignOut} className="db-btn db-btn--ghost db-btn--sm">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}