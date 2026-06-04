"use client";

import { useEffect, useRef, useState } from "react";





interface AudioPlayerProps {
  src: string;
  label?: string;
}

export default function AudioPlayer({ src, label }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [dragging, setDragging] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => { if (!dragging) setCurrentTime(audio.currentTime); };
    const onLoad = () => setDuration(audio.duration);
    const onEnd = () => setPlaying(false);

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoad);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoad);
      audio.removeEventListener("ended", onEnd);
    };
  }, [dragging]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play(); setPlaying(true); }
  }

  function setSpeedValue(s: number) {
    setSpeed(s);
    if (audioRef.current) audioRef.current.playbackRate = s;
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const bar = barRef.current;
    const audio = audioRef.current;
    if (!bar || !audio || !duration) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * duration;
    setCurrentTime(pct * duration);
  }

  function fmt(s: number) {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div style={{
      background: "var(--card)",
      border: "0.5px solid var(--line)",
      borderRadius: 10, padding: "12px 14px",
    }}>
      <audio ref={audioRef} src={src} preload="metadata" />

      {label && (
        <p style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", margin: "0 0 10px" }}>
          {label}
        </p>
      )}

      {/* Progress bar */}
      <div
        ref={barRef}
        onClick={seek}
        style={{
          height: 6, background: "var(--line)",
          borderRadius: 3, cursor: "pointer", marginBottom: 10,
          position: "relative", overflow: "visible",
        }}
      >
        <div style={{
          height: "100%", width: `${progress}%`,
          background: "var(--pro)", borderRadius: 3,
          transition: dragging ? "none" : "width 0.1s linear",
          position: "relative",
        }}>
          {/* scrubber handle */}
          <div style={{
            position: "absolute", right: -5, top: "50%",
            transform: "translateY(-50%)",
            width: 12, height: 12, borderRadius: "50%",
            background: "var(--pro)",
            boxShadow: "0 0 0 2px color-mix(in srgb, var(--pro) 30%, transparent)",
          }} />
        </div>
      </div>

      {/* Controls row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>

        {/* Play/pause */}
        <button
          onClick={togglePlay}
          style={{
            width: 34, height: 34, borderRadius: "50%",
            background: "var(--pro)", border: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", flexShrink: 0,
            fontSize: 12, color: "#fff",
          }}
        >
          {playing ? "⏸" : "▶"}
        </button>

        {/* Time */}
        <span style={{ fontSize: 11, color: "var(--muted)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
          {fmt(currentTime)} / {fmt(duration)}
        </span>

        <div style={{ flex: 1 }} />

        {/* Speed buttons */}
        <div style={{ display: "flex", gap: 4 }}>
          {[1, 1.5, 2].map(s => (
            <button
              key={s}
              onClick={() => setSpeedValue(s)}
              style={{
                height: 24, padding: "0 8px",
                background: speed === s ? "var(--pro)" : "var(--card)",
                border: `0.5px solid ${speed === s ? "var(--pro)" : "var(--line-strong)"}`,
                borderRadius: 5, fontSize: 11,
                color: speed === s ? "#fff" : "var(--muted)",
                cursor: "pointer", fontWeight: speed === s ? 600 : 400,
              }}
            >
              {s}x
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}