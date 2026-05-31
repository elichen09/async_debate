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

interface Ballot {
  winner_id: string;
  pro_speaks: number;
  con_speaks: number;
  reasoning: string;
  submitted_at: string;
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
  const [ballot, setBallot] = useState<Ballot | null>(null);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioPreview, setAudioPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const chunksRef = useRef<BlobPart[]>([]);

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
          pro:profiles!pro_id(username, display_name),
          con:profiles!con_id(username, display_name)
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

      const urls: Record<string, string> = {};
      for (const s of speechData || []) {
        const { data } = await supabase.storage
          .from("speeches")
          .createSignedUrl(s.storage_path, 3600);
        if (data) urls[s.position] = data.signedUrl;
      }
      setAudioUrls(urls);

      const { data: ballotData } = await supabase
        .from("ballots")
        .select("winner_id, pro_speaks, con_speaks, reasoning, submitted_at")
        .eq("round_id", id)
        .single();

      if (ballotData) setBallot(ballotData as Ballot);
    }
    load();
  }, [id]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = e => chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioPreview(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setRecording(true);
    } catch (err) {
      setError("Microphone access denied. Please allow microphone access or upload an MP3.");
    }
  }

  function stopRecording() {
    mediaRecorder?.stop();
    setRecording(false);
  }

  async function handleUploadBlob(blob: Blob) {
    if (!round) return;
    setError("");
    setUploading(true);

    const currentIndex = round.current_speech - 1;
    const position = SPEECH_ORDER[currentIndex].label.toLowerCase().replace(/ /g, "_");
    const path = `${round.id}/${position}_${Date.now()}.webm`;

    const { error: uploadError } = await supabase.storage
      .from("speeches")
      .upload(path, blob, { contentType: "audio/webm" });

    if (uploadError) { setError(uploadError.message); setUploading(false); return; }

    const { error: insertError } = await supabase.from("speeches").insert({
      round_id: round.id,
      speaker_id: userId,
      position,
      speech_number: round.current_speech,
      storage_path: path,
    });

    if (insertError) { setError(insertError.message); setUploading(false); return; }

    const nextSpeech = round.current_speech + 1;
    const newStatus = nextSpeech > 8 ? "judging" : "active";

    await supabase.from("rounds").update({
      current_speech: nextSpeech,
      status: newStatus,
    }).eq("id", round.id);

    setUploading(false);
    window.location.reload();
  }

  async function handleUpload(file: File) {
    if (!round) return;
    setError("");
    setUploading(true);

    const currentIndex = round.current_speech - 1;
    const position = SPEECH_ORDER[currentIndex].label.toLowerCase().replace(/ /g, "_");
    const path = `${round.id}/${position}_${Date.now()}.mp3`;

    const { error: uploadError } = await supabase.storage
      .from("speeches")
      .upload(path, file, { contentType: "audio/mpeg" });

    if (uploadError) { setError(uploadError.message); setUploading(false); return; }

    const { error: insertError } = await supabase.from("speeches").insert({
      round_id: round.id,
      speaker_id: userId,
      position,
      speech_number: round.current_speech,
      storage_path: path,
    });

    if (insertError) { setError(insertError.message); setUploading(false); return; }

    const nextSpeech = round.current_speech + 1;
    const newStatus = nextSpeech > 2 ? "judging" : "active";

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
    <div style={{ fontFamily: "sans-serif", maxWidth: 520, margin: "3rem auto", padding: "0 1rem 4rem" }}>

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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{
            ...badge,
            background: round.status === "judging" ? "#fef9c3" : round.status === "complete" ? "#f0fdf4" : "#f0fdf4",
            color: round.status === "judging" ? "#854d0e" : round.status === "complete" ? "#166534" : "#166534",
          }}>
            {round.status === "judging" ? "⏳ Awaiting judge" : round.status === "complete" ? "✓ Complete" : `Speech ${round.current_speech} of 8`}
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
                    background: isPast ? "#1a1814" : "#f9f7f4",
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

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#b91c1c", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 14 }}>
              {error}
            </div>
          )}

          {/* Recording */}
          <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 10px" }}>Record directly</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {!recording ? (
              <button onClick={startRecording} style={{ ...secondaryBtn, flex: 1 }}>
                🎙 Start recording
              </button>
            ) : (
              <button onClick={stopRecording} style={{ ...secondaryBtn, flex: 1, borderColor: "#b91c1c", color: "#b91c1c" }}>
                ⏹ Stop recording
              </button>
            )}
          </div>

          {recording && (
            <div style={{ fontSize: 13, color: "#b91c1c", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#b91c1c", display: "inline-block" }} />
              Recording...
            </div>
          )}

          {audioPreview && !recording && (
            <div style={{ marginBottom: 12 }}>
              <audio controls src={audioPreview} style={{ width: "100%", marginBottom: 8 }} />
              <button
                onClick={() => handleUploadBlob(audioBlob!)}
                disabled={uploading}
                style={primaryBtn}
              >
                {uploading ? "Uploading…" : "Submit recording"}
              </button>
            </div>
          )}

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
            <div style={{ flex: 1, height: 1, background: "#e5e2dc" }} />
            <span style={{ fontSize: 12, color: "#6b6760" }}>or upload a file</span>
            <div style={{ flex: 1, height: 1, background: "#e5e2dc" }} />
          </div>

          {/* File upload fallback */}
          <input
            ref={fileRef}
            type="file"
            accept="audio/mp3,audio/mpeg,audio/*"
            style={{ display: "none" }}
            onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }}
          />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} style={secondaryBtn}>
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

      {/* Ballot */}
      {ballot && round.status === "complete" && (
        <div style={{ ...card, borderColor: "#1a1814" }}>
          <p style={sectionLabel}>Judge's decision</p>
          <p style={{
            fontSize: 18,
            fontWeight: 500,
            margin: "0 0 16px",
            color: ballot.winner_id === userId ? "#166534" : "#b91c1c",
          }}>
            {ballot.winner_id === userId ? "✓ You won!" : "✗ You lost"}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div style={statBox}>
              <p style={statLabel}>Pro speaks</p>
              <p style={statValue}>{ballot.pro_speaks}</p>
            </div>
            <div style={statBox}>
              <p style={statLabel}>Con speaks</p>
              <p style={statValue}>{ballot.con_speaks}</p>
            </div>
          </div>
          {ballot.reasoning && (
            <div>
              <p style={{ fontSize: 12, fontWeight: 500, color: "#6b6760", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Reasoning</p>
              <p style={{ fontSize: 14, margin: 0, lineHeight: 1.6 }}>{ballot.reasoning}</p>
            </div>
          )}
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

const statBox = {
  background: "#f9f7f4",
  borderRadius: 8,
  padding: "10px 12px",
} as const;

const sectionLabel = {
  fontSize: 11,
  fontWeight: 500 as const,
  color: "#6b6760",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  margin: "0 0 10px",
};

const statLabel = {
  fontSize: 11,
  fontWeight: 500,
  color: "#6b6760",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  margin: "0 0 4px",
};

const statValue = {
  fontSize: 20,
  fontWeight: 500,
  margin: 0,
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

const secondaryBtn = {
  width: "100%",
  height: 44,
  background: "transparent",
  color: "#1a1814",
  border: "1px solid #e5e2dc",
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