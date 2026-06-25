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
  // A line that descends the read doc at the calibrated reading speed, so you can
  // glance and see whether you're ahead of or behind where you "should" be.
  // Self-contained play/pause/reset; toggled on or off.
  const docRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const [paceOn, setPaceOn] = useState(false);
  const [pacePlaying, setPacePlaying] = useState(false);
  const [paceElapsed, setPaceElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const lastSecRef = useRef(-1);
  const measureRef = useRef<{ cards: { top: number; h: number }[]; clientH: number; scrollH: number }>({ cards: [], clientH: 0, scrollH: 0 });
  const planRef = useRef(planData);
  useEffect(() => { planRef.current = planData; }, [planData]);

  // Cache card offsets + scroll metrics so the descent loop never forces a reflow.
  const measure = useCallback(() => {
    const doc = docRef.current;
    if (!doc) { measureRef.current = { cards: [], clientH: 0, scrollH: 0 }; return; }
    measureRef.current = {
      cards: Array.from(doc.querySelectorAll<HTMLElement>(".rd-seg")).map((el) => ({ top: el.offsetTop, h: el.offsetHeight })),
      clientH: doc.clientHeight,
      scrollH: doc.scrollHeight,
    };
  }, []);

  // Map calibrated elapsed seconds → a vertical position (which card, how far into
  // it), then move the line there and keep it in view.
  const positionLine = useCallback((elapsed: number, scroll: boolean) => {
    const line = lineRef.current, doc = docRef.current;
    if (!line || !doc) return;
    const cum = planRef.current.cum;
    const { cards, clientH, scrollH } = measureRef.current;
    if (!cum.length || !cards.length) return;
    let i = cum.findIndex((c) => c > elapsed);
    if (i === -1) i = cum.length - 1;
    i = Math.min(i, cards.length - 1);
    const start = i > 0 ? cum[i - 1] : 0;
    const dur = (cum[i] - start) || 1;
    const frac = Math.min(1, Math.max(0, (elapsed - start) / dur));
    const y = cards[i].top + frac * cards[i].h;
    line.style.transform = `translateY(${y}px)`;
    if (scroll) doc.scrollTop = Math.max(0, Math.min(scrollH - clientH, y - clientH * 0.42));
  }, []);

  // Re-measure + reposition when enabled, or when content / plan layout changes.
  useEffect(() => {
    if (!paceOn) return;
    measure();
    positionLine(elapsedRef.current, false);
  }, [paceOn, read, plan, measure, positionLine]);

  useEffect(() => {
    if (!paceOn) return;
    const onResize = () => { measure(); positionLine(elapsedRef.current, false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [paceOn, measure, positionLine]);

  // The descent loop: real elapsed time advances the line at the calibrated pace.
  // The line moves via direct DOM (smooth); the readout re-renders only per second.
  useEffect(() => {
    if (!pacePlaying) return;
    lastTsRef.current = 0;
    const frame = (ts: number) => {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      const total = planRef.current.total || 0;
      elapsedRef.current = Math.min(total, elapsedRef.current + dt);
      positionLine(elapsedRef.current, true);
      const sec = Math.floor(elapsedRef.current);
      if (sec !== lastSecRef.current) { lastSecRef.current = sec; setPaceElapsed(elapsedRef.current); }
      if (elapsedRef.current >= total) { setPacePlaying(false); return; }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [pacePlaying, positionLine]);

  const togglePace = () => setPaceOn((on) => { if (on) setPacePlaying(false); return !on; });
  const pacePlayPause = () => {
    if (elapsedRef.current >= (planRef.current.total || 0)) { elapsedRef.current = 0; setPaceElapsed(0); lastSecRef.current = -1; }
    measure();
    setPacePlaying((p) => !p);
  };
  const paceReset = () => {
    elapsedRef.current = 0; setPaceElapsed(0); lastSecRef.current = -1;
    measure(); positionLine(0, true);
  };

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
          {paceOn && <div className="rd-paceline" ref={lineRef} aria-hidden />}
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
                    seg.heading.text, chip,
                  )}
                  {seg.cite && <p className="rd-cite"><b>{seg.cite}</b></p>}
                  {seg.body && (
                    <p>
                      {!seg.heading && chip}
                      {seg.body}
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
          <span className="rd-pacebar__time">{fmt(paceElapsed)} <i>/ {fmt(planData.total)}</i></span>
        </div>
      )}
      {focusOpen && <ReadFocus words={focusWords} settings={eff} onClose={() => setFocusOpen(false)} />}
    </div>
  );
}
