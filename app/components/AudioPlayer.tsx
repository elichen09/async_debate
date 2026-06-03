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
      background: "rgba(255,255,255,0.03)",
      border: "0.5px solid rgba(255,255,255,0.08)",
      borderRadius: 10, padding: "12px 14px",
    }}>
      <audio ref={audioRef} src={src} preload="metadata" />

      {label && (
        <p style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#4a5580", margin: "0 0 10px" }}>
          {label}
        </p>
      )}

      {/* Progress bar */}
      <div
        ref={barRef}
        onClick={seek}
        style={{
          height: 6, background: "rgba(255,255,255,0.08)",
          borderRadius: 3, cursor: "pointer", marginBottom: 10,
          position: "relative", overflow: "visible",
        }}
      >
        <div style={{
          height: "100%", width: `${progress}%`,
          background: "#7aa0d4", borderRadius: 3,
          transition: dragging ? "none" : "width 0.1s linear",
          position: "relative",
        }}>
          {/* scrubber handle */}
          <div style={{
            position: "absolute", right: -5, top: "50%",
            transform: "translateY(-50%)",
            width: 12, height: 12, borderRadius: "50%",
            background: "#7aa0d4",
            boxShadow: "0 0 0 2px rgba(122,160,212,0.3)",
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
            background: "#7aa0d4", border: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", flexShrink: 0,
            fontSize: 12, color: "#fff",
          }}
        >
          {playing ? "⏸" : "▶"}
        </button>

        {/* Time */}
        <span style={{ fontSize: 11, color: "#4a5580", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
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
                background: speed === s ? "#7aa0d4" : "rgba(255,255,255,0.04)",
                border: `0.5px solid ${speed === s ? "#7aa0d4" : "rgba(255,255,255,0.1)"}`,
                borderRadius: 5, fontSize: 11,
                color: speed === s ? "#fff" : "#4a5580",
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