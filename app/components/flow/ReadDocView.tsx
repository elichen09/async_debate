"use client";

import { createElement, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Scissors, BookOpen, Crosshair, Play, Pause, RotateCcw } from "lucide-react";
import { toReadDocHtml } from "@/lib/readDoc";
import { downloadHtmlAsDocx } from "@/lib/sendDocExport";
import ReadTimer from "@/app/components/flow/ReadTimer";
import ReadFocus, { type FocusWord } from "@/app/components/flow/ReadFocus";
import type { TimerSnap } from "@/app/components/flow/FlowTimers";
import {
  type Settings,
  analyze, segmentRead, estimateSeconds, loadSettings, saveSettings, fmt, DEFAULT_SETTINGS,
  loadSpeechSec, saveSpeechSec,
} from "@/lib/readEstimate";

// Calibrated seconds to read one word: its kind's WPM, lengthened a little for
// long words and end-of-clause punctuation (mirrors the focus reader).
function baseWordSec(w: FocusWord, s: Settings): number {
  const wpm = w.kind === "tag" ? s.tagWpm : s.cardWpm;
  let sec = wpm > 0 ? 60 / wpm : 0.4;
  if (w.text.length > 9) sec *= 1.2;
  else if (w.text.length <= 2) sec *= 0.85;
  if (/[.!?]["'”’)\]]?$/.test(w.text)) sec *= 1.7;
  else if (/[,;:—]$/.test(w.text)) sec *= 1.35;
  return sec;
}

// Read-only "read doc" view: the speech-ready version of the Send doc — tags,
// cites (author + date), and highlighted text only. Derived live from the Send
// doc, so it updates as the Send doc changes; large, calm type to read off. Each
// card shows its own estimated read time so you can see what to cut to hit time.
export default function ReadDocView({ sendHtml, timer, onCutCard }: {
  sendHtml: string;
  timer: TimerSnap | null;
  // Double-click a card: "delete" (plan mode) removes it from the Send doc;
  // "red" (normal mode) marks it cut (red) so it drops from the read doc but stays
  // in the Send doc. Either way its flow point is removed. ho = the card's ordinal.
  onCutCard?: (ho: number, mode: "delete" | "red") => void;
}) {
  const read = useMemo(() => toReadDocHtml(sendHtml), [sendHtml]);
  const segs = useMemo(() => segmentRead(read), [read]);
  const analysis = useMemo(() => analyze(read), [read]);
  const empty = !read.trim();

  // Settings live here (not in ReadTimer) so the per-card chips and the total
  // estimate share one source and both update when you calibrate.
  const [settings, setSettings] = useState<Settings | null>(() => loadSettings());
  const eff = settings ?? DEFAULT_SETTINGS;
  const save = (s: Settings) => setSettings(saveSettings(s));

  // The speech length the estimate is paced against — editable, persisted here so
  // the per-card chips and the bar agree. The live countdown still comes from the
  // running speech timer (passed through as `timer`).
  const [targetSec, setTargetSec] = useState<number>(() => loadSpeechSec());
  const setTarget = (s: number) => setTargetSec(saveSpeechSec(s));

  // Pacing planner: the running read time down the doc. Computed over PREFIXES so
  // fatigue ramps progressively (later cards cost more) and the final cumulative
  // lands exactly on the whole-doc estimate. The cut line falls before the first
  // card whose cumulative time passes your speech length.
  const [plan, setPlan] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);

  // Flatten the read doc into a word stream for the focus reader: each card's
  // tag + cite read at tag pace, its body at card pace.
  const focusWords = useMemo<FocusWord[]>(() => {
    const out: FocusWord[] = [];
    const push = (text: string, kind: "tag" | "body") => {
      for (const w of text.trim().match(/\S+/g) ?? []) out.push({ text: w, kind });
    };
    for (const s of segs) {
      if (s.heading?.text) push(s.heading.text, "tag");
      if (s.cite) push(s.cite, "tag");
      if (s.body) push(s.body, "body");
    }
    return out;
  }, [segs]);
  const planData = useMemo(() => {
    let bw = 0, tw = 0, bLenW = 0, tLenW = 0;
    const cum: number[] = [];
    for (const s of segs) {
      bw += s.bodyWords; tw += s.tagWords;
      bLenW += s.bodyLen * s.bodyWords; tLenW += s.tagLen * s.tagWords;
      cum.push(estimateSeconds(bw, tw, bw ? bLenW / bw : 0, tw ? tLenW / tw : 0, eff));
    }
    const total = cum.length ? cum[cum.length - 1] : 0;
    const cutIndex = cum.findIndex((t) => t > targetSec);
    return { cum, total, cutIndex };
  }, [segs, eff, targetSec]);
  const belowCount = planData.cutIndex >= 0 ? segs.length - planData.cutIndex : 0;

  // ── Pace cursor ─────────────────────────────────────────────────────────────
  // A highlight that advances word-by-word at the calibrated reading speed — it
  // travels horizontally along each line and wraps — so you can glance and see
  // whether you're ahead of or behind where you "should" be. Self-contained
  // play/pause/reset; toggled on or off.
  const docRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const [paceOn, setPaceOn] = useState(false);
  const [pacePlaying, setPacePlaying] = useState(false);
  const [paceElapsed, setPaceElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const lastSecRef = useRef(-1);

  // Per-word cumulative seconds at the calibrated pace, aligned with the word
  // spans rendered in the doc (by data-wi index) when the pacer is on.
  const wordCum = useMemo(() => {
    const out: number[] = [];
    let acc = 0;
    for (const w of focusWords) { acc += baseWordSec(w, eff); out.push(acc); }
    return out;
  }, [focusWords, eff]);
  const paceTotal = wordCum.length ? wordCum[wordCum.length - 1] : 0;
  const wordCumRef = useRef(wordCum);
  useEffect(() => { wordCumRef.current = wordCum; }, [wordCum]);

  // Move the highlight onto the word you should be reading now; keep it in view.
  const positionMark = useCallback((elapsed: number, scroll: boolean) => {
    const mark = markRef.current, doc = docRef.current;
    if (!mark || !doc) return;
    const cum = wordCumRef.current;
    if (!cum.length) { mark.style.opacity = "0"; return; }
    let i = cum.findIndex((c) => c > elapsed);
    if (i === -1) i = cum.length - 1;
    const span = doc.querySelector<HTMLElement>(`[data-wi="${i}"]`);
    if (!span) { mark.style.opacity = "0"; return; }
    mark.style.opacity = "1";
    mark.style.transform = `translate(${span.offsetLeft}px, ${span.offsetTop}px)`;
    mark.style.width = `${span.offsetWidth}px`;
    mark.style.height = `${span.offsetHeight}px`;
    if (scroll) {
      const target = span.offsetTop + span.offsetHeight / 2 - doc.clientHeight * 0.42;
      doc.scrollTop = Math.max(0, Math.min(doc.scrollHeight - doc.clientHeight, target));
    }
  }, []);

  // Reposition when enabled, or when content / plan layout / size changes.
  useEffect(() => { if (paceOn) positionMark(elapsedRef.current, false); }, [paceOn, read, plan, positionMark]);
  useEffect(() => {
    if (!paceOn) return;
    const onResize = () => positionMark(elapsedRef.current, false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [paceOn, positionMark]);

  // The pacing loop: real elapsed time advances the highlight word-by-word at the
  // calibrated pace. The mark moves via direct DOM; the readout updates per second.
  useEffect(() => {
    if (!pacePlaying) return;
    lastTsRef.current = 0;
    const frame = (ts: number) => {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      const cum = wordCumRef.current;
      const total = cum.length ? cum[cum.length - 1] : 0;
      elapsedRef.current = Math.min(total, elapsedRef.current + dt);
      positionMark(elapsedRef.current, true);
      const sec = Math.floor(elapsedRef.current);
      if (sec !== lastSecRef.current) { lastSecRef.current = sec; setPaceElapsed(elapsedRef.current); }
      if (elapsedRef.current >= total) { setPacePlaying(false); return; }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [pacePlaying, positionMark]);

  const togglePace = () => setPaceOn((on) => { if (on) setPacePlaying(false); return !on; });
  const pacePlayPause = () => {
    const cum = wordCumRef.current;
    if (elapsedRef.current >= (cum.length ? cum[cum.length - 1] : 0)) { elapsedRef.current = 0; setPaceElapsed(0); lastSecRef.current = -1; }
    setPacePlaying((p) => !p);
  };
  const paceReset = () => {
    elapsedRef.current = 0; setPaceElapsed(0); lastSecRef.current = -1;
    positionMark(0, true);
  };

  // Tokenize a text part into indexed word spans (only used when the pacer is on),
  // so the highlight can land on a specific word. `wi` runs across the whole doc in
  // the same order as wordCum (each card's tag, then cite, then body).
  let wi = 0;
  const renderWords = (text: string) =>
    (text.trim().match(/\S+/g) ?? []).map((w, k) => {
      const idx = wi++;
      return <Fragment key={idx}>{k > 0 ? " " : ""}<span className="rd-w" data-wi={idx}>{w}</span></Fragment>;
    });

  return (
    <div className="flow-readview">
      <div className="flow-readview__bar">
        <ReadTimer analysis={analysis} settings={settings} onSave={save} timer={timer} targetSec={targetSec} onTarget={setTarget} />
        <span className="flow-sendedit__spacer" />
        <button
          className="db-btn db-btn--glass db-btn--sm"
          disabled={empty}
          onClick={() => setFocusOpen(true)}
          title="Read it back word-by-word at your calibrated pace"
        >
          <BookOpen size={14} /> Focus read
        </button>
        <button
          className={`db-btn db-btn--glass db-btn--sm ${paceOn ? "is-active" : ""}`}
          disabled={empty}
          onClick={togglePace}
          title="Show a pace cursor that moves down the doc at your calibrated reading speed"
        >
          <Crosshair size={14} /> Pace
        </button>
        <button
          className={`db-btn db-btn--glass db-btn--sm ${plan ? "is-active" : ""}`}
          disabled={empty}
          onClick={() => setPlan((p) => !p)}
          title="Mark where the speech clock runs out, so you can see what to cut"
        >
          <Scissors size={14} /> Plan{plan && belowCount > 0 ? ` · ${belowCount} below` : ""}
        </button>
        <button
          className="db-btn db-btn--accent db-btn--sm"
          disabled={empty}
          onClick={() => downloadHtmlAsDocx(read, "read-doc.docx")}
        >
          <Download size={15} /> Download .docx
        </button>
      </div>
      {empty ? (
        <p className="flow-readview__empty">
          Nothing to read yet. Highlight the text you plan to read in the Send doc, then it appears here.
        </p>
      ) : (
        <div className="flow-readview__doc" ref={docRef}>
          {paceOn && <div className="rd-pacemark" ref={markRef} aria-hidden />}
          {segs.map((seg, i) => {
            const showChip = seg.bodyWords > 0 || !!seg.cite;
            const sec = estimateSeconds(seg.bodyWords, seg.tagWords, seg.bodyLen, seg.tagLen, eff);
            const chip = showChip ? (
              <span className="rd-chip" title="Estimated read time for this card · running total at this point">
                ~{fmt(sec)}{plan && <span className="rd-cum"> · {fmt(planData.cum[i])}</span>}
              </span>
            ) : null;
            const level = Math.min(4, Math.max(1, seg.heading?.level ?? 4));
            const over = plan && planData.cutIndex >= 0 && i >= planData.cutIndex;
            const canCut = !!onCutCard && showChip && seg.ho != null;
            return (
              <Fragment key={seg.key}>
                {plan && planData.cutIndex === i && (
                  <div className="rd-cutline" aria-label={`Speech clock (${fmt(targetSec)}) runs out here`}>
                    <Scissors size={13} />
                    <span>{fmt(targetSec)} — read above, cut below</span>
                  </div>
                )}
                <div
                  className={`rd-seg ${over ? "rd-seg--over" : ""} ${canCut ? "rd-seg--cut" : ""}`}
                  onDoubleClick={canCut ? () => onCutCard!(seg.ho!, plan ? "delete" : "red") : undefined}
                  title={canCut ? (plan
                    ? "Double-click: delete this card from the Send doc and remove its flow point"
                    : "Double-click: cut this card (turns red in the Send doc) and remove its flow point") : undefined}
                >
                  {seg.heading && createElement(
                    `h${level}`,
                    { className: chip ? "rd-head" : undefined },
                    paceOn ? <span className="rd-hw">{renderWords(seg.heading.text)}</span> : seg.heading.text, chip,
                  )}
                  {seg.cite && <p className="rd-cite"><b>{paceOn ? renderWords(seg.cite) : seg.cite}</b></p>}
                  {seg.body && (
                    <p>
                      {!seg.heading && chip}
                      {paceOn ? renderWords(seg.body) : seg.body}
                    </p>
                  )}
                </div>
              </Fragment>
            );
          })}
        </div>
      )}
      {paceOn && !empty && (
        <div className="rd-pacebar" role="group" aria-label="Pace cursor">
          <button className="rd-pacebar__btn" onClick={pacePlayPause} aria-label={pacePlaying ? "Pause" : "Play"} title={pacePlaying ? "Pause" : "Play"}>
            {pacePlaying ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button className="rd-pacebar__btn" onClick={paceReset} aria-label="Reset to top" title="Reset to top"><RotateCcw size={14} /></button>
          <span className="rd-pacebar__time">{fmt(paceElapsed)} <i>/ {fmt(paceTotal)}</i></span>
        </div>
      )}
      {focusOpen && <ReadFocus words={focusWords} settings={eff} onClose={() => setFocusOpen(false)} />}
    </div>
  );
}
