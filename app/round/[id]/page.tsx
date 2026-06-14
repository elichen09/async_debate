"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AudioPlayer from "@/app/components/AudioPlayer";
import type { CSSProperties } from "react";

const PRO_FIRST_ORDER = [
  { label: "Pro Constructive", role: "pro" },
  { label: "Con Constructive", role: "con" },
  { label: "Pro Rebuttal",     role: "pro" },
  { label: "Con Rebuttal",     role: "con" },
  { label: "Pro Summary",      role: "pro" },
  { label: "Con Summary",      role: "con" },
  { label: "Pro Final Focus",  role: "pro" },
  { label: "Con Final Focus",  role: "con" },
];
const CON_FIRST_ORDER = [
  { label: "Con Constructive", role: "con" },
  { label: "Pro Constructive", role: "pro" },
  { label: "Con Rebuttal",     role: "con" },
  { label: "Pro Rebuttal",     role: "pro" },
  { label: "Con Summary",      role: "con" },
  { label: "Pro Summary",      role: "pro" },
  { label: "Con Final Focus",  role: "con" },
  { label: "Pro Final Focus",  role: "pro" },
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
  con_goes_first: boolean;
  current_speech: number;
  is_ranked: boolean;
  pro: { username: string; display_name: string };
  con: { username: string; display_name: string };
}

interface Ballot {
  id: string;
  winner_id: string;
  pro_speaks: number;
  con_speaks: number;
  reasoning: string;
  submitted_at: string;
  judge_id: string;
}

export default function RoundPage() {
  const router = useRouter();
  const { id } = useParams();
  const [round, setRound] = useState<Round | null>(null);
  const [speeches, setSpeeches] = useState<Speech[]>([]);
  const [userId, setUserId] = useState("");
  const [myRole, setMyRole] = useState<"pro" | "con">("pro");
  const [isParticipant, setIsParticipant] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [ballot, setBallot] = useState<Ballot | null>(null);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioPreview, setAudioPreview] = useState<string | null>(null);
  const [speechesDeleted, setSpeechesDeleted] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [showReportForm, setShowReportForm] = useState(false);
  const [loading, setLoading] = useState(true);
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
        .select(`id, topic, status, pro_id, con_id, con_goes_first, current_speech, is_ranked,
          pro:profiles!pro_id(username, display_name),
          con:profiles!con_id(username, display_name)`)
        .eq("id", id)
        .single();

      if (!roundData) { router.push("/dashboard"); return; }
      setRound(roundData as unknown as Round);
      const participant = roundData.pro_id === uid || roundData.con_id === uid;
      setIsParticipant(participant);
      setMyRole(roundData.pro_id === uid ? "pro" : "con");

      const { data: speechData } = await supabase
        .from("speeches")
        .select("position, speech_number, storage_path, submitted_at")
        .eq("round_id", id)
        .order("speech_number", { ascending: true });
      setSpeeches(speechData || []);

      const urls: Record<string, string> = {};
      for (const s of speechData || []) {
        const { data } = await supabase.storage.from("speeches").createSignedUrl(s.storage_path, 3600);
        if (data) urls[s.position] = data.signedUrl;
        else {
          const { data: pubData } = supabase.storage.from("speeches").getPublicUrl(s.storage_path);
          if (pubData) urls[s.position] = pubData.publicUrl;
        }
      }
      setAudioUrls(urls);

      const { data: ballotData } = await supabase
        .from("ballots")
        .select("id, winner_id, pro_speaks, con_speaks, reasoning, submitted_at, judge_id")
        .eq("round_id", id).single();
      if (ballotData) setBallot(ballotData as Ballot);

      if (ballotData) {
        const { data: reportData } = await supabase
          .from("reports").select("id")
          .eq("ballot_id", ballotData.id).eq("reporter_id", uid).single();
        if (reportData) setReported(true);
      }
      setLoading(false);
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

  function stopRecording() { mediaRecorder?.stop(); setRecording(false); }

  async function deleteSpeeches(currentPath: string) {
    const paths = [...speeches.map(s => s.storage_path), currentPath];
    await supabase.storage.from("speeches").remove(paths);
    await supabase.from("speeches").delete().eq("round_id", id);
    setSpeechesDeleted(true);
  }

  async function handleUploadBlob(blob: Blob) {
    if (!round) return;
    setError(""); setUploading(true);
    const speechOrder = round.con_goes_first ? CON_FIRST_ORDER : PRO_FIRST_ORDER;
    const position = speechOrder[round.current_speech - 1].label.toLowerCase().replace(/ /g, "_");
    const path = `${round.id}/${position}_${Date.now()}.webm`;
    const { error: uploadError } = await supabase.storage.from("speeches").upload(path, blob, { contentType: "audio/webm" });
    if (uploadError) { setError(uploadError.message); setUploading(false); return; }
    const { error: insertError } = await supabase.from("speeches").insert({ round_id: round.id, speaker_id: userId, position, speech_number: round.current_speech, storage_path: path });
    if (insertError) { setError(insertError.message); setUploading(false); return; }
    const nextSpeech = round.current_speech + 1;
    const newStatus = nextSpeech > 8 ? (round.is_ranked ? "judging" : "complete") : "active";
    await supabase.from("rounds").update({ current_speech: nextSpeech, status: newStatus }).eq("id", round.id);
    if (!round.is_ranked && newStatus === "complete") await deleteSpeeches(path);
    setUploading(false);
    if (round.is_ranked || newStatus !== "complete") window.location.reload();
  }

  async function handleUpload(file: File) {
    if (!round) return;
    setError(""); setUploading(true);
    const speechOrder = round.con_goes_first ? CON_FIRST_ORDER : PRO_FIRST_ORDER;
    const position = speechOrder[round.current_speech - 1].label.toLowerCase().replace(/ /g, "_");
    const path = `${round.id}/${position}_${Date.now()}.mp3`;
    const { error: uploadError } = await supabase.storage.from("speeches").upload(path, file, { contentType: "audio/mpeg" });
    if (uploadError) { setError(uploadError.message); setUploading(false); return; }
    const { error: insertError } = await supabase.from("speeches").insert({ round_id: round.id, speaker_id: userId, position, speech_number: round.current_speech, storage_path: path });
    if (insertError) { setError(insertError.message); setUploading(false); return; }
    const nextSpeech = round.current_speech + 1;
    const newStatus = nextSpeech > 8 ? (round.is_ranked ? "judging" : "complete") : "active";
    await supabase.from("rounds").update({ current_speech: nextSpeech, status: newStatus }).eq("id", round.id);
    if (!round.is_ranked && newStatus === "complete") await deleteSpeeches(path);
    setUploading(false);
    if (round.is_ranked || newStatus !== "complete") window.location.reload();
  }

  async function handleReport() {
    if (!ballot || !round) return;
    setReporting(true);
    const { error } = await supabase.from("reports").insert({ ballot_id: ballot.id, round_id: round.id, reporter_id: userId, judge_id: ballot.judge_id, reason: reportReason });
    setReporting(false);
    if (error) { setError(error.message); return; }
    setReported(true); setShowReportForm(false);
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100dvh - 44px)" }}>
      <div className="db-card" style={{ padding: "28px 40px", textAlign: "center" }}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 11, letterSpacing: "0.1em", color: "var(--muted)", margin: "0 0 14px", textTransform: "uppercase" }}>debate.fish</p>
        <div className="gh-loading-dots"><span /><span /><span /></div>
      </div>
    </div>
  );

  if (!round) return null;

  const SPEECH_ORDER = round.con_goes_first ? CON_FIRST_ORDER : PRO_FIRST_ORDER;
  const currentSpeech = SPEECH_ORDER[round.current_speech - 1];
  const isMyTurn = currentSpeech?.role === myRole && round.status === "active" && isParticipant;
  const opponent = myRole === "pro" ? round.con : round.pro;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 clamp(24px, 5vw, 48px) 100px" }}>

      {/* Back */}
      <div style={{ paddingTop: "clamp(20px, 4vh, 36px)", display: "flex", alignItems: "center", gap: 14 }}>
        <button onClick={() => router.push("/dashboard")} style={backBtn}>← Back</button>
        {!round.is_ranked && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", color: "rgba(255,255,255,0.40)" }}>
            Unranked
          </span>
        )}
        {!isParticipant && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", color: "rgba(255,255,255,0.40)" }}>
            Spectating
          </span>
        )}
      </div>

      {/* Hero — topic as heading */}
      <section style={{ paddingTop: "clamp(16px, 3vh, 28px)" }}>
        <p style={eyebrow}>Topic</p>
        <h1 className="ab-hero-line" style={{ '--i': '0', fontFamily: "var(--font-display)", fontSize: "clamp(28px, 5.5vw, 52px)", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", margin: "0 0 14px", lineHeight: 1.05, textShadow: "0 2px 20px rgba(0,0,0,0.45), 0 8px 40px rgba(0,0,0,0.22)", textWrap: "balance" } as CSSProperties}>
          {round.topic}
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", margin: "0 0 10px", textShadow: "0 1px 5px rgba(0,0,0,0.35)" }}>
          {isParticipant
            ? `vs @${opponent?.username} · You are ${myRole === "pro" ? "Pro" : "Con"}`
            : `@${round.pro?.username} (Pro) vs @${round.con?.username} (Con)`}
        </p>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em", color: round.status === "complete" ? "var(--accent)" : round.status === "judging" ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.55)" }}>
            {round.status === "judging" ? "Awaiting judge" : round.status === "complete" ? "Complete" : `Speech ${round.current_speech} of 8`}
          </span>
          {isMyTurn && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em", color: "var(--accent)", textShadow: "0 1px 4px rgba(0,0,0,0.30)" }}>
              Your turn →
            </span>
          )}
        </div>
      </section>

      <div style={rule}><div style={ruleDot} /><div style={ruleLine} /></div>

      {/* Speech list */}
      <section>
        <p style={eyebrow}>Speeches</p>
        {SPEECH_ORDER.map((s, i) => {
          const speechNum = i + 1;
          const position = s.label.toLowerCase().replace(/ /g, "_");
          const submitted = speeches.find(sp => sp.speech_number === speechNum);
          const isCurrent = speechNum === round.current_speech && round.status === "active";
          const isPast = submitted !== undefined;
          const isFuture = speechNum > round.current_speech && !submitted;

          return (
            <div
              key={i}
              style={{
                padding: "16px 0",
                borderBottom: "1px solid rgba(255,255,255,0.07)",
                opacity: isFuture ? 0.30 : 1,
                transition: "opacity 0.2s",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                {/* Number / check */}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: isPast ? "var(--accent)" : isCurrent ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.28)", lineHeight: "22px", minWidth: 20, letterSpacing: "0.06em", flexShrink: 0 }}>
                  {isPast ? "✓" : String(speechNum).padStart(2, "0")}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: isCurrent ? 600 : 400, color: isCurrent ? "#fff" : isPast ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.50)", textShadow: isCurrent ? "0 1px 8px rgba(0,0,0,0.38)" : "none" }}>
                    {s.label}
                  </p>
                  {submitted && (
                    <p style={{ margin: "2px 0 0", fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(255,255,255,0.30)", letterSpacing: "0.04em" }}>
                      {new Date(submitted.submitted_at).toLocaleDateString()}
                    </p>
                  )}
                  {audioUrls[position] && (
                    <div style={{ marginTop: 10 }}>
                      <AudioPlayer src={audioUrls[position]} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <div style={rule}><div style={{ ...ruleDot, background: "rgba(255,255,255,0.20)" }} /><div style={ruleLine} /></div>

      {/* Submit speech */}
      {isMyTurn && isParticipant && (
        <section style={{ marginBottom: 32 }}>
          <p style={eyebrow}>Submit — {currentSpeech?.label}</p>

          {error && (
            <p style={{ fontSize: 13, color: "oklch(0.70 0.20 28)", margin: "0 0 16px", textShadow: "0 1px 4px rgba(0,0,0,0.40)" }}>
              ⚑ {error}
            </p>
          )}

          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", margin: "0 0 14px" }}>Record directly</p>

          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            {!recording
              ? <button onClick={startRecording} className="db-btn db-btn--glass db-btn--block">🎙 Start recording</button>
              : <button onClick={stopRecording} className="db-btn db-btn--block" style={{ borderColor: "rgba(220,80,80,0.45)", color: "rgba(255,160,160,0.90)", background: "rgba(200,60,60,0.12)" }}>⏹ Stop recording</button>
            }
          </div>

          {recording && (
            <div style={{ fontSize: 13, color: "oklch(0.65 0.22 28)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <span className="gh-rec-dot" /> Recording…
            </div>
          )}

          {audioPreview && !recording && (
            <div style={{ marginBottom: 14 }}>
              <audio controls src={audioPreview} style={{ width: "100%", marginBottom: 10, borderRadius: 8 }} />
              <button onClick={() => handleUploadBlob(audioBlob!)} disabled={uploading} className="db-btn db-btn--accent db-btn--block">
                {uploading ? "Uploading…" : "Submit recording"}
              </button>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0" }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.12)" }} />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "var(--font-mono)" }}>or upload a file</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.12)" }} />
          </div>

          <input ref={fileRef} type="file" accept="audio/mp3,audio/mpeg,audio/*" style={{ display: "none" }}
            onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="db-btn db-btn--glass db-btn--block">
            {uploading ? "Uploading…" : "Upload MP3"}
          </button>
        </section>
      )}

      {/* Status messages */}
      {!isMyTurn && round.status === "active" && isParticipant && (
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", textShadow: "0 1px 5px rgba(0,0,0,0.35)", marginBottom: 20 }}>
          Waiting for opponent to submit their speech…
        </p>
      )}
      {!isParticipant && round.status === "active" && (
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", textShadow: "0 1px 5px rgba(0,0,0,0.35)", marginBottom: 20 }}>
          You are watching this round as a spectator.
        </p>
      )}
      {round.status === "judging" && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: "clamp(20px, 3.5vw, 28px)", color: "var(--accent)", margin: "0 0 6px", textShadow: "0 2px 14px rgba(0,0,0,0.40)" }}>
            All speeches submitted.
          </p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: 0, textShadow: "0 1px 5px rgba(0,0,0,0.35)" }}>
            This round is awaiting a judge.
          </p>
        </div>
      )}
      {(speechesDeleted || (round.status === "complete" && !round.is_ranked)) && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: "clamp(20px, 3.5vw, 28px)", color: "var(--accent)", margin: "0 0 6px", textShadow: "0 2px 14px rgba(0,0,0,0.40)" }}>
            Unranked round complete.
          </p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: 0, textShadow: "0 1px 5px rgba(0,0,0,0.35)" }}>
            All speeches were automatically deleted.
          </p>
        </div>
      )}

      {/* Ballot */}
      {ballot && round.status === "complete" && round.is_ranked && (
        <section>
          <p style={eyebrow}>Judge's decision</p>

          <div className={`gh-verdict ${ballot.winner_id === userId ? "gh-verdict--win" : "gh-verdict--loss"}`}>
            {isParticipant && ballot.winner_id === userId && (
              <span className="gh-verdict__burst" aria-hidden="true">
                {Array.from({ length: 14 }).map((_, i) => (
                  <i key={i} style={{ "--a": `${(360 / 14) * i}deg`, "--d": `${56 + (i % 4) * 22}px`, "--t": `${0.45 + (i % 5) * 0.12}s` } as CSSProperties} />
                ))}
              </span>
            )}
            <p className="gh-verdict__text">
              {!isParticipant
                ? `${ballot.winner_id === round.pro_id ? "Pro" : "Con"} won.`
                : ballot.winner_id === userId ? "You won." : "You lost."}
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 clamp(24px, 5vw, 56px)", marginBottom: 28 }}>
            {[{ label: "Pro speaks", value: ballot.pro_speaks }, { label: "Con speaks", value: ballot.con_speaks }].map(s => (
              <div key={s.label}>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.40)", margin: "0 0 6px" }}>{s.label}</p>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "clamp(28px, 6vw, 48px)", fontWeight: 700, color: "#fff", margin: 0, textShadow: "0 2px 14px rgba(0,0,0,0.40)" }}>{s.value}</p>
              </div>
            ))}
          </div>

          {ballot.reasoning && (
            <div style={{ marginBottom: 28 }}>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.40)", margin: "0 0 12px" }}>Reasoning</p>
              <p style={{ fontSize: 14, lineHeight: 1.75, color: "rgba(255,255,255,0.65)", margin: 0, textShadow: "0 1px 5px rgba(0,0,0,0.35)" }}>{ballot.reasoning}</p>
            </div>
          )}

          {isParticipant && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.10)", paddingTop: 20 }}>
              {reported ? (
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", margin: 0 }}>✓ Ballot reported — under review</p>
              ) : showReportForm ? (
                <div>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", margin: "0 0 10px" }}>Why are you reporting this ballot?</p>
                  <textarea
                    className="lp-textarea"
                    value={reportReason}
                    onChange={e => setReportReason(e.target.value)}
                    placeholder="Explain why this ballot is faulty…"
                    rows={3}
                    style={{ marginBottom: 10 }}
                  />
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={handleReport} disabled={reporting} className="db-btn db-btn--danger" style={{ flex: 1, height: 38, fontSize: 13 }}>
                      {reporting ? "Submitting…" : "Submit report"}
                    </button>
                    <button onClick={() => setShowReportForm(false)} className="db-btn db-btn--glass" style={{ flex: 1, height: 38, fontSize: 13 }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowReportForm(true)} className="db-btn db-btn--glass db-btn--sm" style={{ fontSize: 12 }}>
                  ⚑ Report this ballot
                </button>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

const backBtn: CSSProperties = { background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 13, color: "rgba(255,255,255,0.65)", padding: "8px 0", textShadow: "0 1px 4px rgba(0,0,0,0.35)" };
const eyebrow: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)", margin: "0 0 12px", textShadow: "0 1px 4px rgba(0,0,0,0.30)" };
const rule: CSSProperties = { display: "flex", alignItems: "center", gap: 12, margin: "clamp(28px, 5vh, 44px) 0" };
const ruleDot: CSSProperties = { width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 };
const ruleLine: CSSProperties = { flex: 1, height: 1, background: "rgba(255,255,255,0.15)" };
