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
  is_ranked: boolean;
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
  const [speechesDeleted, setSpeechesDeleted] = useState(false);
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
          id, topic, status, pro_id, con_id, current_speech, is_ranked,
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
        else {
          const { data: pubData } = supabase.storage
            .from("speeches")
            .getPublicUrl(s.storage_path);
          if (pubData) urls[s.position] = pubData.publicUrl;
        }
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
    } catch {
      setError("Microphone access denied. Please allow microphone access or upload an MP3.");
    }
  }

  function stopRecording() {
    mediaRecorder?.stop();
    setRecording(false);
  }

  async function deleteSpeeches(currentPath: string) {
    const paths = [...speeches.map(s => s.storage_path), currentPath];
    await supabase.storage.from("speeches").remove(paths);
    await supabase.from("speeches").delete().eq("round_id", id);
    setSpeechesDeleted(true);
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
      round_id: round.id, speaker_id: userId,
      position, speech_number: round.current_speech, storage_path: path,
    });
    if (insertError) { setError(insertError.message); setUploading(false); return; }

    const nextSpeech = round.current_speech + 1;
    const newStatus = nextSpeech > 8
      ? (round.is_ranked ? "judging" : "complete")
      : "active";

    await supabase.from("rounds").update({
      current_speech: nextSpeech, status: newStatus,
    }).eq("id", round.id);

    if (!round.is_ranked && newStatus === "complete") {
      await deleteSpeeches(path);
    }

    setUploading(false);
    if (round.is_ranked || newStatus !== "complete") window.location.reload();
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
      round_id: round.id, speaker_id: userId,
      position, speech_number: round.current_speech, storage_path: path,
    });
    if (insertError) { setError(insertError.message); setUploading(false); return; }

    const nextSpeech = round.current_speech + 1;
    const newStatus = nextSpeech > 8
      ? (round.is_ranked ? "judging" : "complete")
      : "active";

    await supabase.from("rounds").update({
      current_speech: nextSpeech, status: newStatus,
    }).eq("id", round.id);

    if (!round.is_ranked && newStatus === "complete") {
      await deleteSpeeches(path);
    }

    setUploading(false);
    if (round.is_ranked || newStatus !== "complete") window.location.reload();
  }

  if (!round) return <p style={{ textAlign: "center", marginTop: "4rem", color: "#4a5580" }}>Loading...</p>;

  const currentIndex = round.current_speech - 1;
  const currentSpeech = SPEECH_ORDER[currentIndex];
  const isMyTurn = currentSpeech?.role === myRole && round.status === "active";
  const opponent = myRole === "pro" ? round.con : round.pro;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 20px 80px" }}>

      {/* Back + title */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "24px 0 20px" }}>
        <button onClick={() => router.push("/dashboard")} style={ghostBtn}>← Back</button>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 580, color: "#fff", margin: 0 }}>Round</h1>
        {!round.is_ranked && (
          <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: "rgba(255,255,255,0.06)", color: "#4a5580", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Unranked
          </span>
        )}
      </div>

      {/* Round info card */}
      <div style={card}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 140, height: 140, borderRadius: "50%", background: "radial-gradient(circle, rgba(240,208,112,0.08), transparent 70%)", pointerEvents: "none" }} />
        <p style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#4a5580", margin: "0 0 6px", position: "relative", zIndex: 1 }}>topic</p>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "#fff", margin: "0 0 6px", position: "relative", zIndex: 1 }}>{round.topic}</h2>
        <p style={{ fontSize: 13, color: "#4a5580", margin: "0 0 14px", position: "relative", zIndex: 1 }}>
          vs @{opponent?.username} · You are {myRole === "pro" ? "Pro" : "Con"}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", position: "relative", zIndex: 1 }}>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20,
            background: round.status === "judging" ? "rgba(240,208,112,0.1)" : round.status === "complete" ? "rgba(77,223,196,0.1)" : "rgba(255,255,255,0.06)",
            color: round.status === "judging" ? "#f0d070" : round.status === "complete" ? "#4ddfc4" : "#8a9abf",
          }}>
            {round.status === "judging" ? "⏳ Awaiting judge" : round.status === "complete" ? "✓ Complete" : `Speech ${round.current_speech} of 8`}
          </span>
          {isMyTurn && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: "#f0d070", color: "#0a0f1e" }}>
              Your turn
            </span>
          )}
        </div>
      </div>

      {/* Speech list */}
      <div style={{ marginBottom: 20 }}>
        <p style={sectionLabel}>Speeches</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {SPEECH_ORDER.map((s, i) => {
            const speechNum = i + 1;
            const position = s.label.toLowerCase().replace(/ /g, "_");
            const submitted = speeches.find(sp => sp.speech_number === speechNum);
            const isCurrent = speechNum === round.current_speech;
            const isPast = speechNum < round.current_speech;
            const isFuture = speechNum > round.current_speech;

            return (
              <div key={i} style={{
                background: "rgba(255,255,255,0.03)",
                border: `0.5px solid ${isCurrent ? "rgba(240,208,112,0.4)" : "rgba(255,255,255,0.07)"}`,
                borderRadius: 10, padding: "11px 14px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                opacity: isFuture ? 0.35 : 1,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                    background: isPast ? "#f0d070" : isCurrent ? "rgba(240,208,112,0.1)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${isPast ? "#f0d070" : isCurrent ? "rgba(240,208,112,0.4)" : "rgba(255,255,255,0.1)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 600,
                    color: isPast ? "#0a0f1e" : isCurrent ? "#f0d070" : "#4a5580",
                  }}>
                    {isPast ? "✓" : speechNum}
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: isCurrent ? 500 : 400, color: isCurrent ? "#fff" : "#8a9abf" }}>{s.label}</p>
                    {submitted && (
                      <p style={{ margin: 0, fontSize: 11, color: "#4a5580" }}>
                        {new Date(submitted.submitted_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                {audioUrls[position] && (
                  <audio controls src={audioUrls[position]} style={{ height: 28, width: 150 }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Upload section */}
      {isMyTurn && (
        <div style={{ ...card, borderColor: "rgba(240,208,112,0.35)" }}>
          <p style={sectionLabel}>Submit — {currentSpeech?.label}</p>

          {error && (
            <div style={{ background: "rgba(255,107,107,0.1)", border: "0.5px solid rgba(255,107,107,0.3)", color: "#ff6b6b", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
              {error}
            </div>
          )}

          <p style={{ fontSize: 12, fontWeight: 500, color: "#8a9abf", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Record directly</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {!recording ? (
              <button onClick={startRecording} style={{ ...secondaryBtn, flex: 1 }}>🎙 Start recording</button>
            ) : (
              <button onClick={stopRecording} style={{ ...secondaryBtn, flex: 1, borderColor: "rgba(255,107,107,0.4)", color: "#ff6b6b" }}>⏹ Stop recording</button>
            )}
          </div>

          {recording && (
            <div style={{ fontSize: 13, color: "#ff6b6b", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ff6b6b", display: "inline-block" }} />
              Recording…
            </div>
          )}

          {audioPreview && !recording && (
            <div style={{ marginBottom: 12 }}>
              <audio controls src={audioPreview} style={{ width: "100%", marginBottom: 8 }} />
              <button onClick={() => handleUploadBlob(audioBlob!)} disabled={uploading} style={primaryBtn}>
                {uploading ? "Uploading…" : "Submit recording"}
              </button>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
            <div style={{ flex: 1, height: "0.5px", background: "rgba(255,255,255,0.08)" }} />
            <span style={{ fontSize: 11, color: "#4a5580" }}>or upload a file</span>
            <div style={{ flex: 1, height: "0.5px", background: "rgba(255,255,255,0.08)" }} />
          </div>

          <input ref={fileRef} type="file" accept="audio/mp3,audio/mpeg,audio/*" style={{ display: "none" }}
            onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} style={secondaryBtn}>
            {uploading ? "Uploading…" : "Upload MP3"}
          </button>
        </div>
      )}

      {!isMyTurn && round.status === "active" && (
        <div style={{ ...card, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 14, color: "#4a5580" }}>Waiting for opponent to submit their speech…</p>
        </div>
      )}

      {round.status === "judging" && (
        <div style={{ ...card, textAlign: "center" }}>
          <p style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 16, color: "#f0d070", margin: "0 0 6px" }}>All speeches submitted!</p>
          <p style={{ fontSize: 13, color: "#4a5580", margin: 0 }}>This round is now awaiting a judge.</p>
        </div>
      )}

      {/* Unranked complete — speeches deleted */}
      {(speechesDeleted || (round.status === "complete" && !round.is_ranked)) && (
        <div style={{ ...card, textAlign: "center" }}>
          <p style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: 16, color: "#4ddfc4", margin: "0 0 6px" }}>
            Unranked round complete
          </p>
          <p style={{ fontSize: 13, color: "#4a5580", margin: 0 }}>
            All speeches have been automatically deleted since this was an unranked round.
          </p>
        </div>
      )}

      {/* Ballot */}
      {ballot && round.status === "complete" && round.is_ranked && (
        <div style={{ ...card, borderColor: ballot.winner_id === userId ? "rgba(77,223,196,0.3)" : "rgba(255,107,107,0.3)" }}>
          <p style={sectionLabel}>Judge's decision</p>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: "0 0 16px", color: ballot.winner_id === userId ? "#4ddfc4" : "#ff6b6b" }}>
            {ballot.winner_id === userId ? "✓ You won!" : "✗ You lost"}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            {[{ label: "Pro speaks", value: ballot.pro_speaks }, { label: "Con speaks", value: ballot.con_speaks }].map(s => (
              <div key={s.label} style={{ background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "10px 12px" }}>
                <p style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#4a5580", margin: "0 0 4px" }}>{s.label}</p>
                <p style={{ fontSize: 20, fontWeight: 500, color: "#fff", margin: 0 }}>{s.value}</p>
              </div>
            ))}
          </div>
          {ballot.reasoning && (
            <div>
              <p style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#4a5580", margin: "0 0 8px" }}>Reasoning</p>
              <p style={{ fontSize: 14, margin: 0, lineHeight: 1.6, color: "#8a9abf" }}>{ballot.reasoning}</p>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "0.5px solid rgba(255,255,255,0.07)",
  borderRadius: 14, padding: "18px 20px",
  marginBottom: 12, position: "relative", overflow: "hidden",
};

const sectionLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 500, color: "#4a5580",
  textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 12px",
};

const ghostBtn: React.CSSProperties = {
  background: "transparent", border: "0.5px solid rgba(255,255,255,0.1)",
  borderRadius: 8, padding: "8px 14px", fontSize: 14, color: "#4a5580", cursor: "pointer",
};

const primaryBtn: React.CSSProperties = {
  width: "100%", height: 44, background: "#f0d070", color: "#0a0f1e",
  border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  width: "100%", height: 42, background: "transparent", color: "#8a9abf",
  border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 8,
  fontSize: 14, fontWeight: 500, cursor: "pointer",
};