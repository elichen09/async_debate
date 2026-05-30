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
  submitted_at: string;
}

interface Round {
  id: string;
  topic: string;
  status: string;
  pro_id: string;
  con_id: string;
  current_speech: number;
  pro: { username: string; display_name: string };
  con: { username: string; display_name: string };
}

export default function RoundPage() {
  const router = useRouter();
  const { id } = useParams();
  const [round, setRound] = useState<Round | null>(null);
  const [speeches, setSpeeches] = useState<Speech[]>([]);
  const [userId, setUserId] = useState("");
  const [myRole, setMyRole] = useState<"pro" | "con">("pro");
  const [uploading, setUploading] = useState(false);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const uid = session.user.id;
      setUserId(uid);

      const { data: roundData } = await supabase
        .from("rounds")
        .select(`
          id, topic, status, pro_id, con_id, current_speech,
          pro:profiles!rounds_pro_id_fkey(username, display_name),
          con:profiles!rounds_con_id_fkey(username, display_name)
        `)
        .eq("id", id)
        .single();

        

      if (!roundData) { router.push("/dashboard"); return; }
      setRound(roundData as unknown as Round);
      setMyRole(roundData.pro_id === uid ? "pro" : "con");

      const { data: speechData } = await supabase
        .from("speeches")
        .select("position, speech_number, storage_path, submitted_at")
        .eq("round_id", id)
        .order("speech_number", { ascending: true });

      setSpeeches(speechData || []);

      // Get signed URLs for each speech
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

  async function handleUpload(file: File) {
    if (!round) return;
    setError("");
    setUploading(true);

    const currentIndex = round.current_speech - 1;
    const position = SPEECH_ORDER[currentIndex].label.toLowerCase().replace(/ /g, "_");
    const path = `${round.id}/${position}.mp3`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from("speeches")
      .upload(path, file, { upsert: true });

    if (uploadError) { setError(uploadError.message); setUploading(false); return; }

    // Insert speech record
    const { error: insertError } = await supabase.from("speeches").insert({
      round_id: round.id,
      speaker_id: userId,
      position,
      speech_number: round.current_speech,
      storage_path: path,
    });

    if (insertError) { setError(insertError.message); setUploading(false); return; }

    // Advance or complete the round
    const nextSpeech = round.current_speech + 1;
    const newStatus = nextSpeech > 8 ? "judging" : "active";

    await supabase.from("rounds").update({
      current_speech: nextSpeech,
      status: newStatus,
    }).eq("id", round.id);

    setUploading(false);
    window.location.reload();
  }

  if (!round) return <p style={{ textAlign: "center", marginTop: "4rem" }}>Loading...</p>;

  const currentIndex = round.current_speech - 1;
  const currentSpeech = SPEECH_ORDER[currentIndex];
  const isMyTurn = currentSpeech?.role === myRole && round.status === "active";
  const opponent = myRole === "pro" ? round.con : round.pro;

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 520, margin: "3rem auto", padding: "0 1rem" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "2rem" }}>
        <button onClick={() => router.push("/dashboard")} style={ghostBtn}>← Back</button>
        <h1 style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>Round</h1>
      </div>

      {/* Round info */}
      <div style={card}>
        <p style={{ fontWeight: 500, fontSize: 16, margin: "0 0 6px" }}>{round.topic}</p>
        <p style={{ fontSize: 13, color: "#6b6760", margin: "0 0 12px" }}>
          vs @{opponent?.username} · You are {myRole === "pro" ? "Pro" : "Con"}
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ ...badge, background: round.status === "judging" ? "#fef9c3" : "#f0fdf4", color: round.status === "judging" ? "#854d0e" : "#166534" }}>
            {round.status === "judging" ? "Awaiting judge" : `Speech ${round.current_speech} of 8`}
          </span>
          {isMyTurn && <span style={{ ...badge, background: "#1a1814", color: "#fff" }}>Your turn</span>}
        </div>
      </div>

      {/* Speech list */}
      <div style={{ marginBottom: "1.5rem" }}>
        <p style={sectionLabel}>Speeches</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {SPEECH_ORDER.map((s, i) => {
            const speechNum = i + 1;
            const position = s.label.toLowerCase().replace(/ /g, "_");
            const submitted = speeches.find(sp => sp.speech_number === speechNum);
            const isCurrent = speechNum === round.current_speech;
            const isPast = speechNum < round.current_speech;
            const isFuture = speechNum > round.current_speech;

            return (
              <div key={i} style={{
                ...speechRow,
                opacity: isFuture ? 0.4 : 1,
                borderColor: isCurrent ? "#1a1814" : "#e5e2dc",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: isPast ? "#1a1814" : isCurrent ? "#f9f7f4" : "#f9f7f4",
                    border: isCurrent ? "2px solid #1a1814" : "1px solid #e5e2dc",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 500,
                    color: isPast ? "#fff" : "#1a1814",
                    flexShrink: 0,
                  }}>
                    {isPast ? "✓" : speechNum}
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: isCurrent ? 500 : 400 }}>{s.label}</p>
                    {submitted && (
                      <p style={{ margin: 0, fontSize: 12, color: "#6b6760" }}>
                        Submitted {new Date(submitted.submitted_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>

                {/* Audio player */}
                {audioUrls[position] && (
                  <audio controls src={audioUrls[position]} style={{ height: 32, width: 160 }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Upload section */}
      {isMyTurn && (
        <div style={{ ...card, borderColor: "#1a1814" }}>
          <p style={sectionLabel}>Submit your speech — {currentSpeech?.label}</p>
          <p style={{ fontSize: 13, color: "#6b6760", margin: "0 0 14px" }}>
            Upload an MP3 recording of your speech.
          </p>

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#b91c1c", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 14 }}>
              {error}
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="audio/mp3,audio/mpeg,audio/*"
            style={{ display: "none" }}
            onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }}
          />

          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={primaryBtn}
          >
            {uploading ? "Uploading…" : "Upload MP3"}
          </button>
        </div>
      )}

      {!isMyTurn && round.status === "active" && (
        <div style={{ ...card, textAlign: "center", color: "#6b6760" }}>
          <p style={{ margin: 0, fontSize: 14 }}>Waiting for opponent to submit their speech...</p>
        </div>
      )}

      {round.status === "judging" && (
        <div style={{ ...card, textAlign: "center" }}>
          <p style={{ fontWeight: 500, margin: "0 0 4px" }}>All speeches submitted!</p>
          <p style={{ fontSize: 14, color: "#6b6760", margin: 0 }}>This round is now awaiting a judge.</p>
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

const speechRow = {
  background: "#ffffff",
  border: "1px solid #e5e2dc",
  borderRadius: 10,
  padding: "12px 14px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
} as const;

const sectionLabel = {
  fontSize: 11,
  fontWeight: 500 as const,
  color: "#6b6760",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  margin: "0 0 10px",
};

const badge = {
  fontSize: 12,
  fontWeight: 500,
  padding: "4px 10px",
  borderRadius: 20,
} as const;

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
  background: "transparent",
  border: "1px solid #e5e2dc",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 14,
  cursor: "pointer",
} as const;