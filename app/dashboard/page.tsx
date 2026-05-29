"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push("/login");
      else setUser(session.user);
    });
  }, []);

  if (!user) return null;

  return (
    <div style={{ maxWidth: 600, margin: "3rem auto", padding: "0 1rem" }}>
      <h1>Dashboard</h1>
      <p>Logged in as {user.email}</p>
      <button onClick={async () => { await supabase.auth.signOut(); router.push("/login"); }}>
        Sign out
      </button>
    </div>
  );
}