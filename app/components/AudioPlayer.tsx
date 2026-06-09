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
    const onEnd  = () => setPlaying(false);
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
    else          { audio.play();  setPlaying(true);  }
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
    return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
  }

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div style={{
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: 10,
      padding: "12px 14px",
      backdropFilter: "blur(8px)",
    }}>
      <audio ref={audioRef} src={src} preload="metadata" />

      {label && (
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.38)", margin: "0 0 10px" }}>
          {label}
        </p>
      )}

      {/* Progress bar */}
      <div
        ref={barRef}
        onClick={seek}
        style={{
          height: 3,
          background: "rgba(255,255,255,0.12)",
          borderRadius: 2,
          cursor: "pointer",
          marginBottom: 12,
          position: "relative",
          overflow: "visible",
        }}
      >
        <div style={{
          height: "100%",
          width: `${progress}%`,
          background: "var(--accent)",
          borderRadius: 2,
          transition: dragging ? "none" : "width 0.1s linear",
          position: "relative",
        }}>
          <div style={{
            position: "absolute",
            right: -5,
            top: "50%",
            transform: "translateY(-50%)",
            width: 11,
            height: 11,
            borderRadius: "50%",
            background: "var(--accent)",
            boxShadow: "0 0 0 2px rgba(255,255,255,0.20)",
          }} />
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>

        {/* Play / pause */}
        <button
          onClick={togglePlay}
          style={{
            width: 32, height: 32, borderRadius: "50%",
            background: playing ? "rgba(255,255,255,0.15)" : "var(--accent)",
            border: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", flexShrink: 0,
            fontSize: 11, color: "#fff",
            transition: "background 0.15s",
          }}
        >
          {playing ? "⏸" : "▶"}
        </button>

        {/* Time */}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,255,255,0.40)", fontVariantNumeric: "tabular-nums", flexShrink: 0, letterSpacing: "0.04em" }}>
          {fmt(currentTime)}<span style={{ opacity: 0.5, margin: "0 3px" }}>/</span>{fmt(duration)}
        </span>

        <div style={{ flex: 1 }} />

        {/* Speed */}
        <div style={{ display: "flex", gap: 4 }}>
          {[1, 1.5, 2].map(s => (
            <button
              key={s}
              onClick={() => setSpeedValue(s)}
              style={{
                height: 22, padding: "0 7px",
                background: speed === s ? "var(--accent)" : "transparent",
                border: `1px solid ${speed === s ? "var(--accent)" : "rgba(255,255,255,0.16)"}`,
                borderRadius: 4,
                fontSize: 10,
                color: speed === s ? "#fff" : "rgba(255,255,255,0.40)",
                cursor: "pointer",
                fontWeight: speed === s ? 600 : 400,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.04em",
                transition: "background 0.14s, color 0.14s, border-color 0.14s",
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
