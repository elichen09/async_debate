"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface Round {
  id: string;
  topic: string;
  status: string;
  winner_id: string;
  created_at: string;
  completed_at: string;
  pro_id: string;
  con_id: string;
  pro: { username: string };
  con: { username: string };
}

export default function HistoryPage() {
  const router = useRouter();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      setUserId(session.user.id);

      const { data } = await supabase
        .from("rounds")
        .select(`
          id, topic, status, winner_id, created_at, completed_at, pro_id, con_id,
          pro:profiles!pro_id(username),
          con:profiles!con_id(username)
        `)
        .in("status", ["complete", "judging"])
        .or(`pro_id.eq.${session.user.id},con_id.eq.${session.user.id}`)
        .order("created_at", { ascending: false });

      setRounds((data || []) as unknown as Round[]);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: "80px 20px" }}>
      <p className="db-card" style={{ padding: "24px 32px", color: "var(--ink-soft)" }}>Loading…</p>
    </div>
  );

  return (
    <div className="db-container db-page">
      <div className="db-card db-rise" style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, marginBottom: 4, color: "var(--ink)" }}>Round history</h1>
        <p style={{ color: "var(--ink-soft)", margin: 0, fontSize: 13 }}>
          {rounds.length} round{rounds.length !== 1 ? "s" : ""} total
        </p>
      </div>

      {rounds.length === 0 ? (
        <div className="db-card db-rise" style={{ textAlign: "center", color: "var(--muted)", '--i': '1' } as React.CSSProperties}>
          <p style={{ margin: 0 }}>No completed rounds yet.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rounds.map((r, idx) => {
            const opponent = r.pro_id === userId ? r.con : r.pro;
            const isComplete = r.status === "complete";
            const won = r.winner_id === userId;

            return (
              <div
                key={r.id}
                className="db-card db-card--interactive db-rise"
                style={{ '--i': String(Math.min(idx + 1, 8)) } as React.CSSProperties}
                onClick={() => router.push(`/round/${r.id}`)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 500, fontSize: 15, margin: "0 0 4px" }}>{r.topic}</p>
                    <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 12px" }}>
                      vs @{opponent?.username} · {new Date(r.created_at).toLocaleDateString()}
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      {isComplete ? (
                        <span className={`db-badge ${won ? "db-badge--win" : "db-badge--loss"}`}>
                          {won ? "✓ Win" : "✗ Loss"}
                        </span>
                      ) : (
                        <span className="db-badge db-badge--wait">⏳ Awaiting judge</span>
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>
                    View →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}