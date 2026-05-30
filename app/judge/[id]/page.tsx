"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

const SPEECH_ORDER = [
  { label: "Pro Constructive", role: "pro" },
  { label: "Con Constructive", role: "con" },
  { label: "Pro Rebuttal", role: "pro" },
  { label: "Con Rebuttal", role: "con" },
  { label: "Pro Summary", role: "pro" },
  { label: "Con Summary", role: "con" },
  { label: "Pro Final Focus", role: "pro" },
  { label: "Con Final Focus", role: "con" },
];

interface Speech {
  position: string;
  speech_number: number;
  storage_path: string;
}

interface Round {
  id: string;
  topic: string;
  status: string;
  pro_id: string;
  con_id: string;
  judge_id: string;
  pro: { username: string; display_name: string };
  con: { username: string; display_name: string };
}

export default function JudgeRoundPage() {
  const router = useRouter();
  const { id } = useParams();
  const [round, setRound] = useState<Round | null>(null);
  const [speeches, setSpeeches] = useState<Speech[]>([]);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [winner, setWinner] = useState<"pro" | "con" | null>(null);
  const [proSpeaks, setProSpeaks] = useState("27.5");
  const [conSpeaks, setConSpeaks] = useState("27.5");
  const [reasoning, setReasoning] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ballotSubmitted, setBallotSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState("");

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      setUserId(session.user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("is_judge")
        .eq("id", session.user.id)
        .single();
      if (!profile?.is_judge) { router.push("/dashboard"); return; }

      const { data: roundData } = await supabase
        .from("rounds")
        .select(`
          id, topic, status, pro_id, con_id, judge_id,
          pro:profiles!pro_id(username, display_name),
          con:profiles!con_id(username, display_name)
        `)
        .eq("id", id)
        .single();

      if (!roundData) { router.push("/judge"); return; }
      setRound(roundData as unknown as Round);

      const { data: speechData } = await supabase
        .from("speeches")
        .select("position, speech_number, storage_path")
        .eq("round_id", id)
        .order("speech_number", { ascending: true });

      setSpeeches(speechData || []);

      const urls: Record<string, string> = {};
      for (const s of speechData || []) {
        const { data, error } = await supabase.storage
          .from("speeches")
          .createSignedUrl(s.storage_path, 3600);
        console.log("speech:", s.storage_path, "url:", data, "error:", error);
        if (data) urls[s.position] = data.signedUrl;
      }
      setAudioUrls(urls);
    }
    load();
  }, [id]);

  async function handleSubmitBallot() {
    if (!round || !winner) { setError("Please select a winner."); return; }
    setSubmitting(true);
    setError("");

    const winnerId = winner === "pro" ? round.pro_id : round.con_id;

    const { error: ballotError } = await supabase.from("ballots").insert({
      round_id: round.id,
      judge_id: userId,
      winner_id: winnerId,
      pro_speaks: parseFloat(proSpeaks),
      con_speaks: parseFloat(conSpeaks),
      reasoning,
    });

    if (ballotError) { setError(ballotError.message); setSubmitting(false); return; }

    await supabase.from("rounds").update({
      status: "complete",
      winner_id: winnerId,
      judge_notes: reasoning,
      completed_at: new Date().toISOString(),
    }).eq("id", round.id);

    setSubmitting(false);
    setBallotSubmitted(true);
  }

  async function handleDeleteSpeeches() {
    if (!round) return;
    const paths = speeches.map(s => s.storage_path);

    await supabase.storage.from("speeches").remove(paths);
    await supabase.from("speeches").delete().eq("round_id", round.id);

    router.push("/judge");
  }

  if (!round) return <p style={{ textAlign: "center", marginTop: "4rem" }}>Loading...</p>;

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 520, margin: "3rem auto", padding: "0 1rem 4rem" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "2rem" }}>
        <button onClick={() => router.push("/judge")} style={ghostBtn}>← Back</button>
        <h1 style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>Judge Round</h1>
      </div>

      {/* Round info */}
      <div style={card}>
        <p style={{ fontWeight: 500, fontSize: 16, margin: "0 0 6px" }}>{round.topic}</p>
        <p style={{ fontSize: 13, color: "#6b6760", margin: 0 }}>
          @{round.pro?.username} (Pro) vs @{round.con?.username} (Con)
        </p>
      </div>

      {/* Speeches */}
      <p style={sectionLabel}>Speeches</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "1.5rem" }}>
        {SPEECH_ORDER.map((s, i) => {
          const position = s.label.toLowerCase().replace(/ /g, "_");
          const url = audioUrls[position];
          return (
            <div key={i} style={{ ...card, opacity: url ? 1 : 0.4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{s.label}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "#6b6760" }}>
                    {s.role === "pro" ? `@${round.pro?.username}` : `@${round.con?.username}`}
                  </p>
                </div>
                {url && <audio controls src={url} style={{ height: 32, width: 200 }} />}
                {!url && <span style={{ fontSize: 12, color: "#6b6760" }}>Not submitted</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Ballot */}
      {!ballotSubmitted ? (
        <>
          <p style={sectionLabel}>Submit ballot</p>

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#b91c1c", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 14 }}>
              {error}
            </div>
          )}

          <div style={{ ...card, marginBottom: "1rem" }}>
            <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 12px" }}>Winner</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div
                onClick={() => setWinner("pro")}
                style={{
                  ...sideBox,
                  border: winner === "pro" ? "2px solid #1a1814" : "1px solid #e5e2dc",
                  background: winner === "pro" ? "#1a1814" : "#f9f7f4",
                  color: winner === "pro" ? "#fff" : "#1a1814",
                }}
              >
                <p style={{ fontWeight: 500, margin: "0 0 2px" }}>Pro</p>
                <p style={{ fontSize: 12, margin: 0, opacity: 0.7 }}>@{round.pro?.username}</p>
              </div>
              <div
                onClick={() => setWinner("con")}
                style={{
                  ...sideBox,
                  border: winner === "con" ? "2px solid #1a1814" : "1px solid #e5e2dc",
                  background: winner === "con" ? "#1a1814" : "#f9f7f4",
                  color: winner === "con" ? "#fff" : "#1a1814",
                }}
              >
                <p style={{ fontWeight: 500, margin: "0 0 2px" }}>Con</p>
                <p style={{ fontSize: 12, margin: 0, opacity: 0.7 }}>@{round.con?.username}</p>
              </div>
            </div>
          </div>

          <div style={{ ...card, marginBottom: "1rem" }}>
            <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 12px" }}>Speaker points</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={inputLabel}>Pro (@{round.pro?.username})</label>
                <input
                  style={inputStyle}
                  type="number"
                  min="20"
                  max="30"
                  step="0.5"
                  value={proSpeaks}
                  onChange={e => setProSpeaks(e.target.value)}
                />
              </div>
              <div>
                <label style={inputLabel}>Con (@{round.con?.username})</label>
                <input
                  style={inputStyle}
                  type="number"
                  min="20"
                  max="30"
                  step="0.5"
                  value={conSpeaks}
                  onChange={e => setConSpeaks(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div style={{ ...card, marginBottom: "1.5rem" }}>
            <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 12px" }}>Reasoning</p>
            <textarea
              style={{ ...inputStyle, height: 120, padding: "10px 12px", resize: "vertical" }}
              placeholder="Explain your decision..."
              value={reasoning}
              onChange={e => setReasoning(e.target.value)}
            />
          </div>

          <button onClick={handleSubmitBallot} disabled={submitting} style={primaryBtn}>
            {submitting ? "Submitting…" : "Submit ballot"}
          </button>
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ ...card, textAlign: "center" }}>
            <p style={{ fontWeight: 500, margin: "0 0 4px" }}>Ballot submitted!</p>
            <p style={{ fontSize: 14, color: "#6b6760", margin: 0 }}>You can now delete the speeches or go back.</p>
          </div>
          <button onClick={handleDeleteSpeeches} style={{ ...primaryBtn, background: "#b91c1c" }}>
            Delete all speeches
          </button>
          <button onClick={() => router.push("/judge")} style={ghostBtn}>
            Back to judge dashboard
          </button>
        </div>
      )}

    </div>
  );
}

const card = {
  background: "#ffffff",
  border: "1px solid #e5e2dc",
  borderRadius: 12,
  padding: "1.25rem",
  marginBottom: "1rem",
} as const;

const sectionLabel = {
  fontSize: 11,
  fontWeight: 500 as const,
  color: "#6b6760",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  margin: "0 0 10px",
};

const sideBox = {
  padding: "14px 16px",
  borderRadius: 8,
  cursor: "pointer",
  textAlign: "center" as const,
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  height: 42,
  padding: "0 12px",
  border: "1px solid #e5e2dc",
  borderRadius: 8,
  fontSize: 15,
  outline: "none",
  background: "transparent",
  fontFamily: "sans-serif",
};

const inputLabel = {
  fontSize: 12,
  fontWeight: 500 as const,
  color: "#6b6760",
  display: "block" as const,
  marginBottom: 6,
};

const primaryBtn = {
  width: "100%",
  height: 44,
  background: "#1a1814",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 500,
  cursor: "pointer",
} as const;

const ghostBtn = {
  width: "100%",
  height: 44,
  background: "transparent",
  border: "1px solid #e5e2dc",
  borderRadius: 8,
  fontSize: 14,
  cursor: "pointer",
} as const;