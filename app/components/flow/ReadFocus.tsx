"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Pause, Play, X, Minus, Plus, SkipBack, SkipForward } from "lucide-react";
import type { Settings } from "@/lib/readEstimate";

// One token of the read doc, tagged so it advances at the right calibrated rate:
// tags/cites read at tagWpm, card body at cardWpm.
export type FocusWord = { text: string; kind: "tag" | "body" };

// Optimal Recognition Point: the letter the eye fixates. Classic Spritz pivot.
function orpIndex(w: string): number {
  const L = w.length;
  if (L <= 1) return 0;
  if (L <= 5) return 1;
  if (L <= 9) return 2;
  if (L <= 13) return 3;
  return 4;
}

// How long to hold a word: its kind's calibrated WPM, lengthened a little for long
// words and for end-of-clause / end-of-sentence punctuation so it reads naturally.
function wordMs(w: FocusWord, s: Settings, mult: number): number {
  const wpm = (w.kind === "tag" ? s.tagWpm : s.cardWpm) * mult;
  let ms = wpm > 0 ? 60000 / wpm : 320;
  const t = w.text;
  if (t.length > 9) ms *= 1.2;
  else if (t.length <= 2) ms *= 0.85;
  if (/[.!?]["'”’)\]]?$/.test(t)) ms *= 1.7;
  else if (/[,;:—]$/.test(t)) ms *= 1.35;
  return ms;
}

const WINDOW = 4; // context words shown above / below the focus word

// Full-screen "focus reader": streams the read doc one word at a time, the eye
// parked on a fixed center line with the fixation letter accented, at the pace the
// read-speed calibration set. Light + monochrome to match the workspace.
export default function ReadFocus({ words, settings, onClose }: {
  words: FocusWord[];
  settings: Settings;
  onClose: () => void;
}) {
  const total = words.length;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [mult, setMult] = useState(1);

  // Auto-advance at the calibrated pace; stop at the end.
  useEffect(() => {
    if (!playing || idx >= total - 1) { if (idx >= total - 1) setPlaying(false); return; }
    const t = setTimeout(() => setIdx((i) => Math.min(total - 1, i + 1)), wordMs(words[idx], settings, mult));
    return () => clearTimeout(t);
  }, [playing, idx, mult, words, settings, total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setPlaying(false); setIdx((i) => Math.min(total - 1, i + 1)); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setPlaying(false); setIdx((i) => Math.max(0, i - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setMult((m) => Math.min(2.5, +(m + 0.1).toFixed(2))); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setMult((m) => Math.max(0.4, +(m - 0.1).toFixed(2))); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, total]);

  if (typeof document === "undefined") return null;

  if (!total) {
    return createPortal(
      <div className="rdr" role="dialog" aria-modal="true" aria-label="Focus reader">
        <button className="rdr__close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <p className="rdr__empty">Nothing to read yet — highlight text in the Send doc first.</p>
      </div>,
      document.body,
    );
  }

  const baseWpm = Math.round((words[idx].kind === "tag" ? settings.tagWpm : settings.cardWpm) * mult);

  const lines = [];
  for (let j = idx - WINDOW; j <= idx + WINDOW; j++) {
    const w = words[j];
    if (!w) { lines.push(<div key={j} className="rdr__line" aria-hidden />); continue; }
    const dist = Math.abs(j - idx);
    const oi = orpIndex(w.text);
    lines.push(
      <div key={j} className={`rdr__line ${j === idx ? "is-focus" : ""}`} style={{ opacity: Math.max(0.12, 1 - dist * 0.2) }}>
        <span className="rdr__pre">{w.text.slice(0, oi)}</span>
        <span className="rdr__orp">{w.text[oi]}</span>
        <span className="rdr__post">{w.text.slice(oi + 1)}</span>
      </div>,
    );
  }

  return createPortal(
    <div className="rdr" role="dialog" aria-modal="true" aria-label="Focus reader">
      <div className="rdr__status">[ {playing ? "reading" : "paused"} ]</div>
      <button className="rdr__close" onClick={onClose} aria-label="Close focus reader" title="Close (Esc)"><X size={18} /></button>

      <div className="rdr__stage" onClick={() => setPlaying((p) => !p)} title="Click or press Space to play / pause">
        <span className="rdr__guide" aria-hidden />
        <div className="rdr__col">{lines}</div>
      </div>

      <div className="rdr__bar">
        <button className="rdr__btn" onClick={() => { setPlaying(false); setIdx((i) => Math.max(0, i - 1)); }} title="Previous word (←)" aria-label="Previous word"><SkipBack size={15} /></button>
        <button className="rdr__btn rdr__btn--play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"} title="Play / pause (Space)">{playing ? <Pause size={16} /> : <Play size={16} />}</button>
        <button className="rdr__btn" onClick={() => { setPlaying(false); setIdx((i) => Math.min(total - 1, i + 1)); }} title="Next word (→)" aria-label="Next word"><SkipForward size={15} /></button>
        <div className="rdr__speed">
          <button className="rdr__btn" onClick={() => setMult((m) => Math.max(0.4, +(m - 0.1).toFixed(2)))} title="Slower (↓)" aria-label="Slower"><Minus size={14} /></button>
          <span className="rdr__wpm">{baseWpm} <i>wpm</i></span>
          <button className="rdr__btn" onClick={() => setMult((m) => Math.min(2.5, +(m + 0.1).toFixed(2)))} title="Faster (↑)" aria-label="Faster"><Plus size={14} /></button>
        </div>
        <div className="rdr__prog"><span style={{ width: `${(idx / Math.max(1, total - 1)) * 100}%` }} /></div>
        <span className="rdr__count">{idx + 1} / {total}</span>
      </div>
    </div>,
    document.body,
  );
}
