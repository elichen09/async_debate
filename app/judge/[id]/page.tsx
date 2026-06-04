"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AudioPlayer from "@/app/components/AudioPlayer";

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
        const { data } = await supabase.storage
          .from("speeches")
          .createSignedUrl(s.storage_path, 3600);
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

  if (!round) return <p style={{ textAlign: "center", marginTop: "4rem", color: "var(--muted)" }}>Loading...</p>;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 20px 80px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "24px 0 20px" }}>
        <button onClick={() => router.push("/judge")} style={ghostBtn}>← Back</button>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 580, color: "var(--ink)", margin: 0 }}>
          Judge Round
        </h1>
      </div>

      {/* Round info */}
      <div style={card}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 140, height: 140, borderRadius: "50%", background: "radial-gradient(circle, color-mix(in srgb, var(--pro) 8%, transparent), transparent 70%)", pointerEvents: "none" }} />
        <p style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)", margin: "0 0 6px", position: "relative", zIndex: 1 }}>topic</p>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--ink)", margin: "0 0 8px", position: "relative", zIndex: 1 }}>{round.topic}</h2>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, position: "relative", zIndex: 1 }}>
          @{round.pro?.username} (Pro) vs @{round.con?.username} (Con)
        </p>
      </div>

      {/* Speeches */}
      <p style={sectionLabel}>Speeches</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
        {SPEECH_ORDER.map((s, i) => {
          const position = s.label.toLowerCase().replace(/ /g, "_");
          const url = audioUrls[position];
          const speaker = s.role === "pro" ? round.pro?.username : round.con?.username;
          return (
            <div key={i} style={{ ...card, opacity: url ? 1 : 0.4, marginBottom: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: url ? 10 : 0, position: "relative", zIndex: 1 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{s.label}</p>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--muted)" }}>@{speaker}</p>
                </div>
                {!url && <span style={{ fontSize: 11, color: "var(--muted)" }}>Not submitted</span>}
              </div>
              {url && <AudioPlayer src={url} />}
            </div>
          );
        })}
      </div>

      {/* Ballot */}
      {!ballotSubmitted ? (
        <>
          <p style={sectionLabel}>Submit ballot</p>

          {error && (
            <div style={{ background: "color-mix(in srgb, var(--loss) 10%, transparent)", border: "0.5px solid color-mix(in srgb, var(--loss) 30%, transparent)", color: "var(--loss)", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* Winner */}
          <div style={{ ...card, marginBottom: 10 }}>
            <p style={sectionLabel}>Winner</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, position: "relative", zIndex: 1 }}>
              {(["pro", "con"] as const).map(side => (
                <div
                  key={side}
                  onClick={() => setWinner(side)}
                  style={{
                    padding: "14px 16px", borderRadius: 8,
                    cursor: "pointer", textAlign: "center",
                    background: winner === side ? "color-mix(in srgb, var(--pro) 15%, transparent)" : "var(--card)",
                    border: `0.5px solid ${winner === side ? "var(--pro)" : "var(--line)"}`,
                  }}
                >
                  <p style={{ fontWeight: 600, margin: "0 0 2px", fontSize: 14, color: winner === side ? "var(--pro)" : "var(--ink)" }}>
                    {side === "pro" ? "Pro" : "Con"}
                  </p>
                  <p style={{ fontSize: 12, margin: 0, color: "var(--muted)" }}>
                    @{side === "pro" ? round.pro?.username : round.con?.username}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Speaker points */}
          <div style={{ ...card, marginBottom: 10 }}>
            <p style={sectionLabel}>Speaker points</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, position: "relative", zIndex: 1 }}>
              {[
                { label: `Pro — @${round.pro?.username}`, val: proSpeaks, set: setProSpeaks },
                { label: `Con — @${round.con?.username}`, val: conSpeaks, set: setConSpeaks },
              ].map(f => (
                <div key={f.label}>
                  <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {f.label}
                  </label>
                  <input
                    type="number" min="20" max="30" step="0.5"
                    value={f.val}
                    onChange={e => f.set(e.target.value)}
                    style={{
                      width: "100%", boxSizing: "border-box" as const,
                      height: 40, padding: "0 12px",
                      background: "var(--card)",
                      border: "0.5px solid var(--line-strong)",
                      borderRadius: 8, fontSize: 15,
                      color: "var(--ink)", outline: "none",
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Reasoning */}
          <div style={{ ...card, marginBottom: 16 }}>
            <p style={sectionLabel}>Reasoning</p>
            <textarea
              placeholder="Explain your decision..."
              value={reasoning}
              onChange={e => setReasoning(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box" as const,
                height: 120, padding: "10px 12px",
                background: "var(--card)",
                border: "0.5px solid var(--line-strong)",
                borderRadius: 8, fontSize: 14, color: "var(--ink)",
                outline: "none", resize: "vertical",
                fontFamily: "inherit", lineHeight: 1.6,
                position: "relative", zIndex: 1,
              }}
            />
          </div>

          <button onClick={handleSubmitBallot} disabled={submitting} style={primaryBtn}>
            {submitting ? "Submitting…" : "Submit ballot"}
          </button>
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ ...card, textAlign: "center" }}>
            <p style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 16, color: "var(--win)", margin: "0 0 6px", position: "relative", zIndex: 1 }}>
              Ballot submitted!
            </p>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, position: "relative", zIndex: 1 }}>
              You can now delete the speeches or go back.
            </p>
          </div>
          <button
            onClick={handleDeleteSpeeches}
            style={{ ...primaryBtn, background: "color-mix(in srgb, var(--loss) 15%, transparent)", color: "var(--loss)", border: "0.5px solid color-mix(in srgb, var(--loss) 30%, transparent)" }}
          >
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

const card: React.CSSProperties = {
  background: "var(--card)",
  border: "0.5px solid var(--line)",
  borderRadius: 14, padding: "18px 20px",
  marginBottom: 10, position: "relative", overflow: "hidden",
};

const sectionLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 500, color: "var(--muted)",
  textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 12px",
};

const ghostBtn: React.CSSProperties = {
  width: "100%", height: 44, background: "transparent",
  border: "0.5px solid var(--line-strong)",
  borderRadius: 8, fontSize: 14, color: "var(--muted)", cursor: "pointer",
};

const primaryBtn: React.CSSProperties = {
  width: "100%", height: 44, background: "var(--pro)",
  color: "var(--ink)", border: "none", borderRadius: 8,
  fontSize: 15, fontWeight: 600, cursor: "pointer",
};