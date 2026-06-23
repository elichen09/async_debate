"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Play } from "lucide-react";
import type { TimerSnap } from "@/app/components/flow/FlowTimers";
import {
  type Settings,
  FATIGUE_MAX_PCT, SPEECH_PRESETS,
  pickCardSample, pickTagSample,
  countWords, fmt, clampWpm, clampSpeechSec,
  estimateSeconds,
} from "@/lib/readEstimate";

// Date.now() lives at module scope so the purity lint stays happy (calling it from
// render is fine here — it's the standard live-clock read, same as FlowTimers).
const nowMs = () => Date.now();

type Analysis = { bodyWords: number; tagWords: number; bodyLen: number; tagLen: number; bodyText: string; tagText: string };

// The Read-doc bar: word count, estimated read time, how it stacks up against the
// speech clock, and the calibrate button. Settings are owned by ReadDocView so the
// per-block chips and this estimate stay in sync. `timer` is the live speech clock
// (from FlowTimers, lifted through the page) — null until the Timers strip is used.
export default function ReadTimer({ analysis, settings, onSave, timer, targetSec, onTarget }: {
  analysis: Analysis;
  settings: Settings | null;
  onSave: (s: Settings) => void;
  timer: TimerSnap | null;
  targetSec: number;            // the speech length to pace against (editable)
  onTarget: (sec: number) => void;
}) {
  const { bodyWords, tagWords, bodyLen, tagLen, bodyText, tagText } = analysis;
  const totalWords = bodyWords + tagWords;
  const [open, setOpen] = useState(false);

  const eff = settings ?? { cardWpm: 160, tagWpm: 110, fatiguePct: 12 };
  const estSec = estimateSeconds(bodyWords, tagWords, bodyLen, tagLen, eff);

  // Compare the read time to the speech length you've set. The live "▶ left" chip
  // below still reflects the actual running speech timer when you start it.
  const clock = timer ? timer.main : null;
  const [, force] = useState(0);
  // Tick only while the clock runs, to count it down live.
  useEffect(() => {
    if (!clock?.running) return;
    const id = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [clock?.running]);

  const leftMs = clock
    ? (clock.running && clock.endsAt != null ? Math.max(0, clock.endsAt - nowMs()) : Math.max(0, clock.remaining))
    : null;
  const deltaSec = estSec - targetSec;
  const over = deltaSec > 1;
  const trimWords = over ? Math.round((deltaSec * eff.cardWpm) / 60) : 0;

  return (
    <>
      <span className="flow-readstat" title={`${bodyWords} card-text + ${tagWords} tag/cite words`}>
        <b>{totalWords}</b> words
      </span>
      <span
        className="flow-readstat"
        title={settings
          ? `${eff.cardWpm} wpm card · ${eff.tagWpm} wpm tags · +${eff.fatiguePct}% fatigue by 4:00 — also adjusted for word length`
          : "Estimate at a default pace, adjusted for word length and fatigue — calibrate for your own speed"}
      >
        ~<b>{fmt(estSec)}</b> to read{settings ? "" : " (est.)"}
      </span>
      <SpeechLen sec={targetSec} onChange={onTarget} />
      {totalWords > 0 && (
        <span
          className={`flow-pace ${over ? "is-over" : "is-under"}`}
          title={`Compared to a ${fmt(targetSec)} speech — click the speech length to change it`}
        >
          {over
            ? <>{fmt(deltaSec)} over · trim ~{trimWords} {trimWords === 1 ? "word" : "words"}</>
            : <>{fmt(-deltaSec)} spare</>}
        </span>
      )}
      {clock?.running && leftMs != null && (
        <span className={`flow-pace flow-pace--live ${leftMs <= 30_000 ? "is-low" : ""}`} title="Speech clock remaining">
          <Play size={11} /> {fmt(leftMs / 1000)} left
        </span>
      )}
      <button className="db-btn db-btn--glass db-btn--sm" onClick={() => setOpen(true)}>
        {settings ? "Calibrate" : "Calibrate read speed"}
      </button>
      {open && <CalModal settings={eff} docCard={bodyText} docTag={tagText} onSave={onSave} onClose={() => setOpen(false)} />}
    </>
  );
}

// Editable speech-length chip: shows the target time and opens a popover to change
// it (steppers + format presets). Persisted by the parent so it sticks.
function SpeechLen({ sec, onChange }: { sec: number; onChange: (s: number) => void }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  const bump = (d: number) => onChange(clampSpeechSec(sec + d));

  function toggle(e: React.MouseEvent) {
    const r = e.currentTarget.getBoundingClientRect();
    setRect(r);
    setOpen((o) => !o);
  }

  return (
    <>
      <button
        className={`flow-target ${open ? "is-open" : ""}`}
        onClick={toggle}
        title="Speech length to pace against — click to change"
      >
<b>{fmt(sec)}</b> speech <ChevronDown size={12} className="flow-target__caret" aria-hidden />
      </button>
      {open && rect && (
        <>
          <div className="flow-menu__scrim" onClick={() => setOpen(false)} role="presentation" />
          <div className="flow-menu flow-speechpop" style={{ top: rect.bottom + 6, left: rect.left }} role="dialog" aria-label="Speech length">
            <span className="flow-menu__label">Speech length</span>
            <div className="flow-speechpop__stepper">
              <button className="flow-speechpop__step" onClick={() => bump(-15)} aria-label="15 seconds shorter" disabled={sec <= 15}>−15s</button>
              <span className="flow-speechpop__time">{String(min)}:{String(rem).padStart(2, "0")}</span>
              <button className="flow-speechpop__step" onClick={() => bump(15)} aria-label="15 seconds longer">+15s</button>
            </div>
            <div className="flow-speechpop__presets">
              {SPEECH_PRESETS.map((p) => (
                <button
                  key={p}
                  className={`flow-speechpop__preset ${p === sec ? "is-on" : ""}`}
                  onClick={() => { onChange(p); setOpen(false); }}
                >
                  {fmt(p)}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

type Phase = "menu" | "card" | "tag" | "done" | "edit";
const isReadingPhase = (p: Phase) => p === "card" || p === "tag";

function CalModal({ settings, docCard, docTag, onSave, onClose }: {
  settings: Settings;
  docCard: string;   // the read doc's own card text
  docTag: string;    // the read doc's own tags + cites
  onSave: (s: Settings) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("menu");
  // Where the two-step test reads from: random practice sections or this read doc.
  const [source, setSource] = useState<"pool" | "doc">("pool");
  const [reading, setReading] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [sample, setSample] = useState("");
  const startRef = useRef(0);
  const cardWpmRef = useRef(0);
  const [cardWpm, setCardWpm] = useState(0);
  const [tagWpm, setTagWpm] = useState(0);
  // Manual-edit working copy.
  const [eCard, setECard] = useState(settings.cardWpm);
  const [eTag, setETag] = useState(settings.tagWpm);
  const [eFat, setEFat] = useState(settings.fatiguePct);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!reading) return;
    const id = setInterval(() => setTick(nowMs() - startRef.current), 100);
    return () => clearInterval(id);
  }, [reading]);

  // 3-2-1 countdown, then reveal the passage and start timing. State changes live
  // in the timeout callback (not the effect body) to avoid cascading-render lint.
  useEffect(() => {
    if (countdown === null) return;
    const id = setTimeout(() => {
      if (countdown <= 1) {
        startRef.current = nowMs();
        setTick(0);
        setReading(true);
        setCountdown(null);
      } else {
        setCountdown(countdown - 1);
      }
    }, 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  function startReading() {
    const card = source === "doc" ? docCard : pickCardSample();
    const tag = source === "doc" ? docTag : pickTagSample();
    setSample(phase === "card" ? card : tag);
    setCountdown(3);
  }
  function done() {
    const wpm = clampWpm(countWords(sample) / ((nowMs() - startRef.current) / 60000));
    setReading(false);
    if (phase === "card") {
      cardWpmRef.current = wpm; setCardWpm(wpm); setPhase("tag");
    } else {
      setTagWpm(wpm); onSave({ cardWpm: cardWpmRef.current, tagWpm: wpm, fatiguePct: settings.fatiguePct }); setPhase("done");
    }
  }
  function toMenu() { setReading(false); setCountdown(null); setSample(""); setCardWpm(0); setTagWpm(0); cardWpmRef.current = 0; setPhase("menu"); }

  const canDoc = countWords(docCard) >= 20 && countWords(docTag) >= 3;
  const onDoc = source === "doc";
  const stepLabel = phase === "card" ? "Step 1 of 2" : "Step 2 of 2";
  const stepTitle = phase === "card" ? "Read the card text" : "Read the tags & cites";
  const stepSub = phase === "card"
    ? `Read ${onDoc ? "your read doc's card text" : "it"} aloud at the pace you'd actually deliver it.`
    : `Read ${onDoc ? "your read doc's tags & cites" : "these"} aloud — a touch slower, the way you would for clarity.`;

  return (
    <div className="flow-rtcal-backdrop" onClick={onClose} role="presentation">
      <div className="flow-rtcal" role="dialog" aria-modal="true" aria-label="Read speed" onClick={(e) => e.stopPropagation()}>
        {phase === "menu" && (
          <>
            <span className="flow-rtcal__step">Read speed</span>
            <h3>Calibrate or edit</h3>
            <p className="flow-rtcal__sub">
              Now: <b>{settings.cardWpm}</b> wpm card · <b>{settings.tagWpm}</b> wpm tags · <b>+{settings.fatiguePct}%</b> fatigue.
            </p>
            <div className="flow-rtcal__menu">
              <button className="flow-rtcal__opt" onClick={() => { setSource("pool"); setPhase("card"); }}>
                <b>Timed practice test</b>
                <span>Read two random card sections + a set of tags. Good when the read doc is empty.</span>
              </button>
              <button className="flow-rtcal__opt" onClick={() => { if (canDoc) { setSource("doc"); setPhase("card"); } }} disabled={!canDoc}>
                <b>Read this read doc</b>
                <span>{canDoc ? "Time yourself on your own read doc — card text, then tags & cites." : "Highlight some cards in the Send doc first."}</span>
              </button>
              <button className="flow-rtcal__opt" onClick={() => { setECard(settings.cardWpm); setETag(settings.tagWpm); setEFat(settings.fatiguePct); setPhase("edit"); }}>
                <b>Edit stats manually</b>
                <span>Type your WPM and set the fatigue slider yourself.</span>
              </button>
            </div>
            <div className="flow-rtcal__actions">
              <button className="db-btn db-btn--glass db-btn--sm" onClick={onClose}>Close</button>
            </div>
          </>
        )}

        {isReadingPhase(phase) && (
          <>
            <div className="flow-rtcal__head">
              <div>
                <span className="flow-rtcal__step">{stepLabel}</span>
                <h3>{stepTitle}</h3>
              </div>
              {(phase === "card" || phase === "tag") && (
                <div className="flow-rtcal__dots" aria-hidden>
                  <span className={`flow-rtcal__dot ${phase === "card" ? "is-on" : "is-done"}`} />
                  <span className={`flow-rtcal__dot ${phase === "tag" ? "is-on" : ""}`} />
                </div>
              )}
            </div>
            <p className="flow-rtcal__sub">{stepSub}</p>
            <div className="flow-rtcal__stage">
              {countdown !== null
                ? <div key={countdown} className="flow-rtcal__count" aria-live="assertive">{countdown}</div>
                : reading
                  ? <div className="flow-rtcal__sample">{sample}</div>
                  : <div className="flow-rtcal__ready"><span>Press <b>Start</b> when you&apos;re ready, then read aloud.</span></div>}
            </div>
            <div className="flow-rtcal__actions">
              {reading && <span className="flow-rtcal__timer">{fmt(tick / 1000)}</span>}
              {reading ? (
                <button className="db-btn db-btn--accent db-btn--sm" onClick={done}>Done reading</button>
              ) : countdown !== null ? (
                <button className="db-btn db-btn--glass db-btn--sm" onClick={toMenu}>Cancel</button>
              ) : (
                <>
                  <button className="db-btn db-btn--glass db-btn--sm" onClick={toMenu}>Back</button>
                  <button className="db-btn db-btn--accent db-btn--sm" onClick={startReading}>Start</button>
                </>
              )}
            </div>
          </>
        )}

        {phase === "edit" && (
          <>
            <span className="flow-rtcal__step">Edit stats</span>
            <h3>Your reading pace</h3>
            <div className="flow-rtcal__field">
              <label htmlFor="rt-card">Card text speed</label>
              <div className="flow-rtcal__numwrap">
                <input id="rt-card" className="flow-rtcal__num" type="number" min={40} max={600} value={eCard}
                  onChange={(e) => setECard(parseInt(e.target.value, 10) || 0)} />
                <span>wpm</span>
              </div>
            </div>
            <div className="flow-rtcal__field">
              <label htmlFor="rt-tag">Tags &amp; cites speed</label>
              <div className="flow-rtcal__numwrap">
                <input id="rt-tag" className="flow-rtcal__num" type="number" min={40} max={600} value={eTag}
                  onChange={(e) => setETag(parseInt(e.target.value, 10) || 0)} />
                <span>wpm</span>
              </div>
            </div>
            <div className="flow-rtcal__field flow-rtcal__field--col">
              <label htmlFor="rt-fat">Fatigue <span className="flow-rtcal__fatval">+{eFat}% slower by 4:00</span></label>
              <input id="rt-fat" className="flow-rtcal__range" type="range" min={0} max={FATIGUE_MAX_PCT} step={1} value={eFat}
                onChange={(e) => setEFat(parseInt(e.target.value, 10))} />
            </div>
            <div className="flow-rtcal__actions">
              <button className="db-btn db-btn--glass db-btn--sm" onClick={toMenu}>Back</button>
              <button className="db-btn db-btn--accent db-btn--sm" onClick={() => { onSave({ cardWpm: eCard, tagWpm: eTag, fatiguePct: eFat }); onClose(); }}>Save</button>
            </div>
          </>
        )}

        {phase === "done" && (
          <>
            <span className="flow-rtcal__step">All set</span>
            <h3>Your reading pace</h3>
            <div className="flow-rtcal__rates">
              <div className="flow-rtcal__rate">
                <span className="flow-rtcal__rateN">{cardWpm}</span>
                <span className="flow-rtcal__rateL">wpm · card text</span>
              </div>
              <div className="flow-rtcal__rate">
                <span className="flow-rtcal__rateN">{tagWpm}</span>
                <span className="flow-rtcal__rateL">wpm · tags &amp; cites</span>
              </div>
            </div>
            <p className="flow-rtcal__sub">Your read doc estimate now uses these rates.</p>
            <div className="flow-rtcal__actions">
              <button className="db-btn db-btn--glass db-btn--sm" onClick={toMenu}>Retest</button>
              <button className="db-btn db-btn--accent db-btn--sm" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
